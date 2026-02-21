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
import type { ConversationState, ConversationAction, RouteOption } from './types';

interface UseChatReturn {
  state: ConversationState;
  sendMessage: (content: string) => void;
  selectRoute: (index: number) => void;
  backToOptions: () => void;
  setStartPoint: (point: { lat: number; lng: number } | null) => void;
  reset: () => void;
}

export function useChat(): UseChatReturn {
  const [state, dispatch] = useReducer(conversationReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

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

  return { state, sendMessage, selectRoute, backToOptions, setStartPoint, reset };
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
