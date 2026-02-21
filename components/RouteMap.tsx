'use client';

import { useEffect, useMemo, useRef } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapRef } from 'react-map-gl/maplibre';
import type { RouteOption, LatLng } from '@/lib/types';

interface RouteMapProps {
  /** Multiple route options displayed simultaneously */
  routes?: RouteOption[];
  /** Index of route currently hovered in the chat panel */
  hoveredRouteIndex?: number | null;
  /** Index of the selected route (detail view) */
  selectedRouteIndex?: number | null;
  startPoint?: LatLng | null;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  interactive?: boolean;
}

function routeToGeoJSON(geometry: [number, number, number][]) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: geometry.map(([lat, lng, ele]) => [lng, lat, ele]),
    },
    properties: {},
  };
}

function computeBounds(routes: { geometry: [number, number, number][] }[]) {
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;
  for (const route of routes) {
    for (const [lat, lng] of route.geometry) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (minLat === Infinity) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

export function RouteMap({
  routes,
  hoveredRouteIndex,
  selectedRouteIndex,
  startPoint,
  onMapClick,
  interactive,
}: RouteMapProps) {
  const mapRef = useRef<MapRef>(null);

  // Multi-route GeoJSON sources
  const multiRouteData = useMemo(() => {
    if (!routes) return null;
    return routes.map((opt) => ({
      geojson: routeToGeoJSON(opt.route.geometry),
      color: opt.color,
      startPoint: opt.route.start_point,
    }));
  }, [routes]);

  // Compute bounds from all visible routes
  const bounds = useMemo(() => {
    if (routes && routes.length > 0) {
      // In detail mode, only fit the selected route
      if (selectedRouteIndex !== null && selectedRouteIndex !== undefined) {
        const selected = routes[selectedRouteIndex];
        if (selected) return computeBounds([selected.route]);
      }
      return computeBounds(routes.map((r) => r.route));
    }
    return null;
  }, [routes, selectedRouteIndex]);

  useEffect(() => {
    if (mapRef.current && bounds) {
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
    }
  }, [bounds]);

  // Determine which routes to show in detail mode
  const showSingleSelected =
    selectedRouteIndex !== null && selectedRouteIndex !== undefined && routes;

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
      {/* Multi-route: render each route option */}
      {multiRouteData?.map((data, index) => {
        // In detail mode, only show selected route
        if (showSingleSelected && index !== selectedRouteIndex) return null;

        const isHovered = hoveredRouteIndex === index;
        const isDimmed =
          hoveredRouteIndex !== null &&
          hoveredRouteIndex !== undefined &&
          hoveredRouteIndex !== index &&
          !showSingleSelected;

        return (
          <Source key={`route-${index}`} id={`route-${index}`} type="geojson" data={data.geojson}>
            <Layer
              id={`route-outline-${index}`}
              type="line"
              paint={{
                'line-color': '#ffffff',
                'line-width': isHovered ? 8 : 6,
                'line-opacity': isDimmed ? 0.3 : 1,
              }}
            />
            <Layer
              id={`route-line-${index}`}
              type="line"
              paint={{
                'line-color': data.color,
                'line-width': isHovered ? 5 : 4,
                'line-opacity': isDimmed ? 0.3 : 1,
              }}
            />
          </Source>
        );
      })}

      {/* Start marker (all routes share the same start) */}
      {multiRouteData && multiRouteData.length > 0 && (
        <Marker
          longitude={multiRouteData[0].startPoint.lng}
          latitude={multiRouteData[0].startPoint.lat}
          anchor="center"
        >
          <div
            className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: 'var(--color-route-start)' }}
          />
        </Marker>
      )}

      {/* Start point marker (from map click, before routes are generated) */}
      {startPoint && (!routes || routes.length === 0) && (
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
