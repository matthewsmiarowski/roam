import { NextRequest, NextResponse } from 'next/server';
import { extractRouteParams } from '@/lib/llm';
import { geocode } from '@/lib/geocoding';
import { generateRoute } from '@/lib/routing';
import { generateGpx } from '@/lib/gpx';
import type { GenerateRouteRequest, GenerateRouteResponse, GenerateRouteError } from '@/lib/types';

export async function POST(request: NextRequest) {
  let parsedLocation: string | undefined;

  try {
    const body: GenerateRouteRequest = await request.json();

    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json(
        { status: 'error', message: 'A prompt is required.' } satisfies GenerateRouteError,
        { status: 400 }
      );
    }

    // 1. LLM extracts structured route parameters
    const params = await extractRouteParams(body.prompt, body.user_location);
    parsedLocation = params.start_location;
    console.log('LLM extracted params:', {
      start_location: params.start_location,
      target_distance_km: params.target_distance_km,
      elevation_character: params.elevation_character,
      waypoint_bearings: params.waypoint_bearings,
    });

    // 2. Geocode the start location
    const start = await geocode(params.start_location);
    console.log('Geocoded:', params.start_location, '->', start);

    // 3. Generate route via GraphHopper
    const route = await generateRoute(params, start);

    // 4. Generate GPX
    const gpx = generateGpx(
      route.geometry,
      `Roam: ${params.target_distance_km}km ${params.elevation_character} loop from ${params.start_location}`
    );

    // 5. Return response
    const response: GenerateRouteResponse = {
      route,
      gpx,
      metadata: {
        parsed_params: {
          start_location: params.start_location,
          target_distance_km: params.target_distance_km,
          elevation_character: params.elevation_character,
          road_preference: params.road_preference,
        },
        llm_reasoning: params.reasoning,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

    let userMessage: string;
    if (message.includes('Location not found')) {
      userMessage = parsedLocation
        ? `I couldn't find "${parsedLocation}" on the map. Try a more specific location (e.g., 'Girona, Spain').`
        : "I couldn't find that location. Try being more specific (e.g., 'Girona, Spain').";
    } else if (message.includes('LLM did not return')) {
      userMessage =
        "I couldn't understand that request. Try describing your ride with a starting location and distance.";
    } else if (message.includes('GraphHopper')) {
      const locationHint = parsedLocation ? ` (routing near "${parsedLocation}")` : '';
      const statusMatch = message.match(/GraphHopper error (\d+)/);
      const statusCode = statusMatch ? statusMatch[1] : 'unknown';
      if (message.includes('PointNotFoundException') || message.includes('Cannot find point')) {
        userMessage = `Couldn't find roads near that location${locationHint}. The area may be too remote for cycling routing. Try a more urban location or a well-known cycling area.`;
      } else if (statusCode === '401' || statusCode === '403') {
        userMessage = 'Routing service authentication error. Please check the API key.';
      } else {
        userMessage = `Couldn't generate a route in that area${locationHint}. Try a different location or shorter distance.`;
      }
    } else if (message.includes('timed out') || message.includes('TimeoutError')) {
      userMessage = 'Route generation timed out. Try a shorter distance or different area.';
    } else if (message.includes('overloaded') || message.includes('529')) {
      userMessage = 'The AI service is temporarily busy. Please wait a moment and try again.';
    } else if (message.includes('rate limit') || message.includes('429')) {
      userMessage = 'Service is temporarily busy. Please wait a moment and try again.';
    } else {
      userMessage = 'An unexpected error occurred. Please try again.';
    }

    console.error('Route generation failed:', message);

    return NextResponse.json(
      { status: 'error', message: userMessage } satisfies GenerateRouteError,
      { status: 500 }
    );
  }
}
