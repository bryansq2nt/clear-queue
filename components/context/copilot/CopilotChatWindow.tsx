'use client';

import { useEffect, useRef } from 'react';
import { CopilotMessageBubble } from './CopilotMessageBubble';
import { CopilotProposalCard } from './CopilotProposalCard';
import { useI18n } from '@/components/shared/I18nProvider';
import { Bot } from 'lucide-react';
import type { CopilotMessage, CopilotProposal } from '@/lib/copilot/schema';

interface CopilotChatWindowProps {
  messages: CopilotMessage[];
  streamingContent: string;
  isStreaming: boolean;
  proposalsByMessage: Record<string, CopilotProposal[]>;
  onRejectProposal: (proposalId: string) => Promise<void>;
}

export function CopilotChatWindow({
  messages,
  streamingContent,
  isStreaming,
  proposalsByMessage,
  onRejectProposal,
}: CopilotChatWindowProps) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives, but only if user is near the bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground max-w-xs">
          {t('copilot.empty_state')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4"
    >
      {messages.map((msg) => (
        <div key={msg.id} className="flex flex-col gap-2">
          <CopilotMessageBubble role={msg.role} content={msg.content} />
          {msg.role === 'assistant' &&
            (proposalsByMessage[msg.id]?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-2">
                {proposalsByMessage[msg.id].map((p) => (
                  <CopilotProposalCard
                    key={p.id}
                    proposal={p}
                    onReject={onRejectProposal}
                  />
                ))}
              </div>
            )}
        </div>
      ))}

      {/* Streaming assistant message */}
      {isStreaming && (
        <CopilotMessageBubble
          role="assistant"
          content={streamingContent}
          isStreaming
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}
