import { describe, it, expect } from 'vitest';
import { haversine, projectPoint, type LatLng } from './geo';

// Known reference points
const girona: LatLng = { lat: 41.9794, lng: 2.8214 };
const barcelona: LatLng = { lat: 41.3851, lng: 2.1734 };
const london: LatLng = { lat: 51.5074, lng: -0.1278 };
const tokyo: LatLng = { lat: 35.6762, lng: 139.6503 };

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(girona, girona)).toBe(0);
  });

  it('calculates Girona → Barcelona within 1km of known ~85km', () => {
    const dist = haversine(girona, barcelona);
    expect(dist).toBeCloseTo(85.2, 0); // within ±0.5 km
  });

  it('calculates London → Tokyo within 10km of known ~9560km', () => {
    const dist = haversine(london, tokyo);
    expect(dist).toBeCloseTo(9560, -1); // within ±5 km
  });

  it('is symmetric (a→b equals b→a)', () => {
    expect(haversine(girona, barcelona)).toBeCloseTo(haversine(barcelona, girona), 10);
  });
});

describe('projectPoint', () => {
  it('projects north and stays on the same longitude', () => {
    const projected = projectPoint(girona, 0, 10);
    expect(projected.lng).toBeCloseTo(girona.lng, 2);
    expect(projected.lat).toBeGreaterThan(girona.lat);
  });

  it('projects east and stays on the same latitude', () => {
    const projected = projectPoint(girona, 90, 10);
    expect(projected.lat).toBeCloseTo(girona.lat, 2);
    expect(projected.lng).toBeGreaterThan(girona.lng);
  });

  it('round-trips: distance to projected point matches input distance', () => {
    const distanceKm = 25;
    const projected = projectPoint(girona, 135, distanceKm);
    const actual = haversine(girona, projected);
    expect(actual).toBeCloseTo(distanceKm, 1);
  });
});
