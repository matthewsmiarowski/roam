/**
 * v1 conversation orchestrator.
 *
 * Ties together the LLM streaming response, geocoding, and parallel route
 * generation to produce 3 route options from a conversation turn.
 */

import type { LatLng } from './geo';
import { geocode } from './geocoding';
import { generateGpx } from './gpx';
import { generateRouteSingleAttempt } from './routing';
import type { GenerateRoutesParams, RouteOption, RouteParams, RouteVariant } from './types';

/** Route option colors matching the design tokens. */
const COLORS: readonly string[] = ['#E8503A', '#2979FF', '#7B1FA2'];

/**
 * Resolve start coordinates from LLM params and optional user overrides.
 * Priority: explicit start_coordinates > GPS (when exact) > geocoding.
 */
export async function resolveStartCoordinates(
  params: GenerateRoutesParams,
  userLocation?: { latitude: number; longitude: number },
  startCoordinates?: { lat: number; lng: number }
): Promise<LatLng> {
  // 1. Explicit coordinates (map click)
  if (startCoordinates) {
    return { lat: startCoordinates.lat, lng: startCoordinates.lng };
  }

  // 2. GPS when user said "from here"
  if (params.start_precision === 'exact' && userLocation) {
    return { lat: userLocation.latitude, lng: userLocation.longitude };
  }

  // 3. Geocoding fallback
  return geocode(params.start_location);
}

/**
 * Geocode all named waypoints across all variants.
 * Returns a Map from variant index to array of geocoded LatLng.
 * Waypoints that fail to geocode are silently skipped.
 */
async function geocodeNamedWaypoints(variants: RouteVariant[]): Promise<Map<number, LatLng[]>> {
  const result = new Map<number, LatLng[]>();

  // Collect all unique location strings to avoid duplicate geocoding
  const uniqueLocations = new Map<string, LatLng | null>();
  for (const variant of variants) {
    for (const wp of variant.named_waypoints ?? []) {
      if (!uniqueLocations.has(wp.approximate_location)) {
        uniqueLocations.set(wp.approximate_location, null);
      }
    }
  }

  // Geocode all unique locations in parallel
  const entries = [...uniqueLocations.keys()];
  const geocodeResults = await Promise.allSettled(entries.map((loc) => geocode(loc)));

  for (let i = 0; i < entries.length; i++) {
    if (geocodeResults[i].status === 'fulfilled') {
      uniqueLocations.set(entries[i], (geocodeResults[i] as PromiseFulfilledResult<LatLng>).value);
    }
  }

  // Map geocoded waypoints back to each variant
  for (let vi = 0; vi < variants.length; vi++) {
    const coords: LatLng[] = [];
    for (const wp of variants[vi].named_waypoints ?? []) {
      const coord = uniqueLocations.get(wp.approximate_location);
      if (coord) coords.push(coord);
    }
    if (coords.length > 0) {
      result.set(vi, coords);
    }
  }

  return result;
}

/**
 * Generate 3 route options in parallel from the LLM's generate_routes output.
 * Each variant gets a single GraphHopper attempt (no retry loop).
 * Failed variants are excluded — returns at least 1 option or throws.
 */
export async function generateRouteOptions(
  params: GenerateRoutesParams,
  userLocation?: { latitude: number; longitude: number },
  startCoordinates?: { lat: number; lng: number }
): Promise<RouteOption[]> {
  // 1. Resolve start coordinates
  const start = await resolveStartCoordinates(params, userLocation, startCoordinates);

  // 2. Geocode named waypoints across all variants
  const geocodedWaypoints = await geocodeNamedWaypoints(params.route_variants);

  // 3. Generate all routes in parallel
  const routePromises = params.route_variants.map(async (variant, index) => {
    const routeParams: RouteParams = {
      start_location: params.start_location,
      start_precision: params.start_precision,
      target_distance_km: params.target_distance_km,
      elevation_character: params.elevation_character,
      road_preference: params.road_preference,
      waypoint_bearings: variant.waypoint_bearings,
      reasoning: params.reasoning,
    };

    const namedWps = geocodedWaypoints.get(index) ?? [];
    const route = await generateRouteSingleAttempt(routeParams, start, namedWps);

    return {
      id: crypto.randomUUID(),
      name: variant.name,
      description: variant.description,
      route,
      gpx: generateGpx(route.geometry, `Roam: ${variant.name}`),
      color: COLORS[index % COLORS.length],
    };
  });

  // 4. Settle all — return successful routes (minimum 1 required)
  const results = await Promise.allSettled(routePromises);
  const successful = results
    .filter((r): r is PromiseFulfilledResult<RouteOption> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (successful.length === 0) {
    // Extract the first error message for debugging
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const reason =
      firstError?.reason instanceof Error ? firstError.reason.message : 'Unknown routing error';
    throw new Error(`Could not generate any routes in this area. ${reason}`);
  }

  return successful;
}

/**
 * Summarize route options for inclusion in conversation history.
 * Keeps the token count low while giving Claude enough context for follow-ups.
 */
export function summarizeRouteOptions(options: RouteOption[]): string {
  const lines = options.map(
    (opt) =>
      `- ${opt.name}: ${opt.route.distance_km}km, ${opt.route.elevation_gain_m}m climbing — ${opt.description}`
  );
  return `I generated ${options.length} route option${options.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
}
