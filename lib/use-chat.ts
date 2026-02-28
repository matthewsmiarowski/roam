/**
 * Custom hook for managing the SSE chat connection.
 *
 * Connects the /api/chat streaming endpoint to the conversation
 * state reducer. Handles sending messages, parsing SSE events,
 * and dispatching appropriate actions.
 */

'use client';

import { useReducer, useCallback, useRef, useEffect } from 'react';
import { conversationReducer, initialState } from './conversation-state';
import { summarizeRouteOptions } from './conversation';
import { stitchSegments } from './routing';
import type {
  ConversationState,
  ConversationAction,
  RouteOption,
  RouteSegment,
  RouteWaypoint,
} from './types';

interface UseChatReturn {
  state: ConversationState;
  sendMessage: (content: string) => void;
  selectRoute: (index: number) => void;
  backToOptions: () => void;
  setStartPoint: (point: { lat: number; lng: number } | null) => void;
  reset: () => void;
  moveWaypoint: (waypointIndex: number, lat: number, lng: number) => void;
  addWaypoint: (afterSegmentIndex: number, lat: number, lng: number) => void;
  removeWaypoint: (waypointIndex: number) => void;
  selectWaypoint: (index: number | null) => void;
}

/** Call the segment re-routing API for a single leg. */
async function fetchSegment(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal: AbortSignal
): Promise<RouteSegment> {
  const res = await fetch('/api/route/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { lat: from.lat, lng: from.lng },
      to: { lat: to.lat, lng: to.lng },
    }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Routing failed' }));
    throw new Error(data.error || 'Routing failed');
  }
  const data = await res.json();
  return {
    from: { lat: from.lat, lng: from.lng },
    to: { lat: to.lat, lng: to.lng },
    geometry: data.geometry,
    distance_km: data.distance_km,
    elevation_gain_m: data.elevation_gain_m,
  };
}

export function useChat(): UseChatReturn {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const rerouteAbortRef = useRef<AbortController | null>(null);

  // Ref to access latest editing state from async callbacks without stale closures
  const editingRef = useRef(state.editing);
  useEffect(() => {
    editingRef.current = state.editing;
  }, [state.editing]);

  // Request browser geolocation once on mount
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        dispatch({
          type: 'SET_USER_LOCATION',
          location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        });
      },
      () => {
        // Geolocation denied or unavailable — proceed without it
      },
      { timeout: 5000 }
    );
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      // Abort any in-flight request
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      dispatch({ type: 'ADD_USER_MESSAGE', content: trimmed });
      dispatch({ type: 'START_STREAMING' });

      try {
        // Build message history for the API (cap at 20 messages, exclude welcome)
        const historyMessages = [
          ...state.messages,
          { id: '', role: 'user' as const, content: trimmed, timestamp: 0 },
        ]
          .filter((m) => m.id !== 'welcome')
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: historyMessages,
            user_location: state.userLocation ?? undefined,
            start_coordinates: state.startPoint ?? undefined,
          }),
          signal: abort.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ message: 'Request failed.' }));
          dispatch({ type: 'SET_ERROR', message: data.message || 'Request failed.' });
          return;
        }

        if (!res.body) {
          dispatch({ type: 'SET_ERROR', message: 'No response body.' });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';
        let currentEvent = '';
        let currentData = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);

              if (currentEvent && currentData) {
                try {
                  const parsed = JSON.parse(currentData);
                  handleSSEEvent(currentEvent, parsed, dispatch, accumulatedText, (text) => {
                    accumulatedText = text;
                  });
                } catch {
                  // Skip malformed events
                }
                currentEvent = '';
                currentData = '';
              }
            }
          }
        }

        // If we accumulated text but never got routes, finalize as a chat message
        if (accumulatedText) {
          dispatch({ type: 'FINISH_STREAMING', content: accumulatedText });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return; // User sent a new message, ignore abort
        }
        dispatch({
          type: 'SET_ERROR',
          message: 'Connection lost. Please try again.',
        });
      }
    },
    [state.messages, state.userLocation, state.startPoint]
  );

  const selectRoute = useCallback((index: number) => {
    dispatch({ type: 'SELECT_ROUTE', index });
  }, []);

  const backToOptions = useCallback(() => {
    dispatch({ type: 'BACK_TO_OPTIONS' });
  }, []);

  const setStartPoint = useCallback((point: { lat: number; lng: number } | null) => {
    dispatch({ type: 'SET_START_POINT', point });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'RESET' });
  }, []);

  // --- v2 editing methods ---

  const selectWaypoint = useCallback((index: number | null) => {
    dispatch({ type: 'SELECT_WAYPOINT', index });
  }, []);

  const moveWaypoint = useCallback(
    async (waypointIndex: number, lat: number, lng: number) => {
      const editing = editingRef.current;
      if (!editing) return;

      // Guard: waypoint index must be valid
      const oldWp = editing.waypoints[waypointIndex];
      if (!oldWp) return;

      rerouteAbortRef.current?.abort();
      const abort = new AbortController();
      rerouteAbortRef.current = abort;

      // Optimistic position update so the marker stays at the dragged position
      dispatch({ type: 'UPDATE_WAYPOINT', waypointIndex, lat, lng });
      dispatch({ type: 'START_REROUTING' });

      // Compute new waypoints
      const newWaypoints = editing.waypoints.map((wp, i) =>
        i === waypointIndex ? { ...wp, lat, lng } : wp
      );

      try {
        // Route the 1-2 affected segments in parallel
        const promises: Promise<{ index: number; segment: RouteSegment }>[] = [];

        if (waypointIndex > 0) {
          const segIdx = waypointIndex - 1;
          promises.push(
            fetchSegment(newWaypoints[segIdx], newWaypoints[segIdx + 1], abort.signal).then(
              (segment) => ({ index: segIdx, segment })
            )
          );
        }
        if (waypointIndex < newWaypoints.length - 1) {
          const segIdx = waypointIndex;
          promises.push(
            fetchSegment(newWaypoints[segIdx], newWaypoints[segIdx + 1], abort.signal).then(
              (segment) => ({ index: segIdx, segment })
            )
          );
        }

        const results = await Promise.all(promises);

        // Splice new segments into the array (untouched segments stay identical)
        const newSegments = [...editing.segments];
        for (const { index, segment } of results) {
          newSegments[index] = segment;
        }

        const stitched = stitchSegments(newSegments);
        dispatch({
          type: 'FINISH_REROUTING',
          segments: newSegments,
          waypoints: newWaypoints,
          geometry: stitched.geometry,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        dispatch({
          type: 'REROUTING_ERROR',
          message: error instanceof Error ? error.message : 'Routing failed',
        });
        // Revert waypoint to pre-drag position
        dispatch({ type: 'UPDATE_WAYPOINT', waypointIndex, lat: oldWp.lat, lng: oldWp.lng });
      }
    },
    []
  );

  const addWaypoint = useCallback(
    async (afterSegmentIndex: number, lat: number, lng: number) => {
      const editing = editingRef.current;
      if (!editing) return;

      rerouteAbortRef.current?.abort();
      const abort = new AbortController();
      rerouteAbortRef.current = abort;

      dispatch({ type: 'START_REROUTING' });

      // Compute new waypoints with the inserted point
      const insertAt = afterSegmentIndex + 1;
      const newWp: RouteWaypoint = {
        id: crypto.randomUUID(),
        lat,
        lng,
        type: 'via',
      };
      const newWaypoints = [
        ...editing.waypoints.slice(0, insertAt),
        newWp,
        ...editing.waypoints.slice(insertAt),
      ];

      try {
        // The old segment at afterSegmentIndex splits into two
        const [seg1, seg2] = await Promise.all([
          fetchSegment(newWaypoints[afterSegmentIndex], newWaypoints[afterSegmentIndex + 1], abort.signal),
          fetchSegment(newWaypoints[afterSegmentIndex + 1], newWaypoints[afterSegmentIndex + 2], abort.signal),
        ]);

        const newSegments = [
          ...editing.segments.slice(0, afterSegmentIndex),
          seg1,
          seg2,
          ...editing.segments.slice(afterSegmentIndex + 1),
        ];

        const stitched = stitchSegments(newSegments);
        dispatch({
          type: 'FINISH_REROUTING',
          segments: newSegments,
          waypoints: newWaypoints,
          geometry: stitched.geometry,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        dispatch({
          type: 'REROUTING_ERROR',
          message: error instanceof Error ? error.message : 'Routing failed',
        });
      }
    },
    []
  );

  const removeWaypoint = useCallback(
    async (waypointIndex: number) => {
      const editing = editingRef.current;
      if (!editing) return;

      const wp = editing.waypoints[waypointIndex];
      if (!wp || wp.type !== 'via') return;

      // Must keep at least 1 via waypoint
      const viaCount = editing.waypoints.filter((w) => w.type === 'via').length;
      if (viaCount <= 1) return;

      rerouteAbortRef.current?.abort();
      const abort = new AbortController();
      rerouteAbortRef.current = abort;

      dispatch({ type: 'START_REROUTING' });

      // Compute new waypoints with the point removed
      const newWaypoints = editing.waypoints.filter((_, i) => i !== waypointIndex);

      try {
        // The two segments adjacent to the removed waypoint merge into one
        // In the new array, this segment goes from newWaypoints[waypointIndex-1] to newWaypoints[waypointIndex]
        const newSeg = await fetchSegment(
          newWaypoints[waypointIndex - 1],
          newWaypoints[waypointIndex],
          abort.signal
        );

        const newSegments = [
          ...editing.segments.slice(0, waypointIndex - 1),
          newSeg,
          ...editing.segments.slice(waypointIndex + 1),
        ];

        const stitched = stitchSegments(newSegments);
        dispatch({
          type: 'FINISH_REROUTING',
          segments: newSegments,
          waypoints: newWaypoints,
          geometry: stitched.geometry,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        dispatch({
          type: 'REROUTING_ERROR',
          message: error instanceof Error ? error.message : 'Routing failed',
        });
      }
    },
    []
  );

  return {
    state,
    sendMessage,
    selectRoute,
    backToOptions,
    setStartPoint,
    reset,
    moveWaypoint,
    addWaypoint,
    removeWaypoint,
    selectWaypoint,
  };
}

/** Process a single SSE event and dispatch the appropriate action. */
function handleSSEEvent(
  event: string,
  data: Record<string, unknown>,
  dispatch: React.Dispatch<ConversationAction>,
  accumulatedText: string,
  setAccumulatedText: (text: string) => void
): void {
  switch (event) {
    case 'text':
      setAccumulatedText(accumulatedText + (data.chunk as string));
      dispatch({ type: 'APPEND_STREAM_CHUNK', chunk: data.chunk as string });
      break;

    case 'generating':
      // The AI acknowledged and is now generating routes
      // The generating message was already streamed as text, keep it
      break;

    case 'routes': {
      const options = data.options as RouteOption[];
      const summary = summarizeRouteOptions(options);
      const aiMessage = accumulatedText ? `${accumulatedText}\n\n${summary}` : summary;
      dispatch({ type: 'SET_ROUTE_OPTIONS', options, aiMessage });
      setAccumulatedText(''); // Consumed into the route message
      break;
    }

    case 'error':
      dispatch({ type: 'SET_ERROR', message: data.message as string });
      setAccumulatedText('');
      break;

    case 'done':
      // Stream complete — if we still have text, FINISH_STREAMING handles it
      // in the outer loop after the reader is done
      break;
  }
}
