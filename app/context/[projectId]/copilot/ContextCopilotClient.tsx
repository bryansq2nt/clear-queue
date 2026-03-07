'use client';

import { useState, useCallback } from 'react';
import { PlusCircle, Pencil } from 'lucide-react';
import { CopilotChatWindow } from '@/components/context/copilot/CopilotChatWindow';
import { CopilotInputBar } from '@/components/context/copilot/CopilotInputBar';
import { CopilotProposalCard } from '@/components/context/copilot/CopilotProposalCard';
import {
  saveCopilotMessage,
  saveCopilotProposals,
  approveProposal,
  rejectProposal,
  updateSessionTitle,
} from './actions';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { useI18n } from '@/components/shared/I18nProvider';
import { parseProposals } from '@/lib/copilot/parser';
import { cn } from '@/lib/utils';
import type {
  CopilotSession,
  CopilotMessage,
  CopilotProposal,
  RateLimitError,
} from '@/lib/copilot/schema';

function formatSessionLabel(s: CopilotSession): string {
  if (s.title?.trim()) return s.title.trim();
  try {
    return new Date(s.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return s.id.slice(0, 8);
  }
}

interface ContextCopilotClientProps {
  projectId: string;
  session: CopilotSession;
  sessions: CopilotSession[];
  initialMessages: CopilotMessage[];
  initialProposalsByMessage?: Record<string, CopilotProposal[]>;
  onSelectSession: (sessionId: string) => void;
  onStartFresh: () => void;
  refetchSessions?: () => void;
}

export default function ContextCopilotClient({
  projectId,
  session,
  sessions,
  initialMessages,
  initialProposalsByMessage = {},
  onSelectSession,
  onStartFresh,
  refetchSessions,
}: ContextCopilotClientProps) {
  const { t } = useI18n();
  const { invalidateProject } = useContextDataCache();
  const [messages, setMessages] = useState<CopilotMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  // Map of assistantMessageId -> proposals (from DB on load + newly saved this visit)
  const [proposalsByMessage, setProposalsByMessage] = useState<
    Record<string, CopilotProposal[]>
  >(initialProposalsByMessage);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  const handleApprove = useCallback(
    async (proposalId: string) => {
      const result = await approveProposal(proposalId);
      if (result.error) return { error: result.error };
      if (result.data) {
        invalidateProject(result.data.project_id);
        setProposalsByMessage((prev) => {
          const next = { ...prev };
          for (const msgId of Object.keys(next)) {
            next[msgId] = next[msgId].map((p) =>
              p.id === proposalId
                ? {
                    ...p,
                    status: 'approved' as const,
                    created_entity_id: result.data!.created_entity_id,
                  }
                : p
            );
          }
          return next;
        });
      }
      return {};
    },
    [invalidateProject]
  );

  const handleReject = useCallback(async (proposalId: string) => {
    const success = await rejectProposal(proposalId);
    if (success) {
      setProposalsByMessage((prev) => {
        const next = { ...prev };
        for (const msgId of Object.keys(next)) {
          next[msgId] = next[msgId].map((p) =>
            p.id === proposalId ? { ...p, status: 'rejected' as const } : p
          );
        }
        return next;
      });
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isStreaming) return;

    setInputValue('');
    setError(null);
    setRateLimitError(null);

    // Optimistically add user message to UI
    const optimisticUserMsg: CopilotMessage = {
      id: `optimistic-${Date.now()}`,
      session_id: session.id,
      project_id: projectId,
      owner_id: '',
      role: 'user',
      content,
      token_count: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    // Persist user message (may trigger session title generation for first message)
    const result = await saveCopilotMessage(
      session.id,
      projectId,
      'user',
      content
    );
    if (result.data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticUserMsg.id ? result.data! : m))
      );
      if (result.wasFirstMessage && refetchSessions) refetchSessions();
    }

    // Build context window: last 20 messages
    const contextMessages = [
      ...messages.filter((m) => m.id !== optimisticUserMsg.id),
      { role: 'user' as const, content },
    ].slice(-20);

    // Start streaming
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const response = await fetch(`/api/copilot/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          messages: contextMessages,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setRateLimitError(body as RateLimitError);
        } else {
          setError(t('copilot.error_message'));
        }
        setIsStreaming(false);
        return;
      }

      // Parse stream: Anthropic SDK sends newline-delimited JSON (NDJSON), not SSE.
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Support both NDJSON (raw JSON line) and SSE ("data: {...}")
          const raw = trimmed.startsWith('data: ')
            ? trimmed.slice(6).trim()
            : trimmed;
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            if (
              evt.type === 'content_block_delta' &&
              evt.delta?.type === 'text_delta' &&
              typeof evt.delta.text === 'string'
            ) {
              fullText += evt.delta.text;
              setStreamingContent(fullText);
            }
          } catch {
            // Ignore malformed lines
          }
        }
      }

      // Stream complete — persist assistant message
      if (fullText) {
        const assistantResult = await saveCopilotMessage(
          session.id,
          projectId,
          'assistant',
          fullText
        );
        const assistantMsg = assistantResult.data;
        if (assistantMsg) {
          setMessages((prev) => [...prev, assistantMsg]);

          // Parse and persist proposals from the completed response
          const parsed = parseProposals(fullText);
          if (parsed.length > 0) {
            const savedProposals = await saveCopilotProposals(
              session.id,
              assistantMsg.id,
              projectId,
              parsed
            );
            if (savedProposals.length > 0) {
              setProposalsByMessage((prev) => ({
                ...prev,
                [assistantMsg.id]: savedProposals,
              }));
            }
          }
        }
      }
    } catch (err) {
      console.error('[copilot] stream error', err);
      setError(t('copilot.error_message'));
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [
    inputValue,
    isStreaming,
    messages,
    projectId,
    refetchSessions,
    session.id,
    t,
  ]);

  const formatResetTime = (resetAt: string) => {
    try {
      return new Date(resetAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return resetAt;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Session bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
        {isEditingTitle ? (
          <>
            <input
              type="text"
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = editTitleValue.trim();
                  if (v) {
                    updateSessionTitle(session.id, v).then((ok) => {
                      if (ok && refetchSessions) refetchSessions();
                      setIsEditingTitle(false);
                    });
                  } else setIsEditingTitle(false);
                }
                if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                  setEditTitleValue('');
                }
              }}
              onBlur={() => {
                const v = editTitleValue.trim();
                if (v) {
                  updateSessionTitle(session.id, v).then((ok) => {
                    if (ok && refetchSessions) refetchSessions();
                  });
                }
                setIsEditingTitle(false);
                setEditTitleValue('');
              }}
              placeholder={t('copilot.session_title_placeholder')}
              className={cn(
                'flex-1 min-w-0 max-w-[240px] rounded-md border border-input bg-background px-2 py-1.5 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
              )}
              autoFocus
              aria-label={t('copilot.edit_session_title')}
            />
          </>
        ) : (
          <>
            <select
              value={session.id}
              onChange={(e) => onSelectSession(e.target.value)}
              className={cn(
                'flex-1 min-w-0 max-w-[240px] rounded-md border border-input bg-background px-2 py-1.5 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
              )}
              aria-label={t('copilot.session_select')}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatSessionLabel(s)}
                  {s.status === 'archived' ? ` (${t('copilot.archived')})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setEditTitleValue(
                  session.title?.trim() || formatSessionLabel(session)
                );
                setIsEditingTitle(true);
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t('copilot.edit_session_title')}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onStartFresh}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          aria-label={t('copilot.start_fresh')}
        >
          <PlusCircle className="h-4 w-4" aria-hidden />
          {t('copilot.start_fresh')}
        </button>
      </div>

      <CopilotChatWindow
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        proposalsByMessage={proposalsByMessage}
        onApproveProposal={handleApprove}
        onRejectProposal={handleReject}
      />

      {/* Error states */}
      {rateLimitError && (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {rateLimitError.limitType === 'daily'
            ? t('copilot.rate_limit_daily').replace(
                '{time}',
                formatResetTime(rateLimitError.resetAt)
              )
            : t('copilot.rate_limit_hourly').replace(
                '{time}',
                formatResetTime(rateLimitError.resetAt)
              )}
        </div>
      )}
      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <CopilotInputBar
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        disabled={isStreaming}
      />
    </div>
  );
}
