/**
 * Shared types used across lib modules, the API route, and the frontend.
 *
 * Single source of truth — import from here, not from individual modules.
 */

export type { LatLng } from './geo';

/** 3D coordinate: [latitude, longitude, elevation in meters]. */
export type Coordinate3D = [number, number, number];

/** Route data returned to the frontend. */
export interface RouteData {
  geometry: Coordinate3D[];
  distance_km: number;
  distance_mi: number;
  elevation_gain_m: number;
  elevation_gain_ft: number;
  start_point: { lat: number; lng: number };
}

/** LLM-extracted route parameters from a natural language prompt. */
export interface RouteParams {
  start_location: string;
  target_distance_km: number;
  elevation_character: 'flat' | 'rolling' | 'hilly' | 'mountainous';
  road_preference: 'any' | 'quiet_roads' | 'bike_paths';
  waypoint_bearings: number[];
  reasoning: string;
}

/** POST /api/generate-route request body. */
export interface GenerateRouteRequest {
  prompt: string;
  user_location?: { latitude: number; longitude: number };
}

/** POST /api/generate-route success response. */
export interface GenerateRouteResponse {
  route: RouteData;
  gpx: string;
  metadata: {
    parsed_params: Omit<RouteParams, 'waypoint_bearings' | 'reasoning'>;
    llm_reasoning: string;
  };
}

/** POST /api/generate-route error response. */
export interface GenerateRouteError {
  status: 'error';
  message: string;
}

/** Frontend state machine. */
export type AppState =
  | { status: 'idle' }
  | { status: 'loading'; prompt: string }
  | {
      status: 'success';
      route: RouteData;
      gpx: string;
      metadata: GenerateRouteResponse['metadata'];
    }
  | { status: 'error'; message: string };
