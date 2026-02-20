import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haversine, type LatLng } from './geo';
import type { Coordinate3D, RouteParams } from './types';
import {
  calculateRadius,
  generateWaypoints,
  calculateElevationGain,
  generateRoute,
} from './routing';

const girona: LatLng = { lat: 41.9794, lng: 2.8214 };

// --- Pure function tests (no mocking) ---

describe('calculateRadius', () => {
  it('returns target_distance / (2 * PI * 1.3)', () => {
    const radius = calculateRadius(60);
    const expected = 60 / (2 * Math.PI * 1.3);
    expect(radius).toBeCloseTo(expected, 5);
  });

  it('returns proportionally smaller radius for shorter distances', () => {
    expect(calculateRadius(30)).toBeCloseTo(calculateRadius(60) / 2, 5);
  });
});

describe('generateWaypoints', () => {
  const bearings = [0, 90, 180, 270];
  const radiusKm = 7;

  it('produces the correct number of waypoints', () => {
    const waypoints = generateWaypoints(girona, bearings, radiusKm);
    expect(waypoints).toHaveLength(4);
  });

  it('places waypoints approximately radiusKm from start', () => {
    const waypoints = generateWaypoints(girona, bearings, radiusKm);
    for (const wp of waypoints) {
      expect(haversine(girona, wp)).toBeCloseTo(radiusKm, 0);
    }
  });

  it('bearing 0 produces a point north of start', () => {
    const waypoints = generateWaypoints(girona, [0], radiusKm);
    expect(waypoints[0].lat).toBeGreaterThan(girona.lat);
    expect(waypoints[0].lng).toBeCloseTo(girona.lng, 1);
  });

  it('bearing 90 produces a point east of start', () => {
    const waypoints = generateWaypoints(girona, [90], radiusKm);
    expect(waypoints[0].lng).toBeGreaterThan(girona.lng);
    expect(waypoints[0].lat).toBeCloseTo(girona.lat, 1);
  });
});

describe('calculateElevationGain', () => {
  it('sums only positive elevation changes', () => {
    const geometry: Coordinate3D[] = [
      [0, 0, 100],
      [0, 0, 150], // +50
      [0, 0, 120], // -30 (ignored)
      [0, 0, 200], // +80
    ];
    expect(calculateElevationGain(geometry)).toBe(130);
  });

  it('returns 0 for a flat route', () => {
    const geometry: Coordinate3D[] = [
      [0, 0, 100],
      [0, 0, 100],
      [0, 0, 100],
    ];
    expect(calculateElevationGain(geometry)).toBe(0);
  });

  it('returns 0 for a purely descending route', () => {
    const geometry: Coordinate3D[] = [
      [0, 0, 300],
      [0, 0, 200],
      [0, 0, 100],
    ];
    expect(calculateElevationGain(geometry)).toBe(0);
  });

  it('handles a single-point geometry', () => {
    expect(calculateElevationGain([[0, 0, 100]])).toBe(0);
  });
});

// --- Integration tests (mock fetch for GraphHopper) ---

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const baseParams: RouteParams = {
  start_location: 'Girona, Spain',
  target_distance_km: 60,
  elevation_character: 'hilly',
  road_preference: 'quiet_roads',
  waypoint_bearings: [0, 120, 240],
  reasoning: 'Test bearings',
};

function makeGraphHopperResponse(distanceMeters: number, ascend: number = 500) {
  return {
    ok: true,
    json: async () => ({
      paths: [
        {
          distance: distanceMeters,
          ascend,
          descend: 480,
          points: {
            // GraphHopper returns [lng, lat, ele]
            coordinates: [
              [2.8214, 41.9794, 78],
              [2.85, 42.0, 120],
              [2.83, 41.98, 95],
            ],
          },
        },
      ],
    }),
  };
}

describe('generateRoute', () => {
  it('converts GraphHopper [lng,lat,ele] to [lat,lng,ele]', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    const route = await generateRoute(baseParams, girona);

    // First coordinate should be [lat, lng, ele] not [lng, lat, ele]
    expect(route.geometry[0][0]).toBeCloseTo(41.9794, 3); // lat
    expect(route.geometry[0][1]).toBeCloseTo(2.8214, 3); // lng
    expect(route.geometry[0][2]).toBe(78); // ele
  });

  it('returns result when distance is within tolerance', async () => {
    // 60km target, 60km actual = within ±20%
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    const route = await generateRoute(baseParams, girona);

    expect(route.distance_km).toBe(60);
    expect(route.start_point.lat).toBeCloseTo(girona.lat, 3);
    expect(route.start_point.lng).toBeCloseTo(girona.lng, 3);
  });

  it('converts km to miles correctly', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    const route = await generateRoute(baseParams, girona);

    expect(route.distance_mi).toBeCloseTo(37.3, 0);
  });

  it('converts elevation m to ft correctly', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000, 890));

    const route = await generateRoute(baseParams, girona);

    expect(route.elevation_gain_m).toBe(890);
    expect(route.elevation_gain_ft).toBeCloseTo(2920, -1);
  });

  it('retries when distance is outside tolerance', async () => {
    // First call: 90km (too long, ratio=1.5), second call: 62km (within tolerance)
    mockFetch
      .mockResolvedValueOnce(makeGraphHopperResponse(90000))
      .mockResolvedValueOnce(makeGraphHopperResponse(62000));

    const route = await generateRoute(baseParams, girona);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(route.distance_km).toBe(62);
  });

  it('returns best attempt after max retries', async () => {
    // All calls return 90km (always too long)
    mockFetch.mockResolvedValue(makeGraphHopperResponse(90000));

    const route = await generateRoute(baseParams, girona);

    // Should have tried MAX_RETRIES + 1 times (initial + retries)
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(route.distance_km).toBe(90);
  });

  it('throws on GraphHopper HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    await expect(generateRoute(baseParams, girona)).rejects.toThrow('GraphHopper error 400');
  });

  it('sends points in [lng, lat] order to GraphHopper', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    await generateRoute(baseParams, girona);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const firstPoint = callBody.points[0];
    // GraphHopper expects [lng, lat]
    expect(firstPoint[0]).toBeCloseTo(girona.lng, 3); // lng first
    expect(firstPoint[1]).toBeCloseTo(girona.lat, 3); // lat second
  });
});
