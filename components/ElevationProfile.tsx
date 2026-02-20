'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Coordinate3D } from '@/lib/types';
import { haversine } from '@/lib/geo';

interface ElevationProfileProps {
  geometry: Coordinate3D[];
}

export function ElevationProfile({ geometry }: ElevationProfileProps) {
  const data = useMemo(() => {
    const result: { distance: number; elevation: number }[] = [];
    let cumDist = 0;
    for (let i = 0; i < geometry.length; i++) {
      if (i > 0) {
        cumDist += haversine(
          { lat: geometry[i - 1][0], lng: geometry[i - 1][1] },
          { lat: geometry[i][0], lng: geometry[i][1] }
        );
      }
      result.push({
        distance: Math.round(cumDist * 10) / 10,
        elevation: Math.round(geometry[i][2]),
      });
    }
    return result;
  }, [geometry]);

  // Downsample for rendering performance
  const displayData = useMemo(() => {
    if (data.length <= 500) return data;
    const step = Math.ceil(data.length / 500);
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data]);

  return (
    <div className="h-[140px] w-full bg-[var(--color-surface)] px-[var(--space-4)] pt-[var(--space-3)] shadow-[var(--shadow-md)]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={displayData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="distance"
            tickFormatter={(v: number) => `${v}`}
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
