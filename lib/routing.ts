/**
 * Loop generation algorithm + GraphHopper integration.
 *
 * Takes LLM-extracted parameters and a geocoded start point,
 * generates waypoints using compass bearings, routes through
 * GraphHopper, and validates distance with retry.
 */

import { type LatLng, projectPoint } from './geo';
import type { RouteParams, RouteData, Coordinate3D } from './types';

const GRAPHHOPPER_BASE = 'https://graphhopper.com/api/1/route';
const STRETCH_FACTOR = 1.3;
const DISTANCE_TOLERANCE = 0.2;
const MAX_RETRIES = 3;
const MAX_WAYPOINTS = 3; // GraphHopper free tier allows max 5 points total (start + 3 waypoints + start)
const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;

interface GraphHopperPath {
  distance: number;
  ascend: number;
  descend: number;
  points: {
    coordinates: [number, number, number][]; // [lng, lat, ele]
  };
}

interface GraphHopperResponse {
  paths: GraphHopperPath[];
}

/**
 * Calculate the waypoint radius from a target distance.
 * Accounts for roads not being straight lines via stretch_factor.
 */
export function calculateRadius(targetDistanceKm: number): number {
  return targetDistanceKm / (2 * Math.PI * STRETCH_FACTOR);
}

/**
 * Generate waypoints by projecting points from start along compass bearings.
 */
export function generateWaypoints(start: LatLng, bearings: number[], radiusKm: number): LatLng[] {
  return bearings.map((bearing) => projectPoint(start, bearing, radiusKm));
}

/**
 * Calculate total elevation gain from a geometry array.
 * Sums only positive elevation changes.
 */
export function calculateElevationGain(geometry: Coordinate3D[]): number {
  let gain = 0;
  for (let i = 1; i < geometry.length; i++) {
    const diff = geometry[i][2] - geometry[i - 1][2];
    if (diff > 0) gain += diff;
  }
  return gain;
}

async function callGraphHopper(points: LatLng[]): Promise<GraphHopperResponse> {
  const allPoints = [points[0], ...points.slice(1), points[0]];

  const body = {
    points: allPoints.map((p) => [p.lng, p.lat]),
    profile: 'bike',
    points_encoded: false,
    elevation: true,
    instructions: false,
    calc_points: true,
  };

  const res = await fetch(`${GRAPHHOPPER_BASE}?key=${process.env.GRAPHHOPPER_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphHopper error ${res.status}: ${text}`);
  }

  return res.json();
}

function parseGraphHopperResponse(gh: GraphHopperResponse): {
  geometry: Coordinate3D[];
  distance_km: number;
  elevation_gain_m: number;
} {
  const path = gh.paths[0];
  // GraphHopper returns [lng, lat, ele] — convert to our [lat, lng, ele]
  const geometry: Coordinate3D[] = path.points.coordinates.map(([lng, lat, ele]) => [
    lat,
    lng,
    ele,
  ]);
  return {
    geometry,
    distance_km: path.distance / 1000,
    elevation_gain_m: path.ascend,
  };
}

/**
 * Generate a cycling route loop.
 *
 * @throws {Error} if GraphHopper fails or returns no paths
 */
export async function generateRoute(params: RouteParams, start: LatLng): Promise<RouteData> {
  let radiusKm = calculateRadius(params.target_distance_km);
  let lastResult: {
    geometry: Coordinate3D[];
    distance_km: number;
    elevation_gain_m: number;
  } | null = null;

  // Limit to MAX_WAYPOINTS bearings (GraphHopper free tier: 5 points max = start + 3 + start)
  const bearings = params.waypoint_bearings.slice(0, MAX_WAYPOINTS);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const waypoints = generateWaypoints(start, bearings, radiusKm);
    const allPoints = [start, ...waypoints];

    const ghResponse = await callGraphHopper(allPoints);
    const result = parseGraphHopperResponse(ghResponse);
    lastResult = result;

    const ratio = result.distance_km / params.target_distance_km;

    if (Math.abs(ratio - 1) <= DISTANCE_TOLERANCE) {
      return buildRouteData(result, start);
    }

    // Adjust radius proportionally for next attempt
    radiusKm = radiusKm / ratio;
  }

  // Return best attempt if we couldn't converge
  return buildRouteData(lastResult!, start);
}

function buildRouteData(
  result: { geometry: Coordinate3D[]; distance_km: number; elevation_gain_m: number },
  start: LatLng
): RouteData {
  return {
    geometry: result.geometry,
    distance_km: Math.round(result.distance_km * 10) / 10,
    distance_mi: Math.round(result.distance_km * KM_TO_MI * 10) / 10,
    elevation_gain_m: Math.round(result.elevation_gain_m),
    elevation_gain_ft: Math.round(result.elevation_gain_m * M_TO_FT),
    start_point: { lat: start.lat, lng: start.lng },
  };
}
