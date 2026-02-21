'use client';

import { useEffect, useMemo, useRef } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapRef } from 'react-map-gl/maplibre';
import type { RouteData, LatLng } from '@/lib/types';

interface RouteMapProps {
  route?: RouteData;
  startPoint?: LatLng | null;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  interactive?: boolean;
}

export function RouteMap({ route, startPoint, onMapClick, interactive }: RouteMapProps) {
  const mapRef = useRef<MapRef>(null);

  const geojson = useMemo(() => {
    if (!route) return null;
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: route.geometry.map(([lat, lng, ele]) => [lng, lat, ele]),
      },
      properties: {},
    };
  }, [route]);

  const bounds = useMemo(() => {
    if (!route) return null;
    let minLat = Infinity,
      maxLat = -Infinity;
    let minLng = Infinity,
      maxLng = -Infinity;
    for (const [lat, lng] of route.geometry) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ] as [[number, number], [number, number]];
  }, [route]);

  useEffect(() => {
    if (mapRef.current && bounds) {
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
    }
  }, [bounds]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: 2.8214,
        latitude: 41.9794,
        zoom: 12,
      }}
      style={{ width: '100%', height: '100%' }}
      cursor={interactive ? 'crosshair' : undefined}
      onClick={(e) => onMapClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
      mapStyle={`https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`}
    >
      {geojson && (
        <Source id="route" type="geojson" data={geojson}>
          <Layer
            id="route-outline"
            type="line"
            paint={{
              'line-color': '#ffffff',
              'line-width': 6,
            }}
          />
          <Layer
            id="route-line"
            type="line"
            paint={{
              'line-color': '#E8503A',
              'line-width': 4,
            }}
          />
        </Source>
      )}
      {route && (
        <Marker longitude={route.start_point.lng} latitude={route.start_point.lat} anchor="center">
          <div
            className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: '#2E7D32' }}
          />
        </Marker>
      )}
      {startPoint && !route && (
        <Marker longitude={startPoint.lng} latitude={startPoint.lat} anchor="center">
          <div className="relative">
            <div
              className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: 'var(--color-accent)' }}
            />
            <div
              className="absolute inset-0 h-4 w-4 rounded-full"
              style={{
                borderColor: 'var(--color-accent)',
                borderWidth: 2,
                animation: 'ping 1.5s ease-out infinite',
              }}
            />
          </div>
        </Marker>
      )}
    </Map>
  );
}
