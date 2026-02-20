import { describe, it, expect } from 'vitest';
import { generateGpx } from './gpx';
import type { Coordinate3D } from './types';

const sampleCoords: Coordinate3D[] = [
  [41.9794, 2.8214, 78.3],
  [42.0, 2.85, 120.7],
  [41.98, 2.83, 95.0],
];

describe('generateGpx', () => {
  it('produces valid GPX 1.1 XML structure', () => {
    const gpx = generateGpx(sampleCoords);

    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx).toContain('<trk>');
    expect(gpx).toContain('<trkseg>');
  });

  it('contains the correct number of trackpoints', () => {
    const gpx = generateGpx(sampleCoords);
    const matches = gpx.match(/<trkpt/g);

    expect(matches).toHaveLength(3);
  });

  it('embeds lat, lon, and ele correctly', () => {
    const gpx = generateGpx(sampleCoords);

    expect(gpx).toContain('lat="41.9794"');
    expect(gpx).toContain('lon="2.8214"');
    expect(gpx).toContain('<ele>78.3</ele>');
  });

  it('formats elevation to 1 decimal place', () => {
    const coords: Coordinate3D[] = [[41.0, 2.0, 100.456]];
    const gpx = generateGpx(coords);

    expect(gpx).toContain('<ele>100.5</ele>');
  });

  it('escapes XML special characters in route name', () => {
    const gpx = generateGpx(sampleCoords, 'Route with <special> & "chars"');

    expect(gpx).toContain('Route with &lt;special&gt; &amp; &quot;chars&quot;');
    expect(gpx).not.toContain('<special>');
  });

  it('handles empty coordinate array', () => {
    const gpx = generateGpx([]);

    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('</trkseg>');
    expect(gpx).not.toContain('<trkpt');
  });

  it('uses default name when none provided', () => {
    const gpx = generateGpx(sampleCoords);

    expect(gpx).toContain('<name>Roam Route</name>');
  });

  it('uses custom name when provided', () => {
    const gpx = generateGpx(sampleCoords, 'My Epic Ride');

    expect(gpx).toContain('<name>My Epic Ride</name>');
  });
});
