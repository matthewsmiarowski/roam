'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}

export function PromptInput({ onSubmit, disabled }: PromptInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSubmit(trimmed);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-[var(--space-5)] py-[var(--space-4)] shadow-[var(--shadow-lg)] transition-shadow duration-150 ease-out focus-within:ring-2 focus-within:ring-[var(--color-accent)] focus-within:ring-offset-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='Describe your ride — e.g., "60km hilly loop from Girona"'
          disabled={disabled}
          aria-label="Describe your ride"
          className="flex-1 bg-transparent text-[15px] leading-[1.5] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Generate route"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-[var(--color-text-inverse)] transition-colors duration-150 ease-out hover:bg-[var(--color-accent-hover)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={20} strokeWidth={1.5} />
        </button>
      </div>
    </form>
  );
}
