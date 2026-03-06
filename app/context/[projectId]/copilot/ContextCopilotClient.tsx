'use client';

import { useState, useCallback } from 'react';
import { CopilotChatWindow } from '@/components/context/copilot/CopilotChatWindow';
import { CopilotInputBar } from '@/components/context/copilot/CopilotInputBar';
import { saveCopilotMessage } from './actions';
import { useI18n } from '@/components/shared/I18nProvider';
import type {
  CopilotSession,
  CopilotMessage,
  RateLimitError,
} from '@/lib/copilot/schema';

interface ContextCopilotClientProps {
  projectId: string;
  session: CopilotSession;
  initialMessages: CopilotMessage[];
}

export default function ContextCopilotClient({
  projectId,
  session,
  initialMessages,
}: ContextCopilotClientProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<CopilotMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [rateLimitError, setRateLimitError] = useState<RateLimitError | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

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

    // Persist user message
    const saved = await saveCopilotMessage(
      session.id,
      projectId,
      'user',
      content
    );
    if (saved) {
      // Replace optimistic message with persisted one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticUserMsg.id ? saved : m))
      );
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

      // Parse SSE stream from Anthropic
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
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const evt = JSON.parse(data);
            if (
              evt.type === 'content_block_delta' &&
              evt.delta?.type === 'text_delta'
            ) {
              fullText += evt.delta.text;
              setStreamingContent(fullText);
            }
          } catch {
            // Ignore malformed SSE events
          }
        }
      }

      // Stream complete — persist assistant message
      if (fullText) {
        const assistantMsg = await saveCopilotMessage(
          session.id,
          projectId,
          'assistant',
          fullText
        );
        if (assistantMsg) {
          setMessages((prev) => [...prev, assistantMsg]);
        }
      }
    } catch (err) {
      console.error('[copilot] stream error', err);
      setError(t('copilot.error_message'));
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [inputValue, isStreaming, messages, projectId, session.id, t]);

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
      <CopilotChatWindow
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
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
