/**
 * Claude API integration for conversational route planning.
 *
 * streamConversation — multi-turn conversation with streaming, tool_choice: auto.
 * Claude decides whether to ask clarifying questions (text) or generate routes (tool call).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { GenerateRoutesParams } from './types';

const client = new Anthropic({ maxRetries: 5 });

// ---------------------------------------------------------------------------
// v1: Conversational route planning
// ---------------------------------------------------------------------------

export const CONVERSATION_SYSTEM_PROMPT = `You are Roam, a knowledgeable cycling route planning assistant. You help cyclists plan rides through natural conversation.

## Your personality
- You sound like a knowledgeable cycling friend, not a form or a bot.
- You're direct and enthusiastic about cycling.
- You use cycling terminology naturally (peloton, cols, KOM, gruppetto) when appropriate.
- You know geography: famous climbs, classic cycling regions, road conditions, terrain characteristics.
- Keep responses short and punchy — 1-3 sentences max when asking questions.

## When to ask questions vs generate routes
- If the user provides enough information to generate a good route (at minimum: a location), call the generate_routes tool immediately.
- "60km hilly loop from Girona" → generate immediately, no questions needed.
- "I want to ride tomorrow" → ask where and how far.
- "Ride near Nice" → you have a location, generate with sensible defaults (40km, rolling, quiet roads).
- When in doubt, lean toward generating rather than asking. Users can always refine.
- Never ask more than 2 questions before generating. After 2 exchanges, generate with what you have.

## Generating route variants
When you call generate_routes, create 3 meaningfully different options:
- Vary the direction (one north, one south, one east/west) based on what's interesting in each direction.
- If the user wants hills, make one moderate, one challenging, one mixed with flats and climbs.
- If there are famous local rides/climbs nearby, include one variant that follows a well-known cycling route.
- Give each variant a distinctive name that a cyclist would understand.
- Each variant's waypoint_bearings must have exactly 3 compass bearings spread roughly 120° apart.
- The 3 variants should point in genuinely different overall directions from each other.

## Key instructions for waypoint_bearings
- Provide exactly 3 compass bearings (0=north, 90=east, 180=south, 270=west) per variant.
- These define waypoints placed in a circle around the start point to form a loop.
- Use your geographic knowledge of the area to suggest directions that match the terrain request.
- For hilly/mountainous rides, point bearings toward known hilly or mountainous terrain.
- For flat rides, point bearings toward known flat terrain and away from hills.
- Order bearings clockwise so the loop flows naturally.

## Named waypoints
When the user mentions specific places, climbs, or segments:
- Include them in the named_waypoints field of ALL variants that should pass through them.
- If the user explicitly requests a specific waypoint, all 3 variants should honor it (they differ in the rest of the loop).
- Provide a geocodable location string (e.g., "Rocacorba, Girona, Spain").

## Start location
- Set start_precision to "exact" when the user provides a specific address, landmark, or says "from here."
- Set start_precision to "general" when the user names a city, region, or area.
- When "exact": preserve the user's text verbatim.
- When "general": use "City, Country" format for reliable geocoding.

## Conversational context
- Remember the full conversation when the user asks to modify routes.
- "Make it flatter" → regenerate with lower elevation character.
- "Longer" → increase target distance.
- "Avoid the coast" → adjust bearings away from coastline.
- "These are too hilly" → reduce elevation character and adjust bearings toward flatter terrain.

## Key defaults when info is missing
- Distance: 40km
- Elevation: rolling
- Road preference: quiet_roads
- Start precision: general (unless they give a specific address)`;

export const GENERATE_ROUTES_TOOL: Anthropic.Messages.Tool = {
  name: 'generate_routes',
  description:
    'Generate 3 cycling route options from gathered ride parameters. ' +
    'Call this only when you have enough information: at minimum, a location. ' +
    'If the user provided enough info upfront, call this immediately without asking questions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      start_location: {
        type: 'string',
        description:
          'Starting location for geocoding. "City, Country" when general, full address when exact.',
      },
      start_precision: {
        type: 'string',
        enum: ['exact', 'general'],
        description:
          'Whether the start is a specific address ("exact") or a general area ("general").',
      },
      target_distance_km: {
        type: 'number',
        description: 'Target distance in km. Default 40 if not specified.',
      },
      elevation_character: {
        type: 'string',
        enum: ['flat', 'rolling', 'hilly', 'mountainous'],
        description: "Desired elevation profile. Default 'rolling' if not specified.",
      },
      road_preference: {
        type: 'string',
        enum: ['any', 'quiet_roads', 'bike_paths'],
        description: "Road type preference. Default 'quiet_roads'.",
      },
      route_variants: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'Short descriptive name for this route option (e.g., "Northern Hills Loop").',
            },
            description: {
              type: 'string',
              description: 'One-sentence description of what makes this variant unique.',
            },
            waypoint_bearings: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
              description:
                'Exactly 3 compass bearings (0-360°, 0=north, 90=east) spread ~120° apart.',
            },
            named_waypoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Name of the place/climb/segment.' },
                  approximate_location: {
                    type: 'string',
                    description: 'Geocodable location string for this waypoint.',
                  },
                },
                required: ['name', 'approximate_location'],
              },
              description:
                'Optional named waypoints the user mentioned (climbs, towns, segments). ' +
                'The routing system will geocode these and route through them.',
            },
          },
          required: ['name', 'description', 'waypoint_bearings'],
        },
        minItems: 3,
        maxItems: 3,
        description: 'Exactly 3 route variants with meaningfully different characteristics.',
      },
      reasoning: {
        type: 'string',
        description: 'Brief reasoning about the area geography and why these variants were chosen.',
      },
    },
    required: [
      'start_location',
      'start_precision',
      'target_distance_km',
      'elevation_character',
      'road_preference',
      'route_variants',
      'reasoning',
    ],
  },
};

/** Event types emitted by streamConversation. */
export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; name: string; input: GenerateRoutesParams }
  | { type: 'end' };

/**
 * Stream a conversational turn with Claude.
 *
 * Yields events as they arrive: text deltas (for chat responses) and
 * tool_use (when Claude decides to generate routes). The caller handles
 * orchestrating route generation when a tool_use event arrives.
 */
export async function* streamConversation(
  messages: { role: 'user' | 'assistant'; content: string }[],
  userLocation?: { latitude: number; longitude: number },
  startCoordinates?: { lat: number; lng: number }
): AsyncGenerator<LLMStreamEvent> {
  // Build the messages array for Claude, injecting context into the latest user message
  const claudeMessages: Anthropic.Messages.MessageParam[] = messages.map((msg, index) => {
    if (msg.role === 'user' && index === messages.length - 1) {
      // Append location context to the latest user message
      let content = msg.content;
      if (startCoordinates) {
        content += `\n\n[User has set a start point on the map: ${startCoordinates.lat.toFixed(4)}, ${startCoordinates.lng.toFixed(4)}]`;
      }
      if (userLocation) {
        content += `\n\n[User's current GPS location: ${userLocation.latitude}, ${userLocation.longitude}]`;
      }
      return { role: 'user' as const, content };
    }
    return { role: msg.role, content: msg.content };
  });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: CONVERSATION_SYSTEM_PROMPT,
    tools: [GENERATE_ROUTES_TOOL],
    tool_choice: { type: 'auto' },
    messages: claudeMessages,
  });

  let toolInput = '';
  let toolName = '';
  let inToolUse = false;

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && !inToolUse) {
      yield { type: 'text_delta', text: event.delta.text };
    }

    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      inToolUse = true;
      toolName = event.content_block.name;
      toolInput = '';
    }

    if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
      toolInput += event.delta.partial_json;
    }

    if (event.type === 'content_block_stop' && inToolUse) {
      inToolUse = false;
      try {
        const input = JSON.parse(toolInput) as GenerateRoutesParams;
        yield { type: 'tool_use', name: toolName, input };
      } catch {
        throw new Error('Failed to parse route parameters from AI response.');
      }
    }
  }

  yield { type: 'end' };
}
