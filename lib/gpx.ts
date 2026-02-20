/**
 * GPX XML generation.
 *
 * Produces a valid GPX 1.1 file from route coordinates.
 */

import type { Coordinate3D } from './types';

/**
 * Generate a GPX XML string from route coordinates.
 *
 * @param coordinates - array of [lat, lng, elevation] tuples
 * @param name - route name embedded in the GPX metadata
 */
export function generateGpx(coordinates: Coordinate3D[], name: string = 'Roam Route'): string {
  const safeName = escapeXml(name);
  const trackpoints = coordinates
    .map(
      ([lat, lng, ele]) =>
        `      <trkpt lat="${lat}" lon="${lng}"><ele>${ele.toFixed(1)}</ele></trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Roam"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${safeName}</name></metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trackpoints}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
