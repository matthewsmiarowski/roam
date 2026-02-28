'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ChatPanel } from '@/components/ChatPanel';
import { ElevationProfile } from '@/components/ElevationProfile';
import { useChat } from '@/lib/use-chat';

const RouteMap = dynamic(
  () => import('@/components/RouteMap').then((mod) => ({ default: mod.RouteMap })),
  { ssr: false }
);

export default function Home() {
  const {
    state,
    sendMessage,
    selectRoute,
    backToOptions,
    setStartPoint,
    reset,
    moveWaypoint,
    addWaypoint,
    removeWaypoint,
    selectWaypoint,
  } = useChat();
  const [hoveredRouteIndex, setHoveredRouteIndex] = useState<number | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const handleHoverPoint = useCallback((index: number | null) => {
    setHoveredPointIndex(index);
  }, []);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (state.phase === 'chatting') {
        // Allow map-click start point when chatting (not generating/viewing routes)
        setStartPoint({ lat: lngLat.lat, lng: lngLat.lng });
      }
    },
    [state.phase, setStartPoint]
  );

  const handleDeleteWaypoint = useCallback(() => {
    if (state.editing?.selectedWaypointIndex != null) {
      removeWaypoint(state.editing.selectedWaypointIndex);
    }
  }, [state.editing?.selectedWaypointIndex, removeWaypoint]);

  // Determine what routes to show on the map
  const mapRoutes = state.routeOptions ?? undefined;
  const selectedIndex = state.selectedRouteIndex;
  const selectedRoute =
    selectedIndex !== null && state.routeOptions ? state.routeOptions[selectedIndex] : null;

  const isMapInteractive = state.phase === 'chatting';

  // Use editing geometry when active, otherwise selected route geometry
  const activeGeometry = state.editing?.geometry ?? selectedRoute?.route.geometry ?? null;

  // Clear point hover when selected route changes
  useEffect(() => {
    setHoveredPointIndex(null);
  }, [selectedIndex]);

  // Keyboard shortcuts for editing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!state.editing) return;
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.editing.selectedWaypointIndex !== null) {
          e.preventDefault();
          removeWaypoint(state.editing.selectedWaypointIndex);
        }
      } else if (e.key === 'Escape') {
        selectWaypoint(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.editing, removeWaypoint, selectWaypoint]);

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
          onDeleteWaypoint={handleDeleteWaypoint}
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
            selectedGeometry={activeGeometry}
            hoveredPointIndex={hoveredPointIndex}
            onHoverPoint={handleHoverPoint}
            editing={state.editing}
            routeColor={selectedRoute?.color}
            onMoveWaypoint={moveWaypoint}
            onAddWaypointOnSegment={addWaypoint}
            onSelectWaypoint={selectWaypoint}
          />
        </div>

        {/* Elevation profile — docked to bottom when a route is selected */}
        {selectedRoute && activeGeometry && (
          <div className="absolute inset-x-0 bottom-0 z-10">
            <ElevationProfile
              geometry={activeGeometry}
              hoveredPointIndex={hoveredPointIndex}
              onHoverPoint={handleHoverPoint}
            />
          </div>
        )}
      </div>
    </main>
  );
}
