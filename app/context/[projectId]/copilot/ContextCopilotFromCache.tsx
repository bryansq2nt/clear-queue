'use client';

// ADR-004: Copilot intentionally does NOT use ContextDataCache for messages.
// Chat history grows unbounded and must always reflect the latest DB state.
// On every tab visit, messages are fetched fresh from the DB.
// There is no cache.get/cache.set for copilot — this is expected.

import { useCallback, useEffect, useState } from 'react';
import { SkeletonCopilot } from '@/components/skeletons/SkeletonCopilot';
import {
  getCopilotSession,
  createCopilotSession,
  getCopilotMessages,
} from './actions';
import ContextCopilotClient from './ContextCopilotClient';
import type { CopilotSession, CopilotMessage } from '@/lib/copilot/schema';

interface ContextCopilotFromCacheProps {
  projectId: string;
}

export default function ContextCopilotFromCache({
  projectId,
}: ContextCopilotFromCacheProps) {
  const [session, setSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[] | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    let s = await getCopilotSession(projectId);
    if (!s) {
      s = await createCopilotSession(projectId);
    }
    if (!s) {
      setLoading(false);
      return;
    }
    const msgs = await getCopilotMessages(s.id);
    setSession(s);
    setMessages(msgs);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || !session || messages === null) {
    return <SkeletonCopilot />;
  }

  return (
    <ContextCopilotClient
      projectId={projectId}
      session={session}
      initialMessages={messages}
    />
  );
}
