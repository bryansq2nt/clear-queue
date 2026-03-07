'use client';

import { useEffect, useRef } from 'react';
import { CopilotMessageBubble } from './CopilotMessageBubble';
import { CopilotProposalCard } from './CopilotProposalCard';
import { useI18n } from '@/components/shared/I18nProvider';
import { Bot, RefreshCw } from 'lucide-react';
import type { CopilotMessage, CopilotProposal } from '@/lib/copilot/schema';

interface CopilotChatWindowProps {
  messages: CopilotMessage[];
  streamingContent: string;
  isStreaming: boolean;
  proposalsByMessage: Record<string, CopilotProposal[]>;
  onApproveProposal: (proposalId: string) => Promise<{ error?: string }>;
  onRejectProposal: (proposalId: string) => Promise<void>;
  sessionId?: string;
  contextRequestMessageId?: string | null;
  onRetryWithFullContext?: () => void;
}

export function CopilotChatWindow({
  messages,
  streamingContent,
  isStreaming,
  proposalsByMessage,
  onApproveProposal,
  onRejectProposal,
  sessionId,
  contextRequestMessageId,
  onRetryWithFullContext,
}: CopilotChatWindowProps) {
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when session changes or messages first appear (initial load / session switch)
  useEffect(() => {
    if (messages.length > 0 && !isStreaming) {
      const timer = setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [sessionId, messages.length, isStreaming]);

  // Auto-scroll to bottom when new content arrives during streaming, only if near bottom
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
                    onApprove={onApproveProposal}
                    onReject={onRejectProposal}
                  />
                ))}
              </div>
            )}
          {/* Context request banner */}
          {msg.role === 'assistant' &&
            contextRequestMessageId === msg.id &&
            onRetryWithFullContext && (
              <div className="ml-11 max-w-xl rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm">
                <p className="text-amber-800 dark:text-amber-300 text-xs mb-2">
                  {t('copilot.context_request_banner')}
                </p>
                <button
                  type="button"
                  onClick={onRetryWithFullContext}
                  disabled={isStreaming}
                  className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  {t('copilot.context_request_btn')}
                </button>
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
