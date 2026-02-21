/**
 * POST /api/chat — SSE streaming endpoint for conversational route planning.
 *
 * Accepts conversation history + optional location context.
 * Streams back: text deltas (chat), generating event, route options, errors.
 * The LLM decides whether to ask a question (text) or generate routes (tool call).
 */

import { NextRequest } from 'next/server';
import { streamConversation } from '@/lib/llm';
import { generateRouteOptions } from '@/lib/conversation';
import type { ChatRequest, RouteOption } from '@/lib/types';

/** Send a single SSE event. */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Format error messages for the user (reused from v0 error handling logic).
 */
function formatUserError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  if (message.includes('Location not found')) {
    return "I couldn't find that location on the map. Could you be more specific?";
  }
  if (message.includes('Start location is not near any routable roads')) {
    return "That start point isn't near any roads — it might be in water or too remote. Try a different spot.";
  }
  if (message.includes('Could not find routable roads')) {
    return "I couldn't find cycling roads in that area. It might be too close to the coastline — try starting further inland.";
  }
  if (message.includes('timed out') || message.includes('TimeoutError')) {
    return 'Route generation timed out. Try a shorter distance or a different area.';
  }
  if (message.includes('overloaded') || message.includes('529')) {
    return "I'm a bit overloaded right now. Give me a moment and try again.";
  }
  if (message.includes('rate limit') || message.includes('429')) {
    return "I'm getting a lot of requests right now. Wait a moment and try again.";
  }
  if (message.includes('Could not generate any routes')) {
    return "I couldn't generate any routes in that area. The roads may be too sparse or the location too remote. Try a different starting point.";
  }
  return 'Something went wrong generating your routes. Try again or adjust your request.';
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ status: 'error', message: 'Messages are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };

        try {
          let textContent = '';

          for await (const event of streamConversation(
            body.messages,
            body.user_location,
            body.start_coordinates
          )) {
            if (event.type === 'text_delta') {
              textContent += event.text;
              send('text', { chunk: event.text });
            }

            if (event.type === 'tool_use' && event.name === 'generate_routes') {
              // Claude decided to generate routes
              send('generating', {
                message: textContent || 'Generating route options...',
              });

              try {
                const options: RouteOption[] = await generateRouteOptions(
                  event.input,
                  body.user_location,
                  body.start_coordinates
                );

                send('routes', { options });
              } catch (routeError) {
                send('error', { message: formatUserError(routeError) });
              }
            }

            if (event.type === 'end') {
              send('done', {});
            }
          }
        } catch (error) {
          send('error', { message: formatUserError(error) });
          send('done', {});
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
