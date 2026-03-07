'use client';

import { useState, useCallback, useRef } from 'react';
import { PlusCircle, Pencil } from 'lucide-react';
import { CopilotChatWindow } from '@/components/context/copilot/CopilotChatWindow';
import { CopilotInputBar } from '@/components/context/copilot/CopilotInputBar';
import {
  saveCopilotMessage,
  saveCopilotProposals,
  approveProposal,
  rejectProposal,
  updateSessionTitle,
} from './actions';
import { useContextDataCache } from '@/app/context/ContextDataCache';
import { useI18n } from '@/components/shared/I18nProvider';
import { parseProposals, parseContextRequest } from '@/lib/copilot/parser';
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

// Rotating status labels shown during AI streaming
const STREAM_STATUS_KEYS = ['thinking', 'reasoning', 'creating'] as const;

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
  const [proposalsByMessage, setProposalsByMessage] = useState<
    Record<string, CopilotProposal[]>
  >(initialProposalsByMessage);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  // Track which assistant message triggered a context request
  const [contextRequestMessageId, setContextRequestMessageId] = useState<
    string | null
  >(null);
  // Track which message has a bulk action in progress
  const [bulkActionMessageId, setBulkActionMessageId] = useState<string | null>(
    null
  );

  // Ref to keep the latest messages value accessible in callbacks without stale closure
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Rotating status labels while streaming (no raw backend output shown)
  const streamStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

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

  const handleApproveAll = useCallback(
    async (messageId: string): Promise<{ error?: string }> => {
      const pending = (proposalsByMessage[messageId] ?? []).filter(
        (p) => p.status === 'pending'
      );
      if (pending.length === 0) return {};
      setBulkActionMessageId(messageId);
      try {
        for (const p of pending) {
          const result = await approveProposal(p.id);
          if (result.error) return { error: result.error };
          if (result.data) {
            invalidateProject(result.data.project_id);
            setProposalsByMessage((prev) => {
              const next = { ...prev };
              for (const msgId of Object.keys(next)) {
                next[msgId] = next[msgId].map((proposal) =>
                  proposal.id === p.id
                    ? {
                        ...proposal,
                        status: 'approved' as const,
                        created_entity_id: result.data!.created_entity_id,
                      }
                    : proposal
                );
              }
              return next;
            });
          }
        }
        return {};
      } finally {
        setBulkActionMessageId(null);
      }
    },
    [proposalsByMessage, invalidateProject]
  );

  const handleRejectAll = useCallback(
    async (messageId: string): Promise<void> => {
      const pending = (proposalsByMessage[messageId] ?? []).filter(
        (p) => p.status === 'pending'
      );
      if (pending.length === 0) return;
      setBulkActionMessageId(messageId);
      try {
        for (const p of pending) {
          const success = await rejectProposal(p.id);
          if (!success) break;
          setProposalsByMessage((prev) => {
            const next = { ...prev };
            for (const msgId of Object.keys(next)) {
              next[msgId] = next[msgId].map((proposal) =>
                proposal.id === p.id
                  ? { ...proposal, status: 'rejected' as const }
                  : proposal
              );
            }
            return next;
          });
        }
      } finally {
        setBulkActionMessageId(null);
      }
    },
    [proposalsByMessage]
  );

  /**
   * Core streaming + persist helper.
   * Streams from the chat API, accumulates text, returns the full text on success.
   * Sets isStreaming, streamingContent, error, rateLimitError as side effects.
   */
  const streamChatRequest = useCallback(
    async (
      contextMessages: { role: 'user' | 'assistant'; content: string }[],
      contextScope: 'standard' | 'full' = 'standard'
    ): Promise<string | null> => {
      setIsStreaming(true);
      setStreamingContent(t('copilot.thinking'));

      // Rotate status every 3s so the user sees progress without raw backend output
      let statusIndex = 0;
      streamStatusIntervalRef.current = setInterval(() => {
        statusIndex = (statusIndex + 1) % STREAM_STATUS_KEYS.length;
        const key = `copilot.${STREAM_STATUS_KEYS[statusIndex]}`;
        setStreamingContent(t(key as 'copilot.thinking'));
      }, 3000);

      try {
        const response = await fetch(`/api/copilot/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            messages: contextMessages,
            contextScope,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (response.status === 429) {
            setRateLimitError(body as RateLimitError);
          } else {
            setError(t('copilot.error_message'));
          }
          return null;
        }

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
                // Do not show raw streamed content; status message is shown instead
              }
            } catch {
              // ignore malformed lines
            }
          }
        }

        return fullText || null;
      } catch (err) {
        console.error('[copilot] stream error', err);
        setError(t('copilot.error_message'));
        return null;
      } finally {
        if (streamStatusIntervalRef.current) {
          clearInterval(streamStatusIntervalRef.current);
          streamStatusIntervalRef.current = null;
        }
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [projectId, session.id, t]
  );

  /**
   * Persist a completed assistant message, parse proposals and context request.
   */
  const persistAssistantMessage = useCallback(
    async (fullText: string) => {
      const assistantResult = await saveCopilotMessage(
        session.id,
        projectId,
        'assistant',
        fullText
      );
      const assistantMsg = assistantResult.data;
      if (!assistantMsg) return;

      setMessages((prev) => [...prev, assistantMsg]);

      // Parse and save proposals
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

      // Check for context request
      const contextReq = parseContextRequest(fullText);
      if (contextReq) {
        setContextRequestMessageId(assistantMsg.id);
      }
    },
    [projectId, session.id]
  );

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isStreaming) return;

    setInputValue('');
    setError(null);
    setRateLimitError(null);
    setContextRequestMessageId(null);

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

    // Build context window: last 20 messages (exclude the optimistic placeholder)
    const currentMessages = messagesRef.current.filter(
      (m) => m.id !== optimisticUserMsg.id
    );
    const contextMessages = [
      ...currentMessages,
      { role: 'user' as const, content },
    ].slice(-20);

    const fullText = await streamChatRequest(contextMessages, 'standard');
    if (fullText) {
      await persistAssistantMessage(fullText);
    }
  }, [
    inputValue,
    isStreaming,
    projectId,
    refetchSessions,
    session.id,
    streamChatRequest,
    persistAssistantMessage,
  ]);

  /**
   * Re-send the last user question with full context.
   * Builds contextMessages up to the last user message (excluding the assistant's context-request reply).
   */
  const handleRetryWithFullContext = useCallback(async () => {
    if (isStreaming) return;

    // Clear the banner immediately
    setContextRequestMessageId(null);
    setError(null);
    setRateLimitError(null);

    // Build contextMessages: all messages up to and including the last user message
    const currentMessages = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      if (currentMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return;

    const contextMessages = currentMessages
      .slice(0, lastUserIdx + 1)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      .slice(-20);

    const fullText = await streamChatRequest(contextMessages, 'full');
    if (fullText) {
      await persistAssistantMessage(fullText);
    }
  }, [isStreaming, streamChatRequest, persistAssistantMessage]);

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
        onApproveAll={handleApproveAll}
        onRejectAll={handleRejectAll}
        bulkActionMessageId={bulkActionMessageId}
        sessionId={session.id}
        contextRequestMessageId={contextRequestMessageId}
        onRetryWithFullContext={handleRetryWithFullContext}
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
