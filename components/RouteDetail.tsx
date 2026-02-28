'use client';

import { ChevronLeft, Trash2, Loader2 } from 'lucide-react';
import { RouteStats } from './RouteStats';
import { GpxDownload } from './GpxDownload';
import type { RouteOption, EditingState } from '@/lib/types';

interface RouteDetailProps {
  option: RouteOption;
  onBack: () => void;
  editing?: EditingState | null;
  onDeleteWaypoint?: () => void;
}

/** Estimate ride time: base 25 km/h, minus 1 km/h per 10 m/km climbing ratio. */
function estimateRideTime(distanceKm: number, elevationM: number): string {
  const climbRatio = distanceKm > 0 ? elevationM / distanceKm : 0;
  const speed = Math.max(10, 25 - climbRatio / 10);
  const hours = distanceKm / speed;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function RouteDetail({ option, onBack, editing, onDeleteWaypoint }: RouteDetailProps) {
  const time = estimateRideTime(option.route.distance_km, option.route.elevation_gain_m);
  const slug = option.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Back link */}
      <button
        onClick={onBack}
        className="flex items-center gap-[var(--space-1)] text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors duration-150 hover:text-[var(--color-text-primary)]"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
        Back to options
      </button>

      {/* Route name + color */}
      <div className="flex items-center gap-[var(--space-2)]">
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
        <h3 className="text-[14px] font-bold text-[var(--color-text-primary)]">{option.name}</h3>
      </div>

      {/* Description */}
      <p className="text-[13px] leading-[1.4] text-[var(--color-text-secondary)]">
        {option.description}
      </p>

      {/* Estimated time */}
      <div className="flex items-baseline gap-[var(--space-1)]">
        <span className="text-[11px] font-bold tracking-wider text-[var(--color-text-tertiary)] uppercase">
          EST. TIME
        </span>
        <span
          className="text-[15px] font-bold text-[var(--color-text-primary)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {time}
        </span>
      </div>

      {/* Route stats */}
      <RouteStats route={option.route} />

      {/* GPX download with route name */}
      <GpxDownload gpx={option.gpx} filename={`roam-${slug}.gpx`} />

      {/* Editing controls */}
      {editing && (
        <div className="flex flex-col gap-[var(--space-2)] border-t border-[var(--color-border)] pt-[var(--space-3)]">
          <div className="flex items-center gap-[var(--space-2)] text-[12px] text-[var(--color-text-tertiary)]">
            {editing.isRerouting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Rerouting...</span>
              </>
            ) : editing.error ? (
              <span className="text-[var(--color-error)]">{editing.error}</span>
            ) : (
              <span>Drag waypoints to reshape. Click route to add a point.</span>
            )}
          </div>
          {editing.selectedWaypointIndex !== null && (() => {
            const wp = editing.waypoints[editing.selectedWaypointIndex];
            const canDelete =
              wp?.type === 'via' &&
              editing.waypoints.filter((w) => w.type === 'via').length > 1;
            return canDelete ? (
              <button
                onClick={onDeleteWaypoint}
                disabled={editing.isRerouting}
                className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-[12px] font-medium text-[var(--color-error)] transition-colors duration-150 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Delete waypoint
              </button>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
