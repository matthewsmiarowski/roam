import { RouteCard } from './RouteCard';
import type { RouteOption } from '@/lib/types';

interface RouteCardGroupProps {
  options: RouteOption[];
  onSelect: (index: number) => void;
  onHover?: (index: number | null) => void;
}

export function RouteCardGroup({ options, onSelect, onHover }: RouteCardGroupProps) {
  return (
    <div className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
      {options.map((option, index) => (
        <RouteCard
          key={option.id}
          option={option}
          index={index}
          onSelect={() => onSelect(index)}
          onHover={(hovering) => onHover?.(hovering ? index : null)}
        />
      ))}
    </div>
  );
}
