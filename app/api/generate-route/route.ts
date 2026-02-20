import { NextRequest, NextResponse } from 'next/server';
import { extractRouteParams } from '@/lib/llm';
import { geocode } from '@/lib/geocoding';
import { generateRoute } from '@/lib/routing';
import { generateGpx } from '@/lib/gpx';
import type { GenerateRouteRequest, GenerateRouteResponse, GenerateRouteError } from '@/lib/types';

export async function POST(request: NextRequest) {
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

    // 2. Geocode the start location
    const start = await geocode(params.start_location);

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
      userMessage =
        "I couldn't find that location. Try being more specific (e.g., 'central Girona, Spain').";
    } else if (message.includes('LLM did not return')) {
      userMessage =
        "I couldn't understand that request. Try describing your ride with a starting location and distance.";
    } else if (message.includes('GraphHopper')) {
      userMessage =
        "Couldn't generate a route in that area. The road network may be too sparse. Try a different location or shorter distance.";
    } else if (message.includes('timed out') || message.includes('TimeoutError')) {
      userMessage = 'Route generation timed out. Try a shorter distance or different area.';
    } else if (message.includes('overloaded') || message.includes('529')) {
      userMessage = 'The AI service is temporarily busy. Please wait a moment and try again.';
    } else if (message.includes('rate limit') || message.includes('429')) {
      userMessage = 'Service is temporarily busy. Please wait a moment and try again.';
    } else {
      userMessage = 'An unexpected error occurred. Please try again.';
    }

    console.error('Route generation failed:', error);

    return NextResponse.json(
      { status: 'error', message: userMessage } satisfies GenerateRouteError,
      { status: 500 }
    );
  }
}
