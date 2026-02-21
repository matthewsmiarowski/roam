import { describe, it, expect } from 'vitest';
import { haversine, projectPoint, isStarShaped, type LatLng } from './geo';
import type { Coordinate3D } from './types';

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

describe('isStarShaped', () => {
  const start: LatLng = { lat: 41.9794, lng: 2.8214 };
  const radiusKm = 5;

  // Helper: build a loop geometry that stays far from start
  function makeLoopGeometry(numPoints: number): Coordinate3D[] {
    const points: Coordinate3D[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const bearing = (360 * i) / numPoints;
      const fraction = i === 0 || i === numPoints ? 0 : 1;
      const p = fraction === 0 ? start : projectPoint(start, bearing, radiusKm);
      points.push([p.lat, p.lng, 100]);
    }
    return points;
  }

  // Helper: build a star geometry that returns to start between spokes
  function makeStarGeometry(): Coordinate3D[] {
    const north = projectPoint(start, 0, radiusKm);
    const east = projectPoint(start, 120, radiusKm);
    const south = projectPoint(start, 240, radiusKm);
    return [
      [start.lat, start.lng, 100],
      [north.lat, north.lng, 150],
      [start.lat, start.lng, 100], // returns to start
      [east.lat, east.lng, 130],
      [start.lat, start.lng, 100], // returns to start
      [south.lat, south.lng, 120],
      [start.lat, start.lng, 100],
    ];
  }

  it('detects a star-shaped route that returns to start mid-route', () => {
    expect(isStarShaped(makeStarGeometry(), start, radiusKm)).toBe(true);
  });

  it('accepts a proper loop that stays away from start', () => {
    expect(isStarShaped(makeLoopGeometry(20), start, radiusKm)).toBe(false);
  });

  it('ignores start proximity in the first and last 10% of geometry', () => {
    // 20 points where first 2 and last 2 are at start, but middle is far away
    const loop = makeLoopGeometry(20);
    // First and last points are already at start — this should not trigger detection
    expect(isStarShaped(loop, start, radiusKm)).toBe(false);
  });

  it('does not trigger for a point just outside the 25% threshold', () => {
    // Point at 30% of radius (1.5km) — outside the 25% threshold (1.25km)
    const borderPoint = projectPoint(start, 45, radiusKm * 0.3);
    const far = projectPoint(start, 90, radiusKm);
    const geometry: Coordinate3D[] = [
      [start.lat, start.lng, 100],
      ...Array.from({ length: 8 }, () => [far.lat, far.lng, 100] as Coordinate3D),
      [borderPoint.lat, borderPoint.lng, 100],
      ...Array.from({ length: 8 }, () => [far.lat, far.lng, 100] as Coordinate3D),
      [start.lat, start.lng, 100],
    ];
    expect(isStarShaped(geometry, start, radiusKm)).toBe(false);
  });

  it('triggers for a point inside the 25% threshold', () => {
    // Point at 20% of radius (1.0km) — inside the 25% threshold (1.25km)
    const closePoint = projectPoint(start, 45, radiusKm * 0.2);
    const far = projectPoint(start, 0, radiusKm);
    const geometry: Coordinate3D[] = [
      [start.lat, start.lng, 100],
      ...Array.from({ length: 8 }, () => [far.lat, far.lng, 100] as Coordinate3D),
      [closePoint.lat, closePoint.lng, 100],
      ...Array.from({ length: 8 }, () => [far.lat, far.lng, 100] as Coordinate3D),
      [start.lat, start.lng, 100],
    ];
    expect(isStarShaped(geometry, start, radiusKm)).toBe(true);
  });

  it('handles very short geometry without crashing', () => {
    const geometry: Coordinate3D[] = [
      [start.lat, start.lng, 100],
      [start.lat, start.lng, 100],
    ];
    expect(isStarShaped(geometry, start, radiusKm)).toBe(false);
  });
});
