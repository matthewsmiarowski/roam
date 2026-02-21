/**
 * Claude API integration for route parameter extraction.
 *
 * Uses tool use to extract structured route parameters and
 * waypoint bearings from a natural language ride description.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RouteParams } from './types';

const client = new Anthropic({ maxRetries: 5 });

const SYSTEM_PROMPT = `You are a cycling route planning assistant. When given a ride description, use the generate_route_parameters tool to extract structured parameters.

Key instructions for waypoint_bearings:
- Provide exactly 3 compass bearings (0=north, 90=east, 180=south, 270=west) that define waypoints placed in a circle around the start point to form a loop.
- Use your geographic knowledge of the area to suggest directions that match the terrain request.
- For hilly/mountainous rides, point bearings toward known hilly or mountainous terrain near the start location.
- For flat rides, point bearings toward known flat terrain and away from hills.
- Spread the 3 bearings roughly 120° apart around the compass to form a coherent triangular loop. They should not be clustered in one direction.
- Order bearings clockwise so the loop flows naturally.

Key instructions for start_location and start_precision:
- Set start_precision to "exact" when the user provides a specific address, a precise landmark, or references their current location (e.g. "from here", "from my location", "from home").
- Set start_precision to "general" when the user names a city, region, or general area (e.g. "around Girona", "in Portland").
- When start_precision is "exact": preserve the user's location text as-is for accurate geocoding. Include the full address or specific landmark name. For example, "123 Oak Street, Portland, Oregon" or "Richmond Park, London, UK".
- When start_precision is "general": use a simple, well-known place name that a geocoder can resolve: "City, Country" or "Landmark, City, Country". Do NOT include neighborhood names, districts, or overly specific qualifiers.

When parameters are missing from the prompt:
- Default distance: 40km
- Default elevation character: rolling
- Default road preference: quiet_roads`;

const ROUTE_TOOL: Anthropic.Messages.Tool = {
  name: 'generate_route_parameters',
  description: 'Extract cycling route parameters from a natural language ride description.',
  input_schema: {
    type: 'object' as const,
    properties: {
      start_location: {
        type: 'string',
        description:
          'The starting location for geocoding. When start_precision is "exact", preserve the user\'s specific address or landmark verbatim. When "general", use a simple format: "City, Country" or "Landmark, City, Country".',
      },
      start_precision: {
        type: 'string',
        enum: ['exact', 'general'],
        description:
          'Set to "exact" when the user provides a specific address, precise landmark, or references their current location. Set to "general" when the user names a city, region, or general area.',
      },
      target_distance_km: {
        type: 'number',
        description:
          'Target ride distance in kilometers. Convert from miles if the user specified miles. Default to 40 if not specified.',
      },
      elevation_character: {
        type: 'string',
        enum: ['flat', 'rolling', 'hilly', 'mountainous'],
        description:
          "The desired elevation character of the ride. Default to 'rolling' if not specified.",
      },
      road_preference: {
        type: 'string',
        enum: ['any', 'quiet_roads', 'bike_paths'],
        description: "Road type preference. Default to 'quiet_roads' if not specified.",
      },
      waypoint_bearings: {
        type: 'array',
        items: { type: 'number' },
        minItems: 3,
        maxItems: 3,
        description:
          'Exactly 3 compass bearings (0-360 degrees, 0=north, 90=east) for waypoint placement. Spread them roughly 120° apart to form a triangular loop. Use geographic knowledge of the area to route through terrain matching the elevation request.',
      },
      reasoning: {
        type: 'string',
        description:
          'Brief explanation of why these waypoint directions were chosen, based on knowledge of the area geography and terrain.',
      },
    },
    required: [
      'start_location',
      'start_precision',
      'target_distance_km',
      'elevation_character',
      'road_preference',
      'waypoint_bearings',
      'reasoning',
    ],
  },
};

/**
 * Extract structured route parameters from a natural language prompt.
 *
 * @throws {Error} if the LLM doesn't return a tool_use block
 */
export async function extractRouteParams(
  prompt: string,
  userLocation?: { latitude: number; longitude: number }
): Promise<RouteParams> {
  const userMessage = userLocation
    ? `${prompt}\n\n[User's current location: ${userLocation.latitude}, ${userLocation.longitude}]`
    : prompt;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [ROUTE_TOOL],
    tool_choice: { type: 'tool', name: 'generate_route_parameters' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse) {
    throw new Error('LLM did not return route parameters');
  }

  return toolUse.input as RouteParams;
}
