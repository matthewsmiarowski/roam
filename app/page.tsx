'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ChatPanel } from '@/components/ChatPanel';
import { ElevationProfile } from '@/components/ElevationProfile';
import { useChat } from '@/lib/use-chat';

const RouteMap = dynamic(
  () => import('@/components/RouteMap').then((mod) => ({ default: mod.RouteMap })),
  { ssr: false }
);

export default function Home() {
  const { state, sendMessage, selectRoute, backToOptions, setStartPoint, reset } = useChat();
  const [hoveredRouteIndex, setHoveredRouteIndex] = useState<number | null>(null);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      // Allow map-click start point when chatting (not generating/viewing routes)
      if (state.phase === 'chatting') {
        setStartPoint({ lat: lngLat.lat, lng: lngLat.lng });
      }
    },
    [state.phase, setStartPoint]
  );

  // Determine what routes to show on the map
  const mapRoutes = state.routeOptions ?? undefined;
  const selectedIndex = state.selectedRouteIndex;
  const selectedRoute =
    selectedIndex !== null && state.routeOptions ? state.routeOptions[selectedIndex] : null;

  const isMapInteractive = state.phase === 'chatting';

  return (
    <main className="relative flex h-screen w-screen overflow-hidden">
      {/* Chat panel — fixed width left side */}
      <div className="relative z-10 h-full w-[400px] shrink-0 border-r border-[var(--color-border)] shadow-[var(--shadow-md)]">
        <ChatPanel
          state={state}
          onSendMessage={sendMessage}
          onSelectRoute={selectRoute}
          onBackToOptions={backToOptions}
          onHoverRoute={setHoveredRouteIndex}
          onReset={reset}
        />
      </div>

      {/* Map + elevation profile — fills remaining space */}
      <div className="relative flex-1">
        {/* Map fills the space */}
        <div className="absolute inset-0 z-0">
          <RouteMap
            routes={mapRoutes}
            hoveredRouteIndex={hoveredRouteIndex}
            selectedRouteIndex={selectedIndex}
            startPoint={state.startPoint}
            onMapClick={handleMapClick}
            interactive={isMapInteractive}
          />
        </div>

        {/* Elevation profile — docked to bottom when a route is selected */}
        {selectedRoute && (
          <div className="absolute inset-x-0 bottom-0 z-10">
            <ElevationProfile geometry={selectedRoute.route.geometry} />
          </div>
        )}
      </div>
    </main>
  );
}
