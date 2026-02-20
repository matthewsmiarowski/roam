'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { PromptInput } from '@/components/PromptInput';
import { LoadingState } from '@/components/LoadingState';
import { RouteStats } from '@/components/RouteStats';
import { GpxDownload } from '@/components/GpxDownload';
import { ElevationProfile } from '@/components/ElevationProfile';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import type { AppState, GenerateRouteResponse } from '@/lib/types';

const RouteMap = dynamic(
  () => import('@/components/RouteMap').then((mod) => ({ default: mod.RouteMap })),
  { ssr: false }
);

export default function Home() {
  const [state, setState] = useState<AppState>({ status: 'idle' });

  const handleSubmit = useCallback(async (prompt: string) => {
    setState({ status: 'loading', prompt });

    try {
      // Request browser geolocation (non-blocking — silently skip if denied)
      let userLocation: { latitude: number; longitude: number } | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        userLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
      } catch {
        // Geolocation denied or unavailable — proceed without it
      }

      const res = await fetch('/api/generate-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, user_location: userLocation }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Route generation failed.');
      }

      const response = data as GenerateRouteResponse;

      setState({
        status: 'success',
        route: response.route,
        gpx: response.gpx,
        metadata: response.metadata,
      });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    }
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Map fills the entire viewport */}
      <div className="absolute inset-0 z-0">
        <RouteMap route={state.status === 'success' ? state.route : undefined} />
      </div>

      {/* Prompt input — floats at top center */}
      <div className="absolute top-[var(--space-6)] left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 px-[var(--space-4)]">
        <PromptInput onSubmit={handleSubmit} disabled={state.status === 'loading'} />

        {/* Error banner appears below the prompt */}
        {state.status === 'error' && (
          <div className="mt-[var(--space-3)]">
            <ErrorDisplay message={state.message} onDismiss={() => setState({ status: 'idle' })} />
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {state.status === 'loading' && <LoadingState />}

      {/* Sidebar — route stats + GPX download */}
      {state.status === 'success' && (
        <div className="absolute top-[100px] left-[var(--space-4)] z-10 w-[220px] rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--space-5)] shadow-[var(--shadow-md)]">
          <RouteStats route={state.route} />
          <div className="mt-[var(--space-6)]">
            <GpxDownload gpx={state.gpx} />
          </div>
        </div>
      )}

      {/* Elevation profile — docked to bottom */}
      {state.status === 'success' && (
        <div className="absolute inset-x-0 bottom-0 z-10">
          <ElevationProfile geometry={state.route.geometry} />
        </div>
      )}
    </main>
  );
}
