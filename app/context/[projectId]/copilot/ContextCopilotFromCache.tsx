'use client';

// ADR-004: Copilot intentionally does NOT use ContextDataCache for messages.
// Chat history grows unbounded and must always reflect the latest DB state.
// On every tab visit, messages are fetched fresh from the DB.
// There is no cache.get/cache.set for copilot — this is expected.

import { useCallback, useEffect, useState } from 'react';
import { SkeletonCopilot } from '@/components/skeletons/SkeletonCopilot';
import {
  getCopilotSessions,
  createCopilotSession,
  getCopilotMessages,
  getProposalsForSession,
  startFreshCopilotSession,
  deleteCopilotSession,
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
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<CopilotMessage[] | null>(null);
  const [initialProposalsByMessage, setInitialProposalsByMessage] = useState<
    Record<string, CopilotProposal[]>
  >({});
  const [loading, setLoading] = useState(true);

  const loadMessagesAndProposals = useCallback(async (sessionId: string) => {
    const [msgs, proposals] = await Promise.all([
      getCopilotMessages(sessionId),
      getProposalsForSession(sessionId),
    ]);
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
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    let list = await getCopilotSessions(projectId);
    if (list.length === 0) {
      const newSession = await createCopilotSession(projectId);
      if (newSession) list = [newSession];
    }
    setSessions(list);
    const sidToLoad = list[0]?.id ?? null;
    setSelectedSessionId(sidToLoad);
    if (sidToLoad) {
      await loadMessagesAndProposals(sidToLoad);
    } else {
      setMessages([]);
      setInitialProposalsByMessage({});
    }
    setLoading(false);
  }, [projectId, loadMessagesAndProposals]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setLoading(true);
      await loadMessagesAndProposals(sessionId);
      setLoading(false);
    },
    [loadMessagesAndProposals]
  );

  const handleStartFresh = useCallback(async () => {
    const newSession = await startFreshCopilotSession(projectId);
    if (!newSession) return;
    const list = await getCopilotSessions(projectId);
    setSessions(list);
    setSelectedSessionId(newSession.id);
    setMessages([]);
    setInitialProposalsByMessage({});
  }, [projectId]);

  const refetchSessions = useCallback(async () => {
    const list = await getCopilotSessions(projectId);
    setSessions(list);
  }, [projectId]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const ok = await deleteCopilotSession(sessionId);
      if (!ok) return;
      const list = await getCopilotSessions(projectId);
      setSessions(list);
      // If the deleted session was selected, switch to the first remaining session
      if (selectedSessionId === sessionId) {
        const next = list[0] ?? null;
        setSelectedSessionId(next?.id ?? null);
        if (next) {
          await loadMessagesAndProposals(next.id);
        } else {
          setMessages([]);
          setInitialProposalsByMessage({});
        }
      }
    },
    [projectId, selectedSessionId, loadMessagesAndProposals]
  );

  const session =
    sessions.find((s) => s.id === selectedSessionId) ?? sessions[0] ?? null;

  if (loading || !session) {
    return <SkeletonCopilot />;
  }

  return (
    <ContextCopilotClient
      key={session.id}
      projectId={projectId}
      session={session}
      sessions={sessions}
      initialMessages={messages ?? []}
      initialProposalsByMessage={initialProposalsByMessage}
      onSelectSession={handleSelectSession}
      onStartFresh={handleStartFresh}
      onDeleteSession={handleDeleteSession}
      refetchSessions={refetchSessions}
    />
  );
}
