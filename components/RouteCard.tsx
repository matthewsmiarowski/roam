import type { RouteOption } from '@/lib/types';

interface RouteCardProps {
  option: RouteOption;
  index: number;
  onSelect: () => void;
  onHover?: (hovering: boolean) => void;
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

/** Climbing difficulty: m gained per km ridden. */
function getDifficultyBadge(
  distanceKm: number,
  elevationM: number
): { label: string; color: string } {
  const ratio = distanceKm > 0 ? elevationM / distanceKm : 0;
  if (ratio < 10) return { label: 'Easy', color: 'var(--color-success)' };
  if (ratio < 15) return { label: 'Moderate', color: 'var(--color-warning)' };
  if (ratio < 20) return { label: 'Hard', color: 'var(--color-accent)' };
  return { label: 'Brutal', color: 'var(--color-error)' };
}

export function RouteCard({ option, index, onSelect, onHover }: RouteCardProps) {
  const time = estimateRideTime(option.route.distance_km, option.route.elevation_gain_m);
  const difficulty = getDifficultyBadge(option.route.distance_km, option.route.elevation_gain_m);
  const optionLabel = `Option ${index + 1}`;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className="group w-full cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)] text-left transition-all duration-150 ease-out hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-sm)]"
    >
      {/* Color bar + name */}
      <div className="mb-[var(--space-2)] flex items-center gap-[var(--space-2)]">
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
        <span className="text-[13px] leading-tight font-bold text-[var(--color-text-primary)]">
          {option.name}
        </span>
      </div>

      {/* Stats row */}
      <div className="mb-[var(--space-1)] flex items-center gap-[var(--space-3)] text-[12px] text-[var(--color-text-secondary)]">
        <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {option.route.distance_km} km
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {option.route.elevation_gain_m.toLocaleString()} m
        </span>
        <span>{time}</span>
        <span
          className="rounded-[var(--radius-full)] px-[6px] py-[1px] text-[11px] font-semibold text-white"
          style={{ backgroundColor: difficulty.color }}
        >
          {difficulty.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-[12px] leading-[1.4] text-[var(--color-text-tertiary)]">
        {option.description}
      </p>

      {/* Subtle option label */}
      <div className="mt-[var(--space-2)] text-[11px] font-medium text-[var(--color-text-tertiary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {optionLabel} — Click to select
      </div>
    </button>
  );
}
