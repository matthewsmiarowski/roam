/**
 * Geographic math utilities.
 *
 * Pure functions — no external dependencies, no side effects.
 */

import type { Coordinate3D } from './types';

const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Converts degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Converts radians to degrees. */
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Haversine distance between two points in kilometers.
 */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Projects a point at a given distance and bearing from a start point.
 *
 * @param start  - origin point
 * @param bearingDeg - compass bearing in degrees (0 = north, 90 = east)
 * @param distanceKm - distance in kilometers
 * @returns the projected point
 */
export function projectPoint(start: LatLng, bearingDeg: number, distanceKm: number): LatLng {
  const d = distanceKm / EARTH_RADIUS_KM;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/**
 * Detect if a route geometry forms a star/spoke pattern.
 *
 * A star pattern is detected when the route passes near the start point
 * in its middle portion (10%–90% of the geometry), indicating spokes
 * that return to center rather than tracing a loop perimeter.
 */
export function isStarShaped(geometry: Coordinate3D[], start: LatLng, radiusKm: number): boolean {
  if (geometry.length < 5) return false;

  const thresholdKm = radiusKm * 0.25;
  const trimCount = Math.max(Math.floor(geometry.length * 0.1), 1);
  const middle = geometry.slice(trimCount, geometry.length - trimCount);

  for (const point of middle) {
    const dist = haversine(start, { lat: point[0], lng: point[1] });
    if (dist < thresholdKm) return true;
  }

  return false;
}
