import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocode } from './geocoding';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('geocode', () => {
  it('parses a valid Nominatim response into { lat, lng }', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '41.9794005', lon: '2.8214264' }],
    });

    const result = await geocode('Girona, Spain');

    expect(result.lat).toBeCloseTo(41.9794, 3);
    expect(result.lng).toBeCloseTo(2.8214, 3);
  });

  it('throws when location returns empty array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    await expect(geocode('xyznonexistent')).rejects.toThrow('Location not found');
  });

  it('falls back to simpler location string when first attempt fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // "Historic District, Girona, Spain" fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: '41.9794', lon: '2.8214' }], // "Girona, Spain" succeeds
      });

    const result = await geocode('Historic District, Girona, Spain');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.lat).toBeCloseTo(41.9794, 3);
  });

  it('throws when HTTP response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(geocode('Girona')).rejects.toThrow('Geocoding request failed: 503');
  });

  it('sends the required User-Agent header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '41.0', lon: '2.0' }],
    });

    await geocode('Girona');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'User-Agent': 'Roam/0.1 (cycling route generator)' },
      })
    );
  });

  it('maps Nominatim "lon" field to "lng"', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '51.5074', lon: '-0.1278' }],
    });

    const result = await geocode('London');

    expect(result).toHaveProperty('lng');
    expect(result.lng).toBeCloseTo(-0.1278, 3);
  });
});
