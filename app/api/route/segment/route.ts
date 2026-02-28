/**
 * Segment re-routing endpoint for v2 waypoint editing.
 *
 * Routes between two points using GraphHopper's bike profile.
 * No LLM involvement — this is a lightweight pass-through to
 * the routing engine used by the frontend during visual editing.
 */

import { NextRequest } from 'next/server';
import { callGraphHopperSegment, KM_TO_MI, M_TO_FT } from '@/lib/routing';

interface SegmentRequest {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

function isValidCoord(c: unknown): c is { lat: number; lng: number } {
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof (c as Record<string, unknown>).lat === 'number' &&
    typeof (c as Record<string, unknown>).lng === 'number' &&
    isFinite((c as Record<string, unknown>).lat as number) &&
    isFinite((c as Record<string, unknown>).lng as number)
  );
}

export async function POST(request: NextRequest) {
  let body: SegmentRequest;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isValidCoord(body.from) || !isValidCoord(body.to)) {
    return Response.json(
      { error: 'Request must include valid "from" and "to" coordinates with lat/lng numbers' },
      { status: 400 }
    );
  }

  try {
    const result = await callGraphHopperSegment(
      { lat: body.from.lat, lng: body.from.lng },
      { lat: body.to.lat, lng: body.to.lng }
    );

    return Response.json({
      geometry: result.geometry,
      distance_km: Math.round(result.distance_km * 10) / 10,
      distance_mi: Math.round(result.distance_km * KM_TO_MI * 10) / 10,
      elevation_gain_m: Math.round(result.elevation_gain_m),
      elevation_gain_ft: Math.round(result.elevation_gain_m * M_TO_FT),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Routing failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
