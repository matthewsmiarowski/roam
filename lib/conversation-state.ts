/**
 * Conversation state reducer for the v1 chat UI.
 *
 * Pure logic — no React dependency. Testable independently.
 */

import type {
  ConversationState,
  ConversationAction,
  EditingState,
  Message,
  RouteWaypoint,
} from './types';
import { stitchSegments } from './routing';
import { generateGpx } from './gpx';

export const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hey! I'm Roam. Tell me about the ride you're looking for — where, how far, what kind of terrain. Or click the map to set a start point.",
  timestamp: 0,
};

export const initialState: ConversationState = {
  phase: 'chatting',
  messages: [WELCOME_MESSAGE],
  streamingText: null,
  routeOptions: null,
  selectedRouteIndex: null,
  userLocation: null,
  startPoint: null,
  editing: null,
};

export function createMessageId(): string {
  return crypto.randomUUID();
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        phase: 'generating',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'user',
            content: action.content,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
        routeOptions: null,
        selectedRouteIndex: null,
        editing: null,
      };

    case 'START_STREAMING':
      return {
        ...state,
        streamingText: '',
      };

    case 'APPEND_STREAM_CHUNK':
      return {
        ...state,
        streamingText: (state.streamingText ?? '') + action.chunk,
      };

    case 'FINISH_STREAMING':
      return {
        ...state,
        phase: 'chatting',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'assistant',
            content: action.content,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
      };

    case 'SET_ROUTE_OPTIONS':
      return {
        ...state,
        phase: 'options',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'assistant',
            content: action.aiMessage,
            routeOptions: action.options,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
        routeOptions: action.options,
        selectedRouteIndex: null,
      };

    case 'SELECT_ROUTE': {
      const selectedOption =
        state.routeOptions && state.routeOptions[action.index]
          ? state.routeOptions[action.index]
          : null;
      const route = selectedOption?.route;
      const editing: EditingState | null =
        route?.segments && route?.waypoints
          ? {
              waypoints: route.waypoints,
              segments: route.segments,
              geometry: route.geometry,
              isRerouting: false,
              selectedWaypointIndex: null,
              error: null,
            }
          : null;
      return {
        ...state,
        phase: 'detail',
        selectedRouteIndex: action.index,
        editing,
      };
    }

    case 'BACK_TO_OPTIONS':
      return {
        ...state,
        phase: 'options',
        selectedRouteIndex: null,
        editing: null,
      };

    case 'SET_ERROR':
      return {
        ...state,
        phase: 'chatting',
        messages: [
          ...state.messages,
          {
            id: createMessageId(),
            role: 'assistant',
            content: action.message,
            timestamp: Date.now(),
          },
        ],
        streamingText: null,
      };

    case 'SET_USER_LOCATION':
      return {
        ...state,
        userLocation: action.location,
      };

    case 'SET_START_POINT':
      return {
        ...state,
        startPoint: action.point,
      };

    case 'RESET':
      return {
        ...initialState,
        userLocation: state.userLocation,
        messages: [WELCOME_MESSAGE],
      };

    // --- v2 editing actions ---

    case 'UPDATE_WAYPOINT': {
      if (!state.editing) return state;
      const waypoints = state.editing.waypoints.map((wp, i) =>
        i === action.waypointIndex ? { ...wp, lat: action.lat, lng: action.lng } : wp
      );
      return { ...state, editing: { ...state.editing, waypoints } };
    }

    case 'ADD_WAYPOINT': {
      if (!state.editing) return state;
      const newWp: RouteWaypoint = {
        id: crypto.randomUUID(),
        lat: action.lat,
        lng: action.lng,
        type: 'via',
      };
      // Insert after the waypoint at afterSegmentIndex (which is the start of that segment)
      // Waypoint indices align with segment indices: segment[i] goes from waypoint[i] to waypoint[i+1]
      const insertAt = action.afterSegmentIndex + 1;
      const waypoints = [
        ...state.editing.waypoints.slice(0, insertAt),
        newWp,
        ...state.editing.waypoints.slice(insertAt),
      ];
      return { ...state, editing: { ...state.editing, waypoints } };
    }

    case 'REMOVE_WAYPOINT': {
      if (!state.editing) return state;
      const wp = state.editing.waypoints[action.waypointIndex];
      if (!wp || wp.type !== 'via') return state;
      const viaCount = state.editing.waypoints.filter((w) => w.type === 'via').length;
      if (viaCount <= 1) return state; // must keep at least 1 via waypoint
      const waypoints = state.editing.waypoints.filter((_, i) => i !== action.waypointIndex);
      return {
        ...state,
        editing: { ...state.editing, waypoints, selectedWaypointIndex: null },
      };
    }

    case 'SELECT_WAYPOINT':
      if (!state.editing) return state;
      return {
        ...state,
        editing: { ...state.editing, selectedWaypointIndex: action.index },
      };

    case 'START_REROUTING':
      if (!state.editing) return state;
      return {
        ...state,
        editing: { ...state.editing, isRerouting: true, error: null },
      };

    case 'FINISH_REROUTING': {
      if (!state.editing || !state.routeOptions || state.selectedRouteIndex === null) return state;

      // Update editing state with new segments and geometry
      const updatedEditing: EditingState = {
        ...state.editing,
        segments: action.segments,
        waypoints: action.waypoints,
        geometry: action.geometry,
        isRerouting: false,
        error: null,
      };

      // Also update the selected RouteOption so stats and GPX reflect edits
      const stitched = stitchSegments(action.segments);
      const updatedOptions = state.routeOptions.map((opt, i) => {
        if (i !== state.selectedRouteIndex) return opt;
        const updatedRoute = {
          ...opt.route,
          geometry: action.geometry,
          distance_km: Math.round(stitched.distance_km * 10) / 10,
          distance_mi: Math.round(stitched.distance_km * 0.621371 * 10) / 10,
          elevation_gain_m: Math.round(stitched.elevation_gain_m),
          elevation_gain_ft: Math.round(stitched.elevation_gain_m * 3.28084),
          segments: action.segments,
          waypoints: action.waypoints,
        };
        return {
          ...opt,
          route: updatedRoute,
          gpx: generateGpx(action.geometry, `Roam: ${opt.name}`),
        };
      });

      return {
        ...state,
        routeOptions: updatedOptions,
        editing: updatedEditing,
      };
    }

    case 'REROUTING_ERROR':
      if (!state.editing) return state;
      return {
        ...state,
        editing: { ...state.editing, isRerouting: false, error: action.message },
      };

    default:
      return state;
  }
}
