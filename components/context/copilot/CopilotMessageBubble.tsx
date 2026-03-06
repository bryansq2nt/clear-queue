'use client';

import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CopilotMessageRole } from '@/lib/copilot/schema';

interface CopilotMessageBubbleProps {
  role: CopilotMessageRole;
  content: string;
  isStreaming?: boolean;
}

/** Strip <<PROPOSALS>>...</PROPOSALS>> block from display content. */
function stripProposalsBlock(content: string): string {
  return content.replace(/<<PROPOSALS>>[\s\S]*?<\/PROPOSALS>>/g, '').trim();
}

export function CopilotMessageBubble({
  role,
  content,
  isStreaming = false,
}: CopilotMessageBubbleProps) {
  const isAssistant = role === 'assistant';
  const displayContent = isAssistant ? stripProposalsBlock(content) : content;

  return (
    <div
      className={cn(
        'flex gap-3 max-w-3xl',
        isAssistant ? 'self-start' : 'self-end flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center',
          isAssistant
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {isAssistant ? (
          <Bot className="h-4 w-4" aria-hidden />
        ) : (
          <User className="h-4 w-4" aria-hidden />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-[85%]',
          isAssistant
            ? 'bg-muted text-foreground rounded-tl-sm'
            : 'bg-primary text-primary-foreground rounded-tr-sm'
        )}
      >
        {displayContent || (isStreaming ? '' : '…')}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
