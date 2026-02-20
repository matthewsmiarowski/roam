/**
 * Nominatim (OpenStreetMap) geocoding wrapper.
 *
 * Converts a location string to lat/lng coordinates.
 */

import type { LatLng } from './geo';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

async function nominatimSearch(query: string): Promise<LatLng | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
  });

  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { 'User-Agent': 'Roam/0.1 (cycling route generator)' },
  });

  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status}`);
  }

  const data = await res.json();

  if (!data.length) {
    return null;
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

/**
 * Simplify a location string by progressively removing leading parts.
 * "Historic District, Girona, Spain" → ["Historic District, Girona, Spain", "Girona, Spain", "Spain"]
 */
function simplifyLocation(location: string): string[] {
  const parts = location.split(',').map((s) => s.trim());
  const variants: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    variants.push(parts.slice(i).join(', '));
  }
  return variants;
}

/**
 * Geocode a location string to coordinates.
 * Tries the full string first, then progressively simpler versions.
 *
 * @throws {Error} if the location is not found or the request fails
 */
export async function geocode(location: string): Promise<LatLng> {
  const variants = simplifyLocation(location);

  for (const variant of variants) {
    const result = await nominatimSearch(variant);
    if (result) {
      return result;
    }
  }

  throw new Error(`Location not found: "${location}"`);
}
