import { MapPin, X } from 'lucide-react';
import type { LatLng } from '@/lib/types';

interface StartPointBadgeProps {
  startPoint: LatLng;
  onClear: () => void;
}

export function StartPointBadge({ startPoint, onClear }: StartPointBadgeProps) {
  return (
    <div className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-full)] bg-[var(--color-accent-subtle)] px-[var(--space-3)] py-[var(--space-1)] text-[13px] font-medium text-[var(--color-accent-text)]">
      <MapPin size={14} strokeWidth={1.5} />
      <span>
        Start: {startPoint.lat.toFixed(4)}, {startPoint.lng.toFixed(4)}
      </span>
      <button
        onClick={onClear}
        aria-label="Remove start point"
        className="ml-[var(--space-1)] rounded-[var(--radius-full)] p-0.5 text-[var(--color-accent-text)] transition-colors duration-150 hover:bg-[var(--color-accent)] hover:text-[var(--color-text-inverse)] focus:outline-2 focus:outline-offset-1 focus:outline-[var(--color-accent)]"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
