'use client';

import { Marker } from 'react-map-gl/maplibre';
import type { MarkerDragEvent } from 'react-map-gl/maplibre';

interface WaypointMarkerProps {
  lat: number;
  lng: number;
  type: 'start' | 'via';
  /** 1-based display number for via waypoints */
  viaNumber?: number;
  color: string;
  selected?: boolean;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
  onClick?: () => void;
}

export function WaypointMarker({
  lat,
  lng,
  type,
  viaNumber,
  color,
  selected,
  draggable,
  onDragEnd,
  onClick,
}: WaypointMarkerProps) {
  const handleDragEnd = (e: MarkerDragEvent) => {
    onDragEnd?.(e.lngLat.lat, e.lngLat.lng);
  };

  const isStart = type === 'start';
  const size = isStart ? 16 : 24;
  // Invisible hit target around draggable markers — 44px is Apple's minimum touch target
  const hitSize = draggable ? 44 : size;

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="center"
      draggable={draggable}
      onDragEnd={handleDragEnd}
      style={{ zIndex: draggable ? 10 : 1 }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        style={{
          width: hitSize,
          height: hitSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: draggable ? 'grab' : 'pointer',
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: isStart ? 'var(--color-route-start)' : color,
            border: '2px solid white',
            boxShadow: selected ? `0 0 0 3px ${color}` : '0 1px 3px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: 'white',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {!isStart && viaNumber !== undefined ? viaNumber : null}
        </div>
      </div>
    </Marker>
  );
}
