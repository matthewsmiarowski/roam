import type { RouteData } from '@/lib/types';

interface RouteStatsProps {
  route: RouteData;
}

export function RouteStats({ route }: RouteStatsProps) {
  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <div className="flex gap-[var(--space-6)]">
        <StatItem label="DISTANCE" value={route.distance_km} unit="km" />
        <StatItem label="DISTANCE" value={route.distance_mi} unit="mi" />
      </div>
      <div className="border-t border-[var(--color-border)] pt-[var(--space-4)]">
        <div className="flex gap-[var(--space-6)]">
          <StatItem label="ELEVATION" value={route.elevation_gain_m} unit="m" />
          <StatItem label="ELEVATION" value={route.elevation_gain_ft} unit="ft" />
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold tracking-wider text-[var(--color-text-tertiary)] uppercase">
        {label}
      </span>
      <div className="flex items-baseline gap-[var(--space-1)]">
        <span
          className="text-[24px] leading-[1.1] font-extrabold text-[var(--color-text-primary)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value.toLocaleString()}
        </span>
        <span className="text-[13px] font-semibold text-[var(--color-text-secondary)] uppercase">
          {unit}
        </span>
      </div>
    </div>
  );
}
