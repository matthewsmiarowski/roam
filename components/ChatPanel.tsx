'use client';

import { useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { RouteDetail } from './RouteDetail';
import type { ConversationState } from '@/lib/types';

interface ChatPanelProps {
  state: ConversationState;
  onSendMessage: (content: string) => void;
  onSelectRoute: (index: number) => void;
  onBackToOptions: () => void;
  onHoverRoute: (index: number | null) => void;
  onReset: () => void;
  onDeleteWaypoint?: () => void;
}

export function ChatPanel({
  state,
  onSendMessage,
  onSelectRoute,
  onBackToOptions,
  onHoverRoute,
  onReset,
  onDeleteWaypoint,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.streamingText]);

  const isStreaming = state.streamingText !== null;
  const showDetail =
    state.phase === 'detail' && state.selectedRouteIndex !== null && state.routeOptions;
  const selectedOption = showDetail ? state.routeOptions![state.selectedRouteIndex!] : null;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-3)]">
        <h1 className="text-[20px] leading-[1.2] font-bold text-[var(--color-text-primary)]">
          Roam
        </h1>
        <button
          onClick={onReset}
          aria-label="New conversation"
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-[12px] font-medium text-[var(--color-text-tertiary)] transition-colors duration-150 hover:text-[var(--color-text-secondary)]"
        >
          <RotateCcw size={14} strokeWidth={1.5} />
          New
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-4)]"
      >
        <div className="flex flex-col gap-[var(--space-3)]">
          {state.messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onSelectRoute={onSelectRoute}
              onHoverRoute={onHoverRoute}
            />
          ))}

          {/* Streaming text (AI typing in real-time) */}
          {isStreaming && state.streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-[var(--radius-md)] bg-[var(--color-chat-ai-bubble)] px-[var(--space-3)] py-[var(--space-2)]">
                <div className="text-[14px] leading-[1.5] whitespace-pre-wrap text-[var(--color-text-primary)]">
                  {state.streamingText}
                </div>
              </div>
            </div>
          )}

          {/* Typing indicator (waiting for AI, no text yet) */}
          {isStreaming && !state.streamingText && (
            <div className="flex justify-start">
              <div className="rounded-[var(--radius-md)] bg-[var(--color-chat-ai-bubble)]">
                <TypingIndicator />
              </div>
            </div>
          )}

          {/* Route detail view (inline after selecting a route) */}
          {selectedOption && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]">
              <RouteDetail
                option={selectedOption}
                onBack={onBackToOptions}
                editing={state.editing}
                onDeleteWaypoint={onDeleteWaypoint}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Start point note */}
      {state.startPoint && (
        <div className="border-t border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-2)] text-[12px] text-[var(--color-text-tertiary)]">
          Starting from {state.startPoint.lat.toFixed(4)}, {state.startPoint.lng.toFixed(4)}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSubmit={onSendMessage}
        disabled={state.phase === 'generating'}
        placeholder={
          state.startPoint
            ? 'Describe your ride — e.g., "60km hilly loop"'
            : 'Describe your ride — e.g., "60km hilly loop from Girona"'
        }
      />
    </div>
  );
}
