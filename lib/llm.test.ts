import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// Import after mock is set up
const { extractRouteParams } = await import('./llm');

beforeEach(() => {
  mockCreate.mockReset();
});

const validToolUseResponse = {
  content: [
    {
      type: 'tool_use',
      id: 'test-id',
      name: 'generate_route_parameters',
      input: {
        start_location: 'Girona, Spain',
        start_precision: 'general',
        target_distance_km: 60,
        elevation_character: 'hilly',
        road_preference: 'quiet_roads',
        waypoint_bearings: [330, 90, 210],
        reasoning: 'Hills are north and west of Girona.',
      },
    },
  ],
};

describe('extractRouteParams', () => {
  it('extracts route params from a tool_use response', async () => {
    mockCreate.mockResolvedValue(validToolUseResponse);

    const params = await extractRouteParams('60km hilly loop from Girona');

    expect(params.start_location).toBe('Girona, Spain');
    expect(params.target_distance_km).toBe(60);
    expect(params.elevation_character).toBe('hilly');
    expect(params.road_preference).toBe('quiet_roads');
    expect(params.waypoint_bearings).toHaveLength(3);
    expect(params.reasoning).toBe('Hills are north and west of Girona.');
  });

  it('throws when response has no tool_use block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
    });

    await expect(extractRouteParams('bad prompt')).rejects.toThrow(
      'LLM did not return route parameters'
    );
  });

  it('appends user location to prompt when provided', async () => {
    mockCreate.mockResolvedValue(validToolUseResponse);

    await extractRouteParams('loop from here', {
      latitude: 41.9794,
      longitude: 2.8214,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage).toContain('41.9794');
    expect(userMessage).toContain('2.8214');
  });

  it('does not append location text when user_location is undefined', async () => {
    mockCreate.mockResolvedValue(validToolUseResponse);

    await extractRouteParams('60km loop from Girona');

    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage).toBe('60km loop from Girona');
  });

  it('forces tool_choice to generate_route_parameters', async () => {
    mockCreate.mockResolvedValue(validToolUseResponse);

    await extractRouteParams('any prompt');

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tool_choice).toEqual({
      type: 'tool',
      name: 'generate_route_parameters',
    });
  });
});
