'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { RouteOption, LatLng, Coordinate3D, EditingState } from '@/lib/types';
import { findNearestPointIndex } from '@/lib/geo';
import { WaypointMarker } from './WaypointMarker';

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
  /** Full geometry of the selected route (for hover point lookup) */
  selectedGeometry?: Coordinate3D[] | null;
  /** Index into the geometry array currently being hovered */
  hoveredPointIndex?: number | null;
  /** Callback when the user hovers along the route line */
  onHoverPoint?: (index: number | null) => void;
  /** v2 editing state (non-null enables waypoint editing UI) */
  editing?: EditingState | null;
  /** Color of the selected route (used for editing waypoint markers) */
  routeColor?: string;
  /** Callback when a via waypoint is dragged to a new position */
  onMoveWaypoint?: (waypointIndex: number, lat: number, lng: number) => void;
  /** Callback when the user clicks on a segment line to add a waypoint */
  onAddWaypointOnSegment?: (segmentIndex: number, lat: number, lng: number) => void;
  /** Callback when the user selects/deselects a waypoint */
  onSelectWaypoint?: (index: number | null) => void;
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
  selectedGeometry,
  hoveredPointIndex,
  onHoverPoint,
  editing,
  routeColor,
  onMoveWaypoint,
  onAddWaypointOnSegment,
  onSelectWaypoint,
}: RouteMapProps) {
  const mapRef = useRef<MapRef>(null);
  // Guard: skip the next Map click event when a marker drag just completed.
  // Marker drag-end can fire a stray click on the map canvas, which would
  // trigger addWaypoint concurrently with moveWaypoint.
  const skipNextClickRef = useRef(false);

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

  // Hover-on-route detection
  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!mapRef.current) return;

      const point = e.point;
      const bbox: [[number, number], [number, number]] = [
        [point.x - 10, point.y - 10],
        [point.x + 10, point.y + 10],
      ];
      const canvas = mapRef.current.getCanvas();

      // In editing mode, check editing segment layers
      if (editing && editing.segments.length > 0) {
        try {
          const segmentLayerIds = editing.segments.map(
            (_, i) => `editing-segment-line-${i}`
          );
          const features = mapRef.current.queryRenderedFeatures(bbox, {
            layers: segmentLayerIds,
          });
          if (features.length > 0) {
            canvas.style.cursor = 'pointer';
            if (selectedGeometry && onHoverPoint) {
              const index = findNearestPointIndex(
                { lat: e.lngLat.lat, lng: e.lngLat.lng },
                selectedGeometry
              );
              onHoverPoint(index);
            }
          } else {
            canvas.style.cursor = '';
            onHoverPoint?.(null);
          }
        } catch {
          // Segment layers may not be rendered yet
        }
        return;
      }

      // Non-editing hover detection
      if (!selectedGeometry || !onHoverPoint) return;
      if (selectedRouteIndex === null || selectedRouteIndex === undefined) return;

      const features = mapRef.current.queryRenderedFeatures(bbox, {
        layers: [`route-line-${selectedRouteIndex}`],
      });

      if (features.length > 0) {
        canvas.style.cursor = 'pointer';
        const index = findNearestPointIndex(
          { lat: e.lngLat.lat, lng: e.lngLat.lng },
          selectedGeometry
        );
        onHoverPoint(index);
      } else {
        canvas.style.cursor = interactive ? 'crosshair' : '';
        onHoverPoint(null);
      }
    },
    [editing, selectedGeometry, onHoverPoint, selectedRouteIndex, interactive]
  );

  const handleMouseLeave = useCallback(() => {
    onHoverPoint?.(null);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = interactive ? 'crosshair' : '';
    }
  }, [onHoverPoint, interactive]);

  // Hover marker position
  const hoverMarkerCoord =
    hoveredPointIndex !== null &&
    hoveredPointIndex !== undefined &&
    selectedGeometry &&
    selectedGeometry[hoveredPointIndex]
      ? selectedGeometry[hoveredPointIndex]
      : null;

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
      onClick={(e) => {
        // Guard: a marker drag just completed — ignore the stray click
        if (skipNextClickRef.current) {
          skipNextClickRef.current = false;
          return;
        }

        // In editing mode, handle all click types here and return
        if (editing && editing.segments.length > 0 && mapRef.current) {
          try {
            const segmentLayerIds = editing.segments.map(
              (_, i) => `editing-segment-line-${i}`
            );
            const clickBbox: [[number, number], [number, number]] = [
              [e.point.x - 5, e.point.y - 5],
              [e.point.x + 5, e.point.y + 5],
            ];
            const features = mapRef.current.queryRenderedFeatures(clickBbox, {
              layers: segmentLayerIds,
            });
            if (features.length > 0) {
              const layerId = features[0].layer?.id;
              const match = layerId?.match(/editing-segment-line-(\d+)/);
              if (match) {
                onAddWaypointOnSegment?.(
                  parseInt(match[1], 10),
                  e.lngLat.lat,
                  e.lngLat.lng
                );
                return;
              }
            }
          } catch {
            // Segment layers may not be rendered yet
          }
          // Click on empty map in editing mode — just clear waypoint selection
          onSelectWaypoint?.(null);
          return;
        }

        onMapClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      mapStyle={`https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`}
    >
      {/* Multi-route: render each route option */}
      {multiRouteData?.map((data, index) => {
        // In detail mode, only show selected route
        if (showSingleSelected && index !== selectedRouteIndex) return null;
        // In editing mode, per-segment lines replace the selected route line
        if (editing && index === selectedRouteIndex) return null;

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

      {/* Editing: per-segment route lines */}
      {editing &&
        editing.segments.map((segment, segIdx) => {
          const geojson = routeToGeoJSON(segment.geometry);
          return (
            <Source
              key={`editing-segment-${segIdx}`}
              id={`editing-segment-${segIdx}`}
              type="geojson"
              data={geojson}
            >
              <Layer
                id={`editing-segment-outline-${segIdx}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': '#ffffff',
                  'line-width': 6,
                  'line-opacity': editing.isRerouting ? 0.5 : 1,
                }}
              />
              <Layer
                id={`editing-segment-line-${segIdx}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': routeColor || 'var(--color-accent)',
                  'line-width': 4,
                  'line-opacity': editing.isRerouting ? 0.5 : 1,
                }}
              />
            </Source>
          );
        })}

      {/* Editing: waypoint markers */}
      {editing &&
        editing.waypoints.map((wp, wpIdx) => {
          // Skip the last waypoint (loop return to start — same position as first)
          if (wpIdx === editing.waypoints.length - 1 && wp.type === 'start') return null;

          const isStart = wp.type === 'start';
          const viaNumber = isStart
            ? undefined
            : editing.waypoints.slice(0, wpIdx).filter((w) => w.type === 'via').length + 1;

          return (
            <WaypointMarker
              key={wp.id}
              lat={wp.lat}
              lng={wp.lng}
              type={isStart ? 'start' : 'via'}
              viaNumber={viaNumber}
              color={routeColor || 'var(--color-accent)'}
              selected={editing.selectedWaypointIndex === wpIdx}
              draggable={!isStart && !editing.isRerouting}
              onDragEnd={(lat, lng) => {
                skipNextClickRef.current = true;
                setTimeout(() => { skipNextClickRef.current = false; }, 0);
                onMoveWaypoint?.(wpIdx, lat, lng);
              }}
              onClick={() => {
                if (!isStart) {
                  onSelectWaypoint?.(
                    editing.selectedWaypointIndex === wpIdx ? null : wpIdx
                  );
                }
              }}
            />
          );
        })}

      {/* Start marker (all routes share the same start) */}
      {multiRouteData && multiRouteData.length > 0 && !editing && (
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

      {/* Hover point marker (synced with elevation profile) */}
      {hoverMarkerCoord && (
        <Marker
          longitude={hoverMarkerCoord[1]}
          latitude={hoverMarkerCoord[0]}
          anchor="center"
        >
          <div
            className="h-3 w-3 rounded-full border-2 border-white"
            style={{
              backgroundColor: 'var(--color-accent)',
              boxShadow: '0 0 6px rgba(0,0,0,0.3)',
            }}
          />
        </Marker>
      )}
    </Map>
  );
}
