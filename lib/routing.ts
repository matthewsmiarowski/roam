/**
 * Loop generation algorithm + GraphHopper integration.
 *
 * Takes LLM-extracted parameters and a geocoded start point,
 * generates waypoints using compass bearings, routes through
 * GraphHopper, and validates distance with retry.
 */

import { type LatLng, projectPoint, isStarShaped } from './geo';
import type { RouteParams, RouteData, RouteSegment, RouteWaypoint, Coordinate3D } from './types';

const GRAPHHOPPER_BASE = 'https://graphhopper.com/api/1/route';
const STRETCH_FACTOR = 1.3;
const DISTANCE_TOLERANCE = 0.2;
const MAX_RETRIES = 3;
const MAX_WAYPOINTS = 3; // GraphHopper free tier allows max 5 points total (start + 3 waypoints + start)
const STAR_BEARING_ROTATION = 30;
const MAX_POINT_NOT_FOUND_RETRIES = 7;
const POINT_NOT_FOUND_RADIUS_SHRINK = 0.95;
const POINT_NOT_FOUND_BEARING_ROTATION = 45;
export const KM_TO_MI = 0.621371;
export const M_TO_FT = 3.28084;

class PointNotFoundError extends Error {
  readonly pointIndex: number;
  constructor(message: string, pointIndex: number) {
    super(message);
    this.name = 'PointNotFoundError';
    this.pointIndex = pointIndex;
  }
}

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
    if (text.includes('PointNotFoundException') || text.includes('Cannot find point')) {
      const indexMatch = text.match(/Cannot find point (\d+)/);
      const pointIndex = indexMatch ? parseInt(indexMatch[1], 10) : -1;
      throw new PointNotFoundError(`GraphHopper error ${res.status}: ${text}`, pointIndex);
    }
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

// ---------------------------------------------------------------------------
// Segment-based routing (v2: multi-leg stitching)
// ---------------------------------------------------------------------------

/**
 * Route between exactly 2 points (no loop closure).
 * Used for segment-based routing where each leg is routed independently.
 */
export async function callGraphHopperSegment(
  from: LatLng,
  to: LatLng
): Promise<{ geometry: Coordinate3D[]; distance_km: number; elevation_gain_m: number }> {
  const body = {
    points: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
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

  const gh: GraphHopperResponse = await res.json();
  return parseGraphHopperResponse(gh);
}

/**
 * Route through an ordered list of waypoints, one segment at a time.
 * Each consecutive pair gets its own GraphHopper call, all run in parallel.
 * Returns an array of RouteSegments.
 */
export async function routeViaSegments(waypoints: LatLng[]): Promise<RouteSegment[]> {
  if (waypoints.length < 2) throw new Error('Need at least 2 waypoints');

  const segmentPromises: Promise<RouteSegment>[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    segmentPromises.push(
      callGraphHopperSegment(from, to).then((result) => ({
        from: { lat: from.lat, lng: from.lng },
        to: { lat: to.lat, lng: to.lng },
        ...result,
      }))
    );
  }

  return Promise.all(segmentPromises);
}

/**
 * Concatenate segment geometries into a single flat array.
 * Skips the first point of each subsequent segment (duplicate of previous segment's last point).
 * Sums distances and elevation gains.
 */
export function stitchSegments(segments: RouteSegment[]): {
  geometry: Coordinate3D[];
  distance_km: number;
  elevation_gain_m: number;
} {
  if (segments.length === 0) return { geometry: [], distance_km: 0, elevation_gain_m: 0 };

  const geometry: Coordinate3D[] = [...segments[0].geometry];
  let distance_km = segments[0].distance_km;
  let elevation_gain_m = segments[0].elevation_gain_m;

  for (let i = 1; i < segments.length; i++) {
    // Skip first point (duplicate of previous segment's last point)
    geometry.push(...segments[i].geometry.slice(1));
    distance_km += segments[i].distance_km;
    elevation_gain_m += segments[i].elevation_gain_m;
  }

  return { geometry, distance_km, elevation_gain_m };
}

// ---------------------------------------------------------------------------
// v0: Loop generation with retry
// ---------------------------------------------------------------------------

function rotateBearings(bearings: number[], offsetDeg: number): number[] {
  return bearings.map((b) => (b + offsetDeg) % 360);
}

/**
 * Sort bearings clockwise from a given starting angle.
 * Ensures clean loop traversal without figure-8 crossings.
 */
function sortBearingsClockwise(bearings: number[], startAngle: number): number[] {
  return [...bearings].sort((a, b) => {
    const aOffset = (a - startAngle + 360) % 360;
    const bOffset = (b - startAngle + 360) % 360;
    return aOffset - bOffset;
  });
}

/**
 * Generate a cycling route loop.
 *
 * The loop center is offset from start so that start sits on the
 * circumference rather than at the hub. This produces natural cycling
 * loops where the rider goes out, around, and back — instead of
 * radiating through the center.
 *
 * Retries up to MAX_RETRIES times to achieve both:
 *  - Distance within ±DISTANCE_TOLERANCE of target
 *  - Non-star-shaped geometry (route doesn't cut through loop center)
 *
 * When a star pattern is detected, bearings are rotated to shift waypoints
 * onto different road segments. The best loop-shaped result is preferred
 * over a closer-distance star-shaped result.
 *
 * @throws {Error} if GraphHopper fails or returns no paths
 */
export async function generateRoute(params: RouteParams, start: LatLng): Promise<RouteData> {
  let radiusKm = calculateRadius(params.target_distance_km);
  const baseBearings = params.waypoint_bearings.slice(0, MAX_WAYPOINTS);
  const loopDirection = baseBearings[0];

  type ParsedResult = { geometry: Coordinate3D[]; distance_km: number; elevation_gain_m: number };
  let bestResult: ParsedResult | null = null;
  let bestDistanceDelta = Infinity;
  let bestLoopResult: ParsedResult | null = null;
  let bestLoopDistanceDelta = Infinity;

  let bearingRotation = 0;
  let pointNotFoundRetries = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const bearings =
      bearingRotation === 0 ? baseBearings : rotateBearings(baseBearings, bearingRotation);

    // Rotate loop direction with bearings so the entire loop swings around
    // start — critical for coastal areas where the original direction may
    // point toward water.
    const effectiveLoopDirection = (loopDirection + bearingRotation) % 360;

    // Offset center so start sits on the circumference
    const loopCenter = projectPoint(start, effectiveLoopDirection, radiusKm);

    // Sort bearings clockwise from start's position for clean traversal
    const startAngle = (effectiveLoopDirection + 180) % 360;
    const sortedBearings = sortBearingsClockwise(bearings, startAngle);

    const waypoints = generateWaypoints(loopCenter, sortedBearings, radiusKm);
    const allPoints = [start, ...waypoints];

    let ghResponse: GraphHopperResponse;
    try {
      ghResponse = await callGraphHopper(allPoints);
    } catch (error) {
      if (error instanceof PointNotFoundError) {
        // Start point itself is in water — no retry will help
        if (error.pointIndex === 0 || error.pointIndex === allPoints.length) {
          throw new Error(
            'Start location is not near any routable roads. Try a different starting point.'
          );
        }
        // A waypoint landed in water — rotate bearings and shrink radius
        // Uses its own retry budget so distance/star retries aren't consumed
        if (pointNotFoundRetries >= MAX_POINT_NOT_FOUND_RETRIES) {
          throw new Error(
            'Could not find routable roads for waypoints in this area. ' +
              'The location may be too close to water or the coastline. ' +
              'Try starting further inland or in a different area.'
          );
        }
        pointNotFoundRetries++;
        bearingRotation += POINT_NOT_FOUND_BEARING_ROTATION;
        radiusKm *= POINT_NOT_FOUND_RADIUS_SHRINK;
        attempt--; // Don't count toward routing retry budget
        continue;
      }
      throw error;
    }

    const result = parseGraphHopperResponse(ghResponse);

    const ratio = result.distance_km / params.target_distance_km;
    const distanceDelta = Math.abs(ratio - 1);
    const distanceOk = distanceDelta <= DISTANCE_TOLERANCE;
    const starShaped = isStarShaped(result.geometry, loopCenter, radiusKm);

    // Track best overall result (by distance)
    if (distanceDelta < bestDistanceDelta) {
      bestDistanceDelta = distanceDelta;
      bestResult = result;
    }

    // Track best non-star result (by distance)
    if (!starShaped && distanceDelta < bestLoopDistanceDelta) {
      bestLoopDistanceDelta = distanceDelta;
      bestLoopResult = result;
    }

    // Accept if both distance and shape are good
    if (distanceOk && !starShaped) {
      return buildRouteData(result, start);
    }

    // Rotate bearings on star detection for next attempt
    if (starShaped) {
      bearingRotation += STAR_BEARING_ROTATION;
    }

    // Adjust radius proportionally for distance convergence
    radiusKm = radiusKm / ratio;
  }

  // All attempts exhausted
  if (!bestResult && !bestLoopResult) {
    throw new Error(
      'Could not find routable roads for waypoints in this area. ' +
        'The location may be too close to water or the coastline. ' +
        'Try starting further inland or in a different area.'
    );
  }

  // Prefer a non-star result even if distance is slightly worse
  return buildRouteData((bestLoopResult ?? bestResult)!, start);
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

// ---------------------------------------------------------------------------
// v1: Single-attempt route generation with named waypoint support
// Uses segment-based stitching so routes are immediately editable (v2).
// ---------------------------------------------------------------------------

/**
 * Merge named waypoints (geocoded LatLng) with bearing-based waypoints.
 * Named waypoints take priority slots; bearings fill the remainder.
 * Total capped at MAX_WAYPOINTS to stay within GraphHopper free tier limits.
 */
export function mergeWaypoints(bearingWaypoints: LatLng[], namedWaypoints: LatLng[]): LatLng[] {
  const named = namedWaypoints.slice(0, MAX_WAYPOINTS);
  const bearingSlots = MAX_WAYPOINTS - named.length;
  const bearings = bearingWaypoints.slice(0, bearingSlots);
  return [...named, ...bearings];
}

/**
 * Generate a single route in one attempt (no retry loop).
 * Used by the conversation pipeline to generate 3 options in parallel.
 *
 * Named waypoints (already geocoded) are merged with bearing-based waypoints.
 * Routes via segment-based stitching: each leg (start→wp1, wp1→wp2, etc.)
 * is routed independently, enabling localized editing in v2.
 *
 * @throws {Error} if GraphHopper fails
 */
export async function generateRouteSingleAttempt(
  params: RouteParams,
  start: LatLng,
  namedWaypointCoords: LatLng[] = []
): Promise<RouteData> {
  const radiusKm = calculateRadius(params.target_distance_km);
  const baseBearings = params.waypoint_bearings.slice(0, MAX_WAYPOINTS);
  const loopDirection = baseBearings[0];

  // Offset center so start sits on the circumference
  const loopCenter = projectPoint(start, loopDirection, radiusKm);

  // Sort bearings clockwise from start's position
  const startAngle = (loopDirection + 180) % 360;
  const sortedBearings = sortBearingsClockwise(baseBearings, startAngle);

  const bearingWaypoints = generateWaypoints(loopCenter, sortedBearings, radiusKm);
  const waypoints = mergeWaypoints(bearingWaypoints, namedWaypointCoords);

  // Route via segments: start → wp1 → wp2 → wp3 → start
  const orderedPoints: LatLng[] = [start, ...waypoints, start];
  const segments = await routeViaSegments(orderedPoints);
  const stitched = stitchSegments(segments);

  // Build RouteWaypoint array for editing
  const routeWaypoints: RouteWaypoint[] = orderedPoints.map((p, i) => ({
    id: crypto.randomUUID(),
    lat: p.lat,
    lng: p.lng,
    type: i === 0 || i === orderedPoints.length - 1 ? 'start' : 'via',
  }));

  const routeData = buildRouteData(stitched, start);
  routeData.segments = segments;
  routeData.waypoints = routeWaypoints;
  return routeData;
}
