import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LatLng } from './geo';
import type { GenerateRoutesParams, RouteOption } from './types';

// Mock dependencies
vi.mock('./geocoding', () => ({
  geocode: vi.fn(),
}));

vi.mock('./routing', () => ({
  generateRouteSingleAttempt: vi.fn(),
}));

vi.mock('./gpx', () => ({
  generateGpx: vi.fn().mockReturnValue('<gpx>mock</gpx>'),
}));

const { geocode } = await import('./geocoding');
const { generateRouteSingleAttempt } = await import('./routing');
const { resolveStartCoordinates, generateRouteOptions, summarizeRouteOptions } =
  await import('./conversation');

const mockGeocode = vi.mocked(geocode);
const mockGenerateRoute = vi.mocked(generateRouteSingleAttempt);

const girona: LatLng = { lat: 41.9794, lng: 2.8214 };

const baseParams: GenerateRoutesParams = {
  start_location: 'Girona, Spain',
  start_precision: 'general',
  target_distance_km: 60,
  elevation_character: 'hilly',
  road_preference: 'quiet_roads',
  route_variants: [
    {
      name: 'Northern Hills',
      description: 'Head north toward the Gavarres',
      waypoint_bearings: [330, 90, 210],
    },
    {
      name: 'Coastal Approach',
      description: 'Ride east toward the coast and back',
      waypoint_bearings: [60, 180, 300],
    },
    {
      name: 'River Valley',
      description: 'Follow the Ter river valley west',
      waypoint_bearings: [270, 30, 150],
    },
  ],
  reasoning: 'Test reasoning',
};

const mockRouteData = {
  geometry: [[41.9794, 2.8214, 100]] as [number, number, number][],
  distance_km: 62.3,
  distance_mi: 38.7,
  elevation_gain_m: 890,
  elevation_gain_ft: 2920,
  start_point: { lat: 41.9794, lng: 2.8214 },
};

beforeEach(() => {
  mockGeocode.mockReset();
  mockGenerateRoute.mockReset();
});

// --- resolveStartCoordinates ---

describe('resolveStartCoordinates', () => {
  it('uses explicit start_coordinates when provided (map click)', async () => {
    const coords = { lat: 42.0, lng: 2.9 };
    const result = await resolveStartCoordinates(baseParams, undefined, coords);

    expect(result).toEqual({ lat: 42.0, lng: 2.9 });
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('uses GPS location when start_precision is exact and user_location exists', async () => {
    const exactParams = { ...baseParams, start_precision: 'exact' as const };
    const userLoc = { latitude: 42.1, longitude: 2.85 };
    const result = await resolveStartCoordinates(exactParams, userLoc);

    expect(result).toEqual({ lat: 42.1, lng: 2.85 });
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('falls back to geocoding when no explicit coords and no GPS', async () => {
    mockGeocode.mockResolvedValue(girona);
    const result = await resolveStartCoordinates(baseParams);

    expect(result).toEqual(girona);
    expect(mockGeocode).toHaveBeenCalledWith('Girona, Spain');
  });

  it('prefers explicit coords over GPS', async () => {
    const exactParams = { ...baseParams, start_precision: 'exact' as const };
    const coords = { lat: 42.0, lng: 2.9 };
    const userLoc = { latitude: 42.1, longitude: 2.85 };
    const result = await resolveStartCoordinates(exactParams, userLoc, coords);

    expect(result).toEqual({ lat: 42.0, lng: 2.9 });
  });
});

// --- generateRouteOptions ---

describe('generateRouteOptions', () => {
  beforeEach(() => {
    mockGeocode.mockResolvedValue(girona);
    mockGenerateRoute.mockResolvedValue(mockRouteData);
  });

  it('generates 3 route options in parallel', async () => {
    const options = await generateRouteOptions(baseParams);

    expect(options).toHaveLength(3);
    expect(mockGenerateRoute).toHaveBeenCalledTimes(3);
  });

  it('assigns distinct colors to each option', async () => {
    const options = await generateRouteOptions(baseParams);

    const colors = options.map((o) => o.color);
    expect(new Set(colors).size).toBe(3);
    expect(colors[0]).toBe('#E8503A');
    expect(colors[1]).toBe('#2979FF');
    expect(colors[2]).toBe('#7B1FA2');
  });

  it('includes route name and description from variants', async () => {
    const options = await generateRouteOptions(baseParams);

    expect(options[0].name).toBe('Northern Hills');
    expect(options[0].description).toBe('Head north toward the Gavarres');
    expect(options[1].name).toBe('Coastal Approach');
  });

  it('includes GPX in each option', async () => {
    const options = await generateRouteOptions(baseParams);

    for (const opt of options) {
      expect(opt.gpx).toBe('<gpx>mock</gpx>');
    }
  });

  it('returns successful routes even if some fail', async () => {
    mockGenerateRoute
      .mockResolvedValueOnce(mockRouteData)
      .mockRejectedValueOnce(new Error('Water'))
      .mockResolvedValueOnce(mockRouteData);

    const options = await generateRouteOptions(baseParams);

    expect(options).toHaveLength(2);
  });

  it('throws when all routes fail', async () => {
    mockGenerateRoute.mockRejectedValue(new Error('No roads'));

    await expect(generateRouteOptions(baseParams)).rejects.toThrow('Could not generate any routes');
  });

  it('geocodes named waypoints and passes them to route generation', async () => {
    const paramsWithWaypoints: GenerateRoutesParams = {
      ...baseParams,
      route_variants: [
        {
          name: 'Rocacorba Route',
          description: 'Via Rocacorba',
          waypoint_bearings: [330, 90, 210],
          named_waypoints: [
            { name: 'Rocacorba', approximate_location: 'Rocacorba, Girona, Spain' },
          ],
        },
        {
          name: 'Coastal',
          description: 'East',
          waypoint_bearings: [60, 180, 300],
        },
        {
          name: 'Valley',
          description: 'West',
          waypoint_bearings: [270, 30, 150],
        },
      ],
    };

    const rocacorba: LatLng = { lat: 42.03, lng: 2.78 };
    // First call: geocode start. Second call: geocode Rocacorba.
    mockGeocode.mockImplementation(async (location: string) => {
      if (location.includes('Rocacorba')) return rocacorba;
      return girona;
    });

    await generateRouteOptions(paramsWithWaypoints);

    // First variant should get the named waypoint coords
    const firstCall = mockGenerateRoute.mock.calls[0];
    expect(firstCall[2]).toEqual([rocacorba]);

    // Other variants should get empty arrays
    const secondCall = mockGenerateRoute.mock.calls[1];
    expect(secondCall[2]).toEqual([]);
  });

  it('silently skips named waypoints that fail to geocode', async () => {
    const paramsWithBadWaypoint: GenerateRoutesParams = {
      ...baseParams,
      route_variants: [
        {
          name: 'Route',
          description: 'Test',
          waypoint_bearings: [0, 120, 240],
          named_waypoints: [
            { name: 'NonexistentPlace', approximate_location: 'Nowhere, Neverland' },
          ],
        },
        {
          name: 'Route 2',
          description: 'Test 2',
          waypoint_bearings: [60, 180, 300],
        },
        {
          name: 'Route 3',
          description: 'Test 3',
          waypoint_bearings: [270, 30, 150],
        },
      ],
    };

    mockGeocode.mockImplementation(async (location: string) => {
      if (location.includes('Nowhere')) throw new Error('Not found');
      return girona;
    });

    const options = await generateRouteOptions(paramsWithBadWaypoint);

    expect(options).toHaveLength(3);
    // First variant should have empty named waypoints (geocoding failed)
    const firstCall = mockGenerateRoute.mock.calls[0];
    expect(firstCall[2]).toEqual([]);
  });
});

// --- summarizeRouteOptions ---

describe('summarizeRouteOptions', () => {
  it('produces a concise summary of route options', () => {
    const options: RouteOption[] = [
      {
        id: '1',
        name: 'Northern Hills',
        description: 'Head north',
        route: mockRouteData,
        gpx: '',
        color: '#E8503A',
      },
      {
        id: '2',
        name: 'Coastal',
        description: 'Head east',
        route: { ...mockRouteData, distance_km: 58, elevation_gain_m: 720 },
        gpx: '',
        color: '#2979FF',
      },
    ];

    const summary = summarizeRouteOptions(options);

    expect(summary).toContain('2 route options');
    expect(summary).toContain('Northern Hills');
    expect(summary).toContain('62.3km');
    expect(summary).toContain('890m');
    expect(summary).toContain('Coastal');
  });
});
