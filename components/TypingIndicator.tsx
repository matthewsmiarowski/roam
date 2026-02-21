/**
 * Three-dot typing indicator shown while waiting for AI response.
 */

export function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-[5px] px-[var(--space-4)] py-[var(--space-3)]"
      aria-live="polite"
    >
      <span className="sr-only">Roam is thinking…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[7px] w-[7px] rounded-full bg-[var(--color-text-tertiary)]"
          style={{
            animation: 'typing-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
