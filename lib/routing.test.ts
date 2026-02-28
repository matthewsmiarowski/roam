import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haversine, projectPoint, type LatLng } from './geo';
import type { Coordinate3D, RouteParams, RouteSegment } from './types';
import {
  calculateRadius,
  generateWaypoints,
  calculateElevationGain,
  generateRoute,
  mergeWaypoints,
  generateRouteSingleAttempt,
  stitchSegments,
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
  start_precision: 'general',
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

/** Create a mock response for a segment call (2-point, no loop closure). */
function makeSegmentResponse(
  distanceMeters: number,
  options?: { ascend?: number; coordinates?: [number, number, number][] }
) {
  return {
    ok: true,
    json: async () => ({
      paths: [
        {
          distance: distanceMeters,
          ascend: options?.ascend ?? 125,
          descend: 120,
          points: {
            coordinates: options?.coordinates ?? [
              [2.8, 42.0, 100],
              [2.85, 42.02, 150],
              [2.9, 42.05, 120],
            ],
          },
        },
      ],
    }),
  };
}

// --- stitchSegments (pure function tests) ---

describe('stitchSegments', () => {
  it('returns empty for no segments', () => {
    const result = stitchSegments([]);
    expect(result.geometry).toEqual([]);
    expect(result.distance_km).toBe(0);
    expect(result.elevation_gain_m).toBe(0);
  });

  it('returns the single segment as-is', () => {
    const seg: RouteSegment = {
      from: { lat: 42.0, lng: 2.8 },
      to: { lat: 42.1, lng: 2.9 },
      geometry: [
        [42.0, 2.8, 100],
        [42.05, 2.85, 150],
        [42.1, 2.9, 120],
      ],
      distance_km: 15,
      elevation_gain_m: 200,
    };
    const result = stitchSegments([seg]);
    expect(result.geometry).toEqual(seg.geometry);
    expect(result.distance_km).toBe(15);
    expect(result.elevation_gain_m).toBe(200);
  });

  it('deduplicates boundary points between segments', () => {
    const seg1: RouteSegment = {
      from: { lat: 42.0, lng: 2.8 },
      to: { lat: 42.1, lng: 2.9 },
      geometry: [
        [42.0, 2.8, 100],
        [42.05, 2.85, 150],
        [42.1, 2.9, 120],
      ],
      distance_km: 10,
      elevation_gain_m: 50,
    };
    const seg2: RouteSegment = {
      from: { lat: 42.1, lng: 2.9 },
      to: { lat: 42.2, lng: 3.0 },
      geometry: [
        [42.1, 2.9, 120], // duplicate of seg1's last point
        [42.15, 2.95, 180],
        [42.2, 3.0, 100],
      ],
      distance_km: 12,
      elevation_gain_m: 60,
    };

    const result = stitchSegments([seg1, seg2]);

    // 3 from seg1 + 2 from seg2 (first point skipped) = 5
    expect(result.geometry).toHaveLength(5);
    expect(result.geometry[2]).toEqual([42.1, 2.9, 120]); // boundary point appears once
    expect(result.geometry[3]).toEqual([42.15, 2.95, 180]);
    expect(result.distance_km).toBe(22);
    expect(result.elevation_gain_m).toBe(110);
  });

  it('sums stats across multiple segments', () => {
    const segments: RouteSegment[] = [
      {
        from: { lat: 0, lng: 0 },
        to: { lat: 1, lng: 1 },
        geometry: [[0, 0, 0], [1, 1, 100]],
        distance_km: 5,
        elevation_gain_m: 100,
      },
      {
        from: { lat: 1, lng: 1 },
        to: { lat: 2, lng: 2 },
        geometry: [[1, 1, 100], [2, 2, 200]],
        distance_km: 7,
        elevation_gain_m: 150,
      },
      {
        from: { lat: 2, lng: 2 },
        to: { lat: 0, lng: 0 },
        geometry: [[2, 2, 200], [0, 0, 50]],
        distance_km: 8,
        elevation_gain_m: 0,
      },
    ];

    const result = stitchSegments(segments);
    expect(result.geometry).toHaveLength(4); // 2 + 1 + 1
    expect(result.distance_km).toBe(20);
    expect(result.elevation_gain_m).toBe(250);
  });
});

// --- callGraphHopperSegment and routeViaSegments ---

describe('callGraphHopperSegment', () => {
  it('sends exactly 2 points (no loop closure)', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const { callGraphHopperSegment } = await import('./routing');
    await callGraphHopperSegment({ lat: 42.0, lng: 2.8 }, { lat: 42.1, lng: 2.9 });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.points).toHaveLength(2);
    expect(callBody.points[0]).toEqual([2.8, 42.0]); // [lng, lat]
    expect(callBody.points[1]).toEqual([2.9, 42.1]);
  });

  it('converts response coordinates from [lng,lat,ele] to [lat,lng,ele]', async () => {
    const coords: [number, number, number][] = [
      [2.8, 42.0, 100],
      [2.9, 42.1, 200],
    ];
    mockFetch.mockResolvedValue(makeSegmentResponse(15000, { coordinates: coords }));

    const { callGraphHopperSegment } = await import('./routing');
    const result = await callGraphHopperSegment(
      { lat: 42.0, lng: 2.8 },
      { lat: 42.1, lng: 2.9 }
    );

    expect(result.geometry[0]).toEqual([42.0, 2.8, 100]); // [lat, lng, ele]
    expect(result.geometry[1]).toEqual([42.1, 2.9, 200]);
  });

  it('throws on GraphHopper error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    const { callGraphHopperSegment } = await import('./routing');
    await expect(
      callGraphHopperSegment({ lat: 42.0, lng: 2.8 }, { lat: 42.1, lng: 2.9 })
    ).rejects.toThrow('GraphHopper error 400');
  });
});

describe('routeViaSegments', () => {
  it('makes N-1 parallel calls for N waypoints', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const { routeViaSegments } = await import('./routing');
    const waypoints: LatLng[] = [
      { lat: 42.0, lng: 2.8 },
      { lat: 42.1, lng: 2.9 },
      { lat: 42.2, lng: 3.0 },
      { lat: 42.0, lng: 2.8 }, // return to start
    ];

    const segments = await routeViaSegments(waypoints);

    expect(mockFetch).toHaveBeenCalledTimes(3); // 4 waypoints = 3 segments
    expect(segments).toHaveLength(3);
  });

  it('returns correct from/to for each segment', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const { routeViaSegments } = await import('./routing');
    const waypoints: LatLng[] = [
      { lat: 42.0, lng: 2.8 },
      { lat: 42.1, lng: 2.9 },
      { lat: 42.0, lng: 2.8 },
    ];

    const segments = await routeViaSegments(waypoints);

    expect(segments[0].from).toEqual({ lat: 42.0, lng: 2.8 });
    expect(segments[0].to).toEqual({ lat: 42.1, lng: 2.9 });
    expect(segments[1].from).toEqual({ lat: 42.1, lng: 2.9 });
    expect(segments[1].to).toEqual({ lat: 42.0, lng: 2.8 });
  });

  it('throws for fewer than 2 waypoints', async () => {
    const { routeViaSegments } = await import('./routing');
    await expect(routeViaSegments([{ lat: 42.0, lng: 2.8 }])).rejects.toThrow(
      'Need at least 2 waypoints'
    );
  });
});

// --- v0: generateRoute (uses callGraphHopper, unchanged) ---

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

    // Loop center rotates by STAR_BEARING_ROTATION (30°) each time a star is detected.
    // Generate star/loop coords matching each attempt's rotated center.
    const center0 = projectPoint(girona, (loopDirection + 0) % 360, radiusKm);
    const center1 = projectPoint(girona, (loopDirection + 30) % 360, radiusKm);
    const center2 = projectPoint(girona, (loopDirection + 60) % 360, radiusKm);

    // Attempt 0: perfect distance but star-shaped
    // Attempt 1: still star (rotated center, star coords match)
    // Attempt 2: non-star loop at 70km (within tolerance)
    // Attempt 3: star again (won't be reached)
    mockFetch
      .mockResolvedValueOnce(
        makeGraphHopperResponse(60000, { coordinates: makeStarCoords(center0, radiusKm, girona) })
      )
      .mockResolvedValueOnce(
        makeGraphHopperResponse(55000, { coordinates: makeStarCoords(center1, radiusKm, girona) })
      )
      .mockResolvedValueOnce(
        makeGraphHopperResponse(70000, { coordinates: makeLoopCoords(center2, radiusKm, girona) })
      )
      .mockResolvedValueOnce(
        makeGraphHopperResponse(60000, { coordinates: makeStarCoords(center2, radiusKm, girona) })
      );

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

  // --- PointNotFound (coastline/water) tests ---

  function makePointNotFoundResponse(pointIndex: number) {
    return {
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          message: `Cannot find point ${pointIndex}: 38.91,0.14`,
          hints: [
            {
              point_index: pointIndex,
              details: 'com.graphhopper.util.exceptions.PointNotFoundException',
            },
          ],
        }),
    };
  }

  it('retries with rotated bearings when a waypoint lands in water', async () => {
    mockFetch
      .mockResolvedValueOnce(makePointNotFoundResponse(2))
      .mockResolvedValueOnce(makeGraphHopperResponse(60000));

    const route = await generateRoute(baseParams, girona);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(route.distance_km).toBe(60);

    // Verify second call used different waypoints (rotated bearings)
    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBody.points[1]).not.toEqual(firstBody.points[1]);
  });

  it('throws immediately when start point is in water (point_index 0)', async () => {
    mockFetch.mockResolvedValue(makePointNotFoundResponse(0));

    await expect(generateRoute(baseParams, girona)).rejects.toThrow(
      'Start location is not near any routable roads'
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws coastline error when all retries hit water', async () => {
    mockFetch.mockResolvedValue(makePointNotFoundResponse(2));

    await expect(generateRoute(baseParams, girona)).rejects.toThrow(
      'Could not find routable roads for waypoints'
    );
    expect(mockFetch).toHaveBeenCalledTimes(8);
  });

  it('PointNotFound retries do not consume distance/star retry budget', async () => {
    // PointNotFound hits (2) + distance retries (4 = initial + MAX_RETRIES)
    // Water, water, then 4 attempts all too long
    mockFetch
      .mockResolvedValueOnce(makePointNotFoundResponse(1))
      .mockResolvedValueOnce(makePointNotFoundResponse(2))
      .mockResolvedValueOnce(makeGraphHopperResponse(90000))
      .mockResolvedValueOnce(makeGraphHopperResponse(90000))
      .mockResolvedValueOnce(makeGraphHopperResponse(90000))
      .mockResolvedValueOnce(makeGraphHopperResponse(90000));

    const route = await generateRoute(baseParams, girona);

    // 2 PointNotFound + 4 routing attempts = 6 total calls
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(route.distance_km).toBe(90);
  });

  it('rotates loop center along with waypoint bearings on PointNotFound retry', async () => {
    mockFetch
      .mockResolvedValueOnce(makePointNotFoundResponse(2))
      .mockResolvedValueOnce(makeGraphHopperResponse(60000));

    await generateRoute(baseParams, girona);

    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);

    // Compute centroid of waypoints (indices 1 to length-2, excluding start and return-to-start)
    const centroid = (points: number[][]) => {
      const wps = points.slice(1, -1);
      const avgLng = wps.reduce((s, p) => s + p[0], 0) / wps.length;
      const avgLat = wps.reduce((s, p) => s + p[1], 0) / wps.length;
      return { lat: avgLat, lng: avgLng };
    };

    const center1 = centroid(firstBody.points);
    const center2 = centroid(secondBody.points);

    // The loop center should have shifted because effectiveLoopDirection rotated by 45°
    const shift = haversine(center1, center2);
    expect(shift).toBeGreaterThan(0.5); // at least 500m shift
  });

  it('non-PointNotFound GraphHopper errors still propagate immediately', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });

    await expect(generateRoute(baseParams, girona)).rejects.toThrow('GraphHopper error 500');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// --- v1: mergeWaypoints ---

describe('mergeWaypoints', () => {
  const bearingWps: LatLng[] = [
    { lat: 42.0, lng: 2.8 },
    { lat: 42.1, lng: 2.9 },
    { lat: 41.9, lng: 2.7 },
  ];

  it('returns all bearing waypoints when no named waypoints', () => {
    const result = mergeWaypoints(bearingWps, []);
    expect(result).toHaveLength(3);
    expect(result).toEqual(bearingWps);
  });

  it('replaces bearing waypoints with named waypoints', () => {
    const named: LatLng[] = [{ lat: 42.03, lng: 2.78 }];
    const result = mergeWaypoints(bearingWps, named);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(named[0]); // named first
    expect(result[1]).toEqual(bearingWps[0]); // remaining bearing slots
    expect(result[2]).toEqual(bearingWps[1]);
  });

  it('caps total at 3 waypoints even with more named', () => {
    const named: LatLng[] = [
      { lat: 42.03, lng: 2.78 },
      { lat: 42.05, lng: 2.75 },
      { lat: 42.08, lng: 2.72 },
      { lat: 42.1, lng: 2.7 }, // 4th — should be dropped
    ];
    const result = mergeWaypoints(bearingWps, named);

    expect(result).toHaveLength(3);
    // All 3 slots taken by named, no bearing waypoints
    expect(result).toEqual(named.slice(0, 3));
  });

  it('fills remaining slots with bearing waypoints', () => {
    const named: LatLng[] = [
      { lat: 42.03, lng: 2.78 },
      { lat: 42.05, lng: 2.75 },
    ];
    const result = mergeWaypoints(bearingWps, named);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(named[0]);
    expect(result[1]).toEqual(named[1]);
    expect(result[2]).toEqual(bearingWps[0]); // 1 bearing slot left
  });
});

// --- generateRouteSingleAttempt (uses segment-based stitching) ---

describe('generateRouteSingleAttempt', () => {
  it('makes 4 segment calls (start + 3 waypoints + return)', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const route = await generateRouteSingleAttempt(baseParams, girona);

    // 3 waypoints = 4 segments: start→wp1, wp1→wp2, wp2→wp3, wp3→start
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(route.start_point).toEqual({ lat: girona.lat, lng: girona.lng });
  });

  it('returns stitched distance as sum of segments', async () => {
    // Each segment returns 15km → total should be 60km
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const route = await generateRouteSingleAttempt(baseParams, girona);

    expect(route.distance_km).toBe(60);
  });

  it('returns segments and waypoints for editing', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const route = await generateRouteSingleAttempt(baseParams, girona);

    expect(route.segments).toHaveLength(4);
    expect(route.waypoints).toHaveLength(5); // start + 3 via + end (=start)
    expect(route.waypoints![0].type).toBe('start');
    expect(route.waypoints![1].type).toBe('via');
    expect(route.waypoints![2].type).toBe('via');
    expect(route.waypoints![3].type).toBe('via');
    expect(route.waypoints![4].type).toBe('start');
  });

  it('sends 2-point requests (no loop closure per segment)', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    await generateRouteSingleAttempt(baseParams, girona);

    // Each call should have exactly 2 points
    for (const call of mockFetch.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.points).toHaveLength(2);
    }
  });

  it('passes named waypoint coords to segment calls', async () => {
    mockFetch.mockResolvedValue(makeSegmentResponse(15000));

    const namedWp: LatLng = { lat: 42.03, lng: 2.78 };
    await generateRouteSingleAttempt(baseParams, girona, [namedWp]);

    // Named waypoint should appear as an endpoint in at least one segment call
    const allPoints = mockFetch.mock.calls.flatMap((call: unknown[]) => {
      const body = JSON.parse((call[1] as { body: string }).body);
      return body.points as number[][];
    });
    const hasNamedWp = allPoints.some(
      (p: number[]) => Math.abs(p[0] - namedWp.lng) < 0.01 && Math.abs(p[1] - namedWp.lat) < 0.01
    );
    expect(hasNamedWp).toBe(true);
  });

  it('propagates GraphHopper errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    });

    await expect(generateRouteSingleAttempt(baseParams, girona)).rejects.toThrow(
      'GraphHopper error 400'
    );
  });
});
