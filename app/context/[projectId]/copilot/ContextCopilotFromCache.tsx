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
  getProposalsForSession,
} from './actions';
import ContextCopilotClient from './ContextCopilotClient';
import type {
  CopilotSession,
  CopilotMessage,
  CopilotProposal,
} from '@/lib/copilot/schema';

interface ContextCopilotFromCacheProps {
  projectId: string;
}

export default function ContextCopilotFromCache({
  projectId,
}: ContextCopilotFromCacheProps) {
  const [session, setSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[] | null>(null);
  const [initialProposalsByMessage, setInitialProposalsByMessage] = useState<
    Record<string, CopilotProposal[]>
  >({});
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
    const [msgs, proposals] = await Promise.all([
      getCopilotMessages(s.id),
      getProposalsForSession(s.id),
    ]);
    setSession(s);
    setMessages(msgs);
    setInitialProposalsByMessage(
      proposals.reduce<Record<string, CopilotProposal[]>>((acc, p) => {
        const mid = p.message_id;
        if (mid == null) return acc;
        if (!acc[mid]) acc[mid] = [];
        acc[mid].push(p);
        return acc;
      }, {})
    );
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
      initialProposalsByMessage={initialProposalsByMessage}
    />
  );
}
