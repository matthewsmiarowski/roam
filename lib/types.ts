/**
 * Shared types used across lib modules, the API route, and the frontend.
 *
 * Single source of truth — import from here, not from individual modules.
 */

export type { LatLng } from './geo';

/** 3D coordinate: [latitude, longitude, elevation in meters]. */
export type Coordinate3D = [number, number, number];

/** A single routed segment between two consecutive waypoints. */
export interface RouteSegment {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  geometry: Coordinate3D[];
  distance_km: number;
  elevation_gain_m: number;
}

/** An editable waypoint on a route. */
export interface RouteWaypoint {
  id: string;
  lat: number;
  lng: number;
  type: 'start' | 'via' | 'end';
}

/** Route data returned to the frontend. */
export interface RouteData {
  geometry: Coordinate3D[];
  distance_km: number;
  distance_mi: number;
  elevation_gain_m: number;
  elevation_gain_ft: number;
  start_point: { lat: number; lng: number };
  /** Segment data for editing (present on v2 stitched routes). */
  segments?: RouteSegment[];
  /** Editable waypoints (present on v2 stitched routes). */
  waypoints?: RouteWaypoint[];
}

/** LLM-extracted route parameters from a natural language prompt. */
export interface RouteParams {
  start_location: string;
  start_precision: 'exact' | 'general';
  target_distance_km: number;
  elevation_character: 'flat' | 'rolling' | 'hilly' | 'mountainous';
  road_preference: 'any' | 'quiet_roads' | 'bike_paths';
  waypoint_bearings: number[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Conversational Route Generation
// ---------------------------------------------------------------------------

/** A single chat message in the conversation. */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Attached route options (only on assistant messages that generated routes). */
  routeOptions?: RouteOption[];
  timestamp: number;
}

/** One of 3 route options presented to the user. */
export interface RouteOption {
  id: string;
  name: string;
  description: string;
  route: RouteData;
  gpx: string;
  color: string;
}

/** POST /api/chat request body. */
export interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  user_location?: { latitude: number; longitude: number };
  start_coordinates?: { lat: number; lng: number };
}

/** Server-Sent Event types from /api/chat. */
export type ChatSSEEvent =
  | { event: 'text'; data: { chunk: string } }
  | { event: 'generating'; data: { message: string } }
  | { event: 'routes'; data: { options: RouteOption[] } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: Record<string, never> };

/** A route variant as returned by the LLM's generate_routes tool. */
export interface RouteVariant {
  name: string;
  description: string;
  waypoint_bearings: number[];
  named_waypoints?: { name: string; approximate_location: string }[];
}

/** Full LLM output from the generate_routes tool call. */
export interface GenerateRoutesParams {
  start_location: string;
  start_precision: 'exact' | 'general';
  target_distance_km: number;
  elevation_character: 'flat' | 'rolling' | 'hilly' | 'mountainous';
  road_preference: 'any' | 'quiet_roads' | 'bike_paths';
  route_variants: RouteVariant[];
  reasoning: string;
}

/** Editing state for v2 waypoint editing. */
export interface EditingState {
  waypoints: RouteWaypoint[];
  segments: RouteSegment[];
  /** Pre-computed stitched geometry (concatenation of all segments). */
  geometry: Coordinate3D[];
  isRerouting: boolean;
  selectedWaypointIndex: number | null;
  /** Error message from the last rerouting attempt, if it failed. */
  error: string | null;
}

/** Frontend conversation state. */
export interface ConversationState {
  phase: 'chatting' | 'generating' | 'options' | 'detail';
  messages: Message[];
  streamingText: string | null;
  routeOptions: RouteOption[] | null;
  selectedRouteIndex: number | null;
  userLocation: { latitude: number; longitude: number } | null;
  startPoint: { lat: number; lng: number } | null;
  /** Non-null when in detail phase with an editable route. */
  editing: EditingState | null;
}

/** Reducer actions for conversation state. */
export type ConversationAction =
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'START_STREAMING' }
  | { type: 'APPEND_STREAM_CHUNK'; chunk: string }
  | { type: 'FINISH_STREAMING'; content: string }
  | { type: 'SET_ROUTE_OPTIONS'; options: RouteOption[]; aiMessage: string }
  | { type: 'SELECT_ROUTE'; index: number }
  | { type: 'BACK_TO_OPTIONS' }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'SET_USER_LOCATION'; location: { latitude: number; longitude: number } }
  | { type: 'SET_START_POINT'; point: { lat: number; lng: number } | null }
  | { type: 'RESET' }
  // v2 editing actions
  | { type: 'UPDATE_WAYPOINT'; waypointIndex: number; lat: number; lng: number }
  | { type: 'ADD_WAYPOINT'; afterSegmentIndex: number; lat: number; lng: number }
  | { type: 'REMOVE_WAYPOINT'; waypointIndex: number }
  | { type: 'SELECT_WAYPOINT'; index: number | null }
  | { type: 'START_REROUTING' }
  | {
      type: 'FINISH_REROUTING';
      segments: RouteSegment[];
      waypoints: RouteWaypoint[];
      geometry: Coordinate3D[];
    }
  | { type: 'REROUTING_ERROR'; message: string };
