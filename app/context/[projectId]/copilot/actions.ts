'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import type {
  CopilotSession,
  CopilotMessage,
  CopilotMessageRole,
  CopilotProposal,
} from '@/lib/copilot/schema';
import type { ParsedProposal } from '@/lib/copilot/parser';

// ─────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────

export async function getCopilotSession(
  projectId: string
): Promise<CopilotSession | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_sessions')
    .select('id, project_id, owner_id, title, status, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('owner_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'getCopilotSession',
      userIntent: 'Load active copilot session for project',
      expected: 'Returns the most recent active session or null',
      extra: { projectId },
    });
    return null;
  }

  return data as CopilotSession | null;
}

export async function createCopilotSession(
  projectId: string
): Promise<CopilotSession | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_sessions')
    .insert({
      project_id: projectId,
      owner_id: user.id,
      status: 'active',
    })
    .select('id, project_id, owner_id, title, status, created_at, updated_at')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'createCopilotSession',
      userIntent: 'Create a new copilot planning session',
      expected: 'New session row inserted and returned',
      extra: { projectId },
    });
    return null;
  }

  revalidatePath(`/context/${projectId}/copilot`);
  return data as CopilotSession;
}

// ─────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────

export async function getCopilotMessages(
  sessionId: string
): Promise<CopilotMessage[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_messages')
    .select(
      'id, session_id, project_id, owner_id, role, content, token_count, created_at'
    )
    .eq('session_id', sessionId)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'getCopilotMessages',
      userIntent: 'Load message history for a copilot session',
      expected: 'Returns all messages ordered by created_at ASC',
      extra: { sessionId },
    });
    return [];
  }

  return (data as CopilotMessage[]) || [];
}

export async function saveCopilotMessage(
  sessionId: string,
  projectId: string,
  role: CopilotMessageRole,
  content: string,
  tokenCount?: number
): Promise<CopilotMessage | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_messages')
    .insert({
      session_id: sessionId,
      project_id: projectId,
      owner_id: user.id,
      role,
      content,
      token_count: tokenCount ?? null,
    })
    .select(
      'id, session_id, project_id, owner_id, role, content, token_count, created_at'
    )
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'saveCopilotMessage',
      userIntent: 'Persist a copilot chat message',
      expected: 'Message row inserted and returned',
      extra: { sessionId, projectId, role },
    });
    return null;
  }

  return data as CopilotMessage;
}

// ─────────────────────────────────────────────────────────────────
// Proposals
// ─────────────────────────────────────────────────────────────────

export async function getProposalsForSession(
  sessionId: string
): Promise<CopilotProposal[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_proposals')
    .select(
      'id, session_id, message_id, project_id, owner_id, type, payload, status, created_entity_id, reviewed_at, created_at, updated_at'
    )
    .eq('session_id', sessionId)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'getProposalsForSession',
      userIntent: 'Load proposals for copilot session on tab open',
      expected: 'Proposal rows for session returned',
      extra: { sessionId },
    });
    return [];
  }

  return (data as CopilotProposal[]) ?? [];
}

const PROPOSAL_COLS =
  'id, session_id, message_id, project_id, owner_id, type, payload, status, created_entity_id, reviewed_at, created_at, updated_at';

export async function saveCopilotProposals(
  sessionId: string,
  messageId: string,
  projectId: string,
  proposals: ParsedProposal[]
): Promise<CopilotProposal[]> {
  if (proposals.length === 0) return [];

  const user = await requireAuth();
  const supabase = await createClient();

  const rows = proposals.map((p) => ({
    session_id: sessionId,
    message_id: messageId,
    project_id: projectId,
    owner_id: user.id,
    type: p.type,
    payload: p,
    status: 'pending',
  }));

  const { data, error } = await (supabase as any)
    .from('copilot_proposals')
    .insert(rows)
    .select(PROPOSAL_COLS);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'saveCopilotProposals',
      userIntent: 'Persist AI-generated proposals linked to a message',
      expected: 'Proposal rows inserted and returned',
      extra: { sessionId, messageId, projectId, count: proposals.length },
    });
    return [];
  }

  return (data as CopilotProposal[]) || [];
}

export async function rejectProposal(proposalId: string): Promise<boolean> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from('copilot_proposals')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'rejectProposal',
      userIntent: 'Reject an AI-generated proposal',
      expected: 'Proposal status updated to rejected',
      extra: { proposalId },
    });
    return false;
  }

  return true;
}
