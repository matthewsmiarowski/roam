'use client';

import { AlertCircle, X } from 'lucide-react';

interface ErrorDisplayProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorDisplay({ message, onDismiss }: ErrorDisplayProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-[var(--space-3)] rounded-[var(--radius-md)] border-l-4 border-[var(--color-error)] bg-[var(--color-surface)] px-[var(--space-4)] py-[var(--space-3)] shadow-[var(--shadow-sm)]"
    >
      <AlertCircle
        size={20}
        strokeWidth={1.5}
        className="mt-0.5 shrink-0 text-[var(--color-error)]"
      />
      <p className="flex-1 text-[15px] leading-[1.5] text-[var(--color-text-primary)]">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 text-[var(--color-text-tertiary)] transition-colors duration-150 ease-out hover:text-[var(--color-text-primary)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
      >
        <X size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}
