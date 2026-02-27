'use client';

import { useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { Coordinate3D } from '@/lib/types';
import { haversine } from '@/lib/geo';

interface ElevationProfileProps {
  geometry: Coordinate3D[];
  /** Index into the full geometry array currently being hovered */
  hoveredPointIndex?: number | null;
  /** Callback when the user hovers along the chart */
  onHoverPoint?: (index: number | null) => void;
}

interface ChartPoint {
  distance: number;
  elevation: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const { distance, elevation } = payload[0].payload;
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)] py-[var(--space-1)] text-xs shadow-[var(--shadow-sm)]">
      <div className="text-[var(--color-text-secondary)]">{distance.toFixed(1)} km</div>
      <div className="font-semibold text-[var(--color-text-primary)]">{elevation} m</div>
    </div>
  );
}

export function ElevationProfile({
  geometry,
  hoveredPointIndex,
  onHoverPoint,
}: ElevationProfileProps) {
  // Full-precision cumulative distances (one per geometry point)
  const cumulativeDistances = useMemo(() => {
    const result: number[] = [0];
    for (let i = 1; i < geometry.length; i++) {
      result.push(
        result[i - 1] +
          haversine(
            { lat: geometry[i - 1][0], lng: geometry[i - 1][1] },
            { lat: geometry[i][0], lng: geometry[i][1] }
          )
      );
    }
    return result;
  }, [geometry]);

  // Build chart data (rounded for display)
  const data = useMemo(() => {
    return geometry.map((point, i) => ({
      distance: Math.round(cumulativeDistances[i] * 10) / 10,
      elevation: Math.round(point[2]),
    }));
  }, [geometry, cumulativeDistances]);

  // Downsample for rendering performance, tracking index mapping
  const { displayData, chartToGeoIndex } = useMemo(() => {
    if (data.length <= 500) {
      return {
        displayData: data,
        chartToGeoIndex: data.map((_, i) => i),
      };
    }
    const step = Math.ceil(data.length / 500);
    const filtered: ChartPoint[] = [];
    const indexMap: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i % step === 0 || i === data.length - 1) {
        filtered.push(data[i]);
        indexMap.push(i);
      }
    }
    return { displayData: filtered, chartToGeoIndex: indexMap };
  }, [data]);

  // Chart mouse handler — Recharts v3 returns activeTooltipIndex as a string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = useCallback(
    (state: any) => {
      if (!onHoverPoint) return;
      const raw = state?.activeTooltipIndex;
      const chartIndex = typeof raw === 'string' ? parseInt(raw, 10) : raw;
      if (typeof chartIndex !== 'number' || isNaN(chartIndex)) return;
      const geoIndex = chartToGeoIndex[chartIndex];
      if (geoIndex !== undefined) {
        onHoverPoint(geoIndex);
      }
    },
    [onHoverPoint, chartToGeoIndex]
  );

  const handleMouseLeave = useCallback(() => {
    onHoverPoint?.(null);
  }, [onHoverPoint]);

  // Use full-precision distance for the reference line (smooth, not quantized)
  const referenceDistance =
    hoveredPointIndex !== null &&
    hoveredPointIndex !== undefined &&
    hoveredPointIndex >= 0 &&
    hoveredPointIndex < cumulativeDistances.length
      ? cumulativeDistances[hoveredPointIndex]
      : null;

  return (
    <div className="h-[140px] w-full bg-[var(--color-surface)] px-[var(--space-4)] pt-[var(--space-3)] shadow-[var(--shadow-md)]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={displayData}
          margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="distance"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => `${Math.round(v)}`}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={{ stroke: 'var(--color-border)' }}
          />
          <YAxis
            dataKey="elevation"
            tickFormatter={(v: number) => `${v}`}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={{ stroke: 'var(--color-border)' }}
            width={45}
          />
          {referenceDistance !== null && (
            <ReferenceLine
              x={referenceDistance}
              stroke="var(--color-accent)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          )}
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: 'var(--color-text-tertiary)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="elevation"
            stroke="#E8503A"
            strokeWidth={2}
            fill="#E8503A"
            fillOpacity={0.2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
