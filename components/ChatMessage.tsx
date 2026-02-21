import { RouteCardGroup } from './RouteCardGroup';
import type { Message } from '@/lib/types';

interface ChatMessageProps {
  message: Message;
  onSelectRoute?: (index: number) => void;
  onHoverRoute?: (index: number | null) => void;
}

export function ChatMessage({ message, onSelectRoute, onHoverRoute }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] ${
          isUser
            ? 'bg-[var(--color-chat-user-bubble)] text-[var(--color-text-primary)]'
            : 'bg-[var(--color-chat-ai-bubble)] text-[var(--color-text-primary)]'
        }`}
      >
        {/* Message text — preserve newlines */}
        <div className="text-[14px] leading-[1.5] whitespace-pre-wrap">{message.content}</div>

        {/* Route option cards (only on assistant messages with routes) */}
        {message.routeOptions && onSelectRoute && (
          <RouteCardGroup
            options={message.routeOptions}
            onSelect={onSelectRoute}
            onHover={onHoverRoute}
          />
        )}
      </div>
    </div>
  );
}
