'use client';

export function LoadingState() {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/20"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-[var(--space-4)] rounded-[var(--radius-md)] bg-[var(--color-surface)] px-[var(--space-8)] py-[var(--space-6)] shadow-[var(--shadow-md)]">
        <div className="h-1 w-48 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
          <div
            className="h-full w-1/3 rounded-full bg-[var(--color-accent)]"
            style={{ animation: 'loading-slide 1.5s ease-in-out infinite' }}
          />
        </div>
        <p className="text-[15px] text-[var(--color-text-secondary)]">Generating route…</p>
      </div>
    </div>
  );
}
