'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { RotateCcw } from 'lucide-react';
import { PromptInput } from '@/components/PromptInput';
import { LoadingState } from '@/components/LoadingState';
import { RouteStats } from '@/components/RouteStats';
import { GpxDownload } from '@/components/GpxDownload';
import { ElevationProfile } from '@/components/ElevationProfile';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { StartPointBadge } from '@/components/StartPointBadge';
import type { AppState, GenerateRouteResponse, LatLng } from '@/lib/types';

const RouteMap = dynamic(
  () => import('@/components/RouteMap').then((mod) => ({ default: mod.RouteMap })),
  { ssr: false }
);

export default function Home() {
  const [state, setState] = useState<AppState>({ status: 'idle' });
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (state.status === 'idle' || state.status === 'error') {
        setStartPoint({ lat: lngLat.lat, lng: lngLat.lng });
      }
    },
    [state.status]
  );

  const handleClear = useCallback(() => {
    setState({ status: 'idle' });
    setStartPoint(null);
  }, []);

  const handleSubmit = useCallback(
    async (prompt: string) => {
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
          body: JSON.stringify({
            prompt,
            user_location: userLocation,
            start_coordinates: startPoint ?? undefined,
          }),
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
    },
    [startPoint]
  );

  const isInteractive = state.status === 'idle' || state.status === 'error';

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Map fills the entire viewport */}
      <div className="absolute inset-0 z-0">
        <RouteMap
          route={state.status === 'success' ? state.route : undefined}
          startPoint={startPoint}
          onMapClick={handleMapClick}
          interactive={isInteractive}
        />
      </div>

      {/* Prompt input — floats at top center */}
      <div className="absolute top-[var(--space-6)] left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 px-[var(--space-4)]">
        <PromptInput
          onSubmit={handleSubmit}
          disabled={state.status === 'loading'}
          placeholder={startPoint ? 'Describe your ride — e.g., "60km hilly loop"' : undefined}
        />

        {/* Hint / start point badge / error — below the prompt */}
        <div className="mt-[var(--space-3)] flex justify-center">
          {state.status === 'error' ? (
            <ErrorDisplay message={state.message} onDismiss={() => setState({ status: 'idle' })} />
          ) : startPoint && state.status !== 'success' ? (
            <StartPointBadge startPoint={startPoint} onClear={() => setStartPoint(null)} />
          ) : state.status === 'idle' ? (
            <p className="text-center text-[13px] text-[var(--color-text-tertiary)]">
              Click the map to set a start point, or describe your ride with a location
            </p>
          ) : null}
        </div>
      </div>

      {/* Loading overlay */}
      {state.status === 'loading' && <LoadingState />}

      {/* Sidebar — route stats + GPX download + new route */}
      {state.status === 'success' && (
        <div className="absolute top-[100px] left-[var(--space-4)] z-10 w-[220px] rounded-[var(--radius-md)] bg-[var(--color-surface)] p-[var(--space-5)] shadow-[var(--shadow-md)]">
          <RouteStats route={state.route} />
          <div className="mt-[var(--space-6)]">
            <GpxDownload gpx={state.gpx} />
          </div>
          <div className="mt-[var(--space-3)]">
            <button
              onClick={handleClear}
              className="flex w-full items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-4)] py-[var(--space-2)] text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--color-text-primary)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
            >
              <RotateCcw size={14} strokeWidth={1.5} />
              New route
            </button>
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
