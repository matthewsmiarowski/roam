import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RouteParams, RouteData } from '@/lib/types';

vi.mock('@/lib/llm', () => ({
  extractRouteParams: vi.fn(),
}));

vi.mock('@/lib/geocoding', () => ({
  geocode: vi.fn(),
}));

vi.mock('@/lib/routing', () => ({
  generateRoute: vi.fn(),
}));

vi.mock('@/lib/gpx', () => ({
  generateGpx: vi.fn(),
}));

const { extractRouteParams } = await import('@/lib/llm');
const { geocode } = await import('@/lib/geocoding');
const { generateRoute } = await import('@/lib/routing');
const { generateGpx } = await import('@/lib/gpx');
const { POST } = await import('./route');

const mockExtract = vi.mocked(extractRouteParams);
const mockGeocode = vi.mocked(geocode);
const mockGenerate = vi.mocked(generateRoute);
const mockGpx = vi.mocked(generateGpx);

const sampleParams: RouteParams = {
  start_location: 'Girona, Catalonia, Spain',
  start_precision: 'general',
  target_distance_km: 60,
  elevation_character: 'hilly',
  road_preference: 'quiet_roads',
  waypoint_bearings: [0, 90, 180, 270],
  reasoning: 'Hills are north.',
};

const sampleRoute: RouteData = {
  geometry: [
    [41.9794, 2.8214, 78],
    [42.0, 2.85, 120],
  ],
  distance_km: 62.3,
  distance_mi: 38.7,
  elevation_gain_m: 890,
  elevation_gain_ft: 2920,
  start_point: { lat: 41.9794, lng: 2.8214 },
};

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/generate-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/generate-route', () => {
  it('returns 400 when prompt is missing', async () => {
    const res = await POST(makeRequest({}) as never);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe('error');
    expect(data.message).toContain('prompt is required');
  });

  it('returns success response with correct shape', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockResolvedValue({ lat: 41.9794, lng: 2.8214 });
    mockGenerate.mockResolvedValue(sampleRoute);
    mockGpx.mockReturnValue('<gpx>mock</gpx>');

    const res = await POST(makeRequest({ prompt: '60km hilly loop from Girona' }) as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.route.distance_km).toBe(62.3);
    expect(data.gpx).toBe('<gpx>mock</gpx>');
    expect(data.metadata.parsed_params.start_location).toBe('Girona, Catalonia, Spain');
    expect(data.metadata.llm_reasoning).toBe('Hills are north.');
  });

  it('returns user-friendly error when geocoding fails', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockRejectedValue(new Error('Location not found: "xyzplace"'));

    const res = await POST(makeRequest({ prompt: 'ride from xyzplace' }) as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain("couldn't find");
    expect(data.message).toContain('Girona, Catalonia, Spain');
  });

  it('returns user-friendly error when LLM fails', async () => {
    mockExtract.mockRejectedValue(new Error('LLM did not return route parameters'));

    const res = await POST(makeRequest({ prompt: 'nonsense' }) as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain("couldn't understand that request");
  });

  it('returns user-friendly error when routing fails', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockResolvedValue({ lat: 41.9794, lng: 2.8214 });
    mockGenerate.mockRejectedValue(new Error('GraphHopper error 400: no route found'));

    const res = await POST(makeRequest({ prompt: '60km from Girona' }) as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain("Couldn't generate a route");
  });

  it('passes user_location through to extractRouteParams', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockResolvedValue({ lat: 41.9794, lng: 2.8214 });
    mockGenerate.mockResolvedValue(sampleRoute);
    mockGpx.mockReturnValue('<gpx/>');

    const userLocation = { latitude: 41.9, longitude: 2.8 };
    await POST(makeRequest({ prompt: 'ride from here', user_location: userLocation }) as never);

    expect(mockExtract).toHaveBeenCalledWith('ride from here', userLocation);
  });

  it('uses explicit start_coordinates and skips geocoding', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGenerate.mockResolvedValue(sampleRoute);
    mockGpx.mockReturnValue('<gpx/>');

    const startCoords = { lat: 42.123, lng: 2.456 };
    await POST(makeRequest({ prompt: 'ride from here', start_coordinates: startCoords }) as never);

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledWith(sampleParams, startCoords);
  });

  it('uses GPS coordinates when precision is exact and user_location available', async () => {
    const exactParams = { ...sampleParams, start_precision: 'exact' as const };
    mockExtract.mockResolvedValue(exactParams);
    mockGenerate.mockResolvedValue(sampleRoute);
    mockGpx.mockReturnValue('<gpx/>');

    const userLocation = { latitude: 41.9, longitude: 2.8 };
    await POST(makeRequest({ prompt: 'ride from here', user_location: userLocation }) as never);

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledWith(exactParams, { lat: 41.9, lng: 2.8 });
  });

  it('falls back to geocoding when precision is exact but no user_location', async () => {
    const exactParams = { ...sampleParams, start_precision: 'exact' as const };
    mockExtract.mockResolvedValue(exactParams);
    mockGeocode.mockResolvedValue({ lat: 41.9794, lng: 2.8214 });
    mockGenerate.mockResolvedValue(sampleRoute);
    mockGpx.mockReturnValue('<gpx/>');

    await POST(makeRequest({ prompt: 'ride from 123 Main St, Girona' }) as never);

    expect(mockGeocode).toHaveBeenCalledWith('Girona, Catalonia, Spain');
    expect(mockGenerate).toHaveBeenCalledWith(exactParams, { lat: 41.9794, lng: 2.8214 });
  });

  it('geocodes normally when precision is general', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockResolvedValue({ lat: 41.9794, lng: 2.8214 });
    mockGenerate.mockResolvedValue(sampleRoute);
    mockGpx.mockReturnValue('<gpx/>');

    await POST(makeRequest({ prompt: '60km ride around Girona' }) as never);

    expect(mockGeocode).toHaveBeenCalledWith('Girona, Catalonia, Spain');
  });

  it('returns coastline error when waypoints land in water', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockResolvedValue({ lat: 41.9794, lng: 2.8214 });
    mockGenerate.mockRejectedValue(
      new Error(
        'Could not find routable roads for waypoints in this area. ' +
          'The location may be too close to water or the coastline. ' +
          'Try starting further inland or in a different area.'
      )
    );

    const res = await POST(makeRequest({ prompt: '60km from coast' }) as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('coastline');
    expect(data.message).toContain('further inland');
  });

  it('returns start-in-water error when start point is unroutable', async () => {
    mockExtract.mockResolvedValue(sampleParams);
    mockGeocode.mockResolvedValue({ lat: 38.84, lng: 0.09 });
    mockGenerate.mockRejectedValue(
      new Error('Start location is not near any routable roads. Try a different starting point.')
    );

    const res = await POST(makeRequest({ prompt: 'ride from the ocean' }) as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.message).toContain('start point');
    expect(data.message).toContain('water');
  });
});
