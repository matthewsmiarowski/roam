import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock stream that yields events in sequence
function createMockStream(events: unknown[]) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < events.length) {
            return { done: false, value: events[index++] };
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: mockStream };
  },
}));

const { streamConversation, CONVERSATION_SYSTEM_PROMPT, GENERATE_ROUTES_TOOL } =
  await import('./llm');

beforeEach(() => {
  mockStream.mockReset();
});

describe('CONVERSATION_SYSTEM_PROMPT', () => {
  it('mentions Roam and cycling', () => {
    expect(CONVERSATION_SYSTEM_PROMPT).toContain('Roam');
    expect(CONVERSATION_SYSTEM_PROMPT).toContain('cycling');
  });

  it('instructs to generate 3 variants', () => {
    expect(CONVERSATION_SYSTEM_PROMPT).toContain('3 meaningfully different');
  });
});

describe('GENERATE_ROUTES_TOOL', () => {
  it('has the expected tool name', () => {
    expect(GENERATE_ROUTES_TOOL.name).toBe('generate_routes');
  });

  it('requires route_variants in schema', () => {
    const schema = GENERATE_ROUTES_TOOL.input_schema as Record<string, unknown>;
    const required = schema.required as string[];
    expect(required).toContain('route_variants');
  });
});

describe('streamConversation', () => {
  it('yields text_delta events from streaming text', async () => {
    mockStream.mockReturnValue(
      createMockStream([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
      ])
    );

    const events: unknown[] = [];
    for await (const event of streamConversation([{ role: 'user', content: 'hi' }])) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello ' },
      { type: 'text_delta', text: 'world' },
      { type: 'end' },
    ]);
  });

  it('yields tool_use event when Claude calls generate_routes', async () => {
    const toolInput = {
      start_location: 'Girona, Spain',
      start_precision: 'general',
      target_distance_km: 60,
      elevation_character: 'hilly',
      road_preference: 'quiet_roads',
      route_variants: [],
      reasoning: 'test',
    };

    mockStream.mockReturnValue(
      createMockStream([
        {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'generate_routes' },
        },
        {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) },
        },
        { type: 'content_block_stop' },
      ])
    );

    const events: unknown[] = [];
    for await (const event of streamConversation([{ role: 'user', content: 'ride from Girona' }])) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'tool_use', name: 'generate_routes', input: toolInput },
      { type: 'end' },
    ]);
  });

  it('appends start coordinates to last user message', async () => {
    mockStream.mockReturnValue(createMockStream([]));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of streamConversation([{ role: 'user', content: 'ride' }], undefined, {
      lat: 41.98,
      lng: 2.82,
    })) {
      // consume
    }

    const callArgs = mockStream.mock.calls[0][0];
    const lastMsg = callArgs.messages[0].content;
    expect(lastMsg).toContain('41.9800');
    expect(lastMsg).toContain('2.8200');
  });

  it('uses tool_choice auto', async () => {
    mockStream.mockReturnValue(createMockStream([]));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of streamConversation([{ role: 'user', content: 'hi' }])) {
      // consume
    }

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.tool_choice).toEqual({ type: 'auto' });
  });
});
