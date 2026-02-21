import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haversine, projectPoint, type LatLng } from './geo';
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

/** The loop direction used by generateRoute (first bearing from baseParams). */
const loopDirection = baseParams.waypoint_bearings[0];

/** Generate ~20 points tracing a circular loop in GraphHopper [lng, lat, ele] format. */
function makeLoopCoords(
  loopCenter: LatLng,
  radiusKm: number,
  start?: LatLng
): [number, number, number][] {
  const numPoints = 20;
  const coords: [number, number, number][] = [];
  const endpoint = start ?? loopCenter;
  for (let i = 0; i <= numPoints; i++) {
    const bearing = (360 * i) / numPoints;
    const isEndpoint = i === 0 || i === numPoints;
    const p = isEndpoint ? endpoint : projectPoint(loopCenter, bearing, radiusKm);
    coords.push([p.lng, p.lat, 100 + Math.sin((bearing * Math.PI) / 180) * 50]);
  }
  return coords;
}

/** Generate a star-shaped geometry (out-and-back spokes) in GraphHopper [lng, lat, ele] format. */
function makeStarCoords(
  loopCenter: LatLng,
  radiusKm: number,
  start?: LatLng
): [number, number, number][] {
  const bearings = [0, 120, 240];
  const endpoint = start ?? loopCenter;
  const coords: [number, number, number][] = [[endpoint.lng, endpoint.lat, 100]];
  for (const b of bearings) {
    // Add several intermediate points going out so there's enough geometry
    for (let f = 0.25; f <= 1; f += 0.25) {
      const p = projectPoint(loopCenter, b, radiusKm * f);
      coords.push([p.lng, p.lat, 100 + f * 50]);
    }
    // Return to loop center (the star-shaped part)
    coords.push([loopCenter.lng, loopCenter.lat, 100]);
  }
  coords.push([endpoint.lng, endpoint.lat, 100]);
  return coords;
}

function makeGraphHopperResponse(
  distanceMeters: number,
  options?: { ascend?: number; coordinates?: [number, number, number][] }
) {
  const radiusKm = calculateRadius(distanceMeters / 1000);
  const loopCenter = projectPoint(girona, loopDirection, radiusKm);
  return {
    ok: true,
    json: async () => ({
      paths: [
        {
          distance: distanceMeters,
          ascend: options?.ascend ?? 500,
          descend: 480,
          points: {
            coordinates: options?.coordinates ?? makeLoopCoords(loopCenter, radiusKm, girona),
          },
        },
      ],
    }),
  };
}

describe('generateRoute', () => {
  it('converts GraphHopper [lng,lat,ele] to [lat,lng,ele]', async () => {
    const coords: [number, number, number][] = [
      [2.8214, 41.9794, 78],
      [2.85, 42.0, 120],
      [2.83, 41.98, 95],
    ];
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000, { coordinates: coords }));

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
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000, { ascend: 890 }));

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

  it('accepts non-star route with good distance on first attempt', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    const route = await generateRoute(baseParams, girona);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(route.distance_km).toBe(60);
  });

  it('detects star-shaped route and retries with rotated bearings', async () => {
    const radiusKm = calculateRadius(60);
    const loopCenter = projectPoint(girona, loopDirection, radiusKm);
    const starCoords = makeStarCoords(loopCenter, radiusKm, girona);
    const loopCoords = makeLoopCoords(loopCenter, radiusKm, girona);

    mockFetch
      .mockResolvedValueOnce(makeGraphHopperResponse(60000, { coordinates: starCoords }))
      .mockResolvedValueOnce(makeGraphHopperResponse(60000, { coordinates: loopCoords }));

    await generateRoute(baseParams, girona);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Verify second call used different waypoints (rotated bearings)
    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBody.points[1]).not.toEqual(firstBody.points[1]);
  });

  it('prefers non-star result over closer distance match', async () => {
    const radiusKm = calculateRadius(60);
    const loopCenter = projectPoint(girona, loopDirection, radiusKm);
    const starCoords = makeStarCoords(loopCenter, radiusKm, girona);
    const loopCoords = makeLoopCoords(loopCenter, radiusKm, girona);

    // Attempt 1: perfect distance but star-shaped
    // Attempt 2: still star (rotated but still star)
    // Attempt 3: non-star but 70km (within tolerance)
    // Attempt 4: star again
    mockFetch
      .mockResolvedValueOnce(makeGraphHopperResponse(60000, { coordinates: starCoords }))
      .mockResolvedValueOnce(makeGraphHopperResponse(55000, { coordinates: starCoords }))
      .mockResolvedValueOnce(makeGraphHopperResponse(70000, { coordinates: loopCoords }))
      .mockResolvedValueOnce(makeGraphHopperResponse(60000, { coordinates: starCoords }));

    const route = await generateRoute(baseParams, girona);

    // Should return the 70km loop, not the 60km star
    expect(route.distance_km).toBe(70);
  });

  it('falls back to star-shaped result if no loop found in all retries', async () => {
    const radiusKm = calculateRadius(60);
    const loopCenter = projectPoint(girona, loopDirection, radiusKm);
    const starCoords = makeStarCoords(loopCenter, radiusKm, girona);

    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000, { coordinates: starCoords }));

    const route = await generateRoute(baseParams, girona);

    // Should still return a result, not throw
    expect(route.distance_km).toBe(60);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('generates waypoints around offset loop center, not start', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    await generateRoute(baseParams, girona);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const radiusKm = calculateRadius(60);
    const loopCenter = projectPoint(girona, loopDirection, radiusKm);

    // Each waypoint (indices 1-3) should be ~radiusKm from loopCenter
    for (let i = 1; i <= 3; i++) {
      const [lng, lat] = callBody.points[i];
      const dist = haversine(loopCenter, { lat, lng });
      expect(dist).toBeCloseTo(radiusKm, 0);
    }

    // Start point should also be ~radiusKm from loopCenter (on circumference)
    const [startLng, startLat] = callBody.points[0];
    const startDist = haversine(loopCenter, { lat: startLat, lng: startLng });
    expect(startDist).toBeCloseTo(radiusKm, 0);
  });

  it('sorts waypoints clockwise from start position on circumference', async () => {
    mockFetch.mockResolvedValue(makeGraphHopperResponse(60000));

    await generateRoute(baseParams, girona);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const radiusKm = calculateRadius(60);
    const loopCenter = projectPoint(girona, loopDirection, radiusKm);

    // For bearings [0, 120, 240] with loopDirection=0:
    // startAngle = 180, sorted order should be [240, 0, 120]
    const expected1 = projectPoint(loopCenter, 240, radiusKm);
    const expected2 = projectPoint(loopCenter, 0, radiusKm);
    const expected3 = projectPoint(loopCenter, 120, radiusKm);

    const wp1 = { lat: callBody.points[1][1], lng: callBody.points[1][0] };
    const wp2 = { lat: callBody.points[2][1], lng: callBody.points[2][0] };
    const wp3 = { lat: callBody.points[3][1], lng: callBody.points[3][0] };

    expect(haversine(wp1, expected1)).toBeLessThan(0.1);
    expect(haversine(wp2, expected2)).toBeLessThan(0.1);
    expect(haversine(wp3, expected3)).toBeLessThan(0.1);
  });
});
