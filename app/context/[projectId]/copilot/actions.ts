'use server';

import Anthropic from '@anthropic-ai/sdk';
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

const SESSION_TITLE_MAX_LENGTH = 80;

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

export async function getCopilotSessions(
  projectId: string
): Promise<CopilotSession[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_sessions')
    .select('id, project_id, owner_id, title, status, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('owner_id', user.id)
    .order('status', { ascending: true }) // active first (a before ar)
    .order('updated_at', { ascending: false });

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'getCopilotSessions',
      userIntent: 'List copilot sessions for project',
      expected: 'Session rows for project returned',
      extra: { projectId },
    });
    return [];
  }

  return (data as CopilotSession[]) ?? [];
}

export async function archiveCopilotSession(
  sessionId: string
): Promise<boolean> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from('copilot_sessions')
    .update({ status: 'archived' })
    .eq('id', sessionId)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'archiveCopilotSession',
      userIntent: 'Archive a copilot session',
      expected: 'Session status set to archived',
      extra: { sessionId },
    });
    return false;
  }

  return true;
}

/** Archives the current active session (if any) and creates a new one. Returns the new session. */
export async function startFreshCopilotSession(
  projectId: string
): Promise<CopilotSession | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: active } = await (supabase as any)
    .from('copilot_sessions')
    .select('id')
    .eq('project_id', projectId)
    .eq('owner_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active?.id) {
    await (supabase as any)
      .from('copilot_sessions')
      .update({ status: 'archived' })
      .eq('id', active.id)
      .eq('owner_id', user.id);
  }

  const newSession = await createCopilotSession(projectId);
  return newSession;
}

/** Updates session title (owner-scoped). Used after auto-generating from first message. */
export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<boolean> {
  const user = await requireAuth();
  const supabase = await createClient();
  const trimmed = title.trim().slice(0, SESSION_TITLE_MAX_LENGTH);
  if (!trimmed) return false;

  const { error } = await (supabase as any)
    .from('copilot_sessions')
    .update({ title: trimmed })
    .eq('id', sessionId)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'updateSessionTitle',
      userIntent: 'Set session title',
      expected: 'Session title updated',
      extra: { sessionId },
    });
    return false;
  }
  return true;
}

/** Generates a short conversation title from the first user message (AI). Falls back to truncated text. */
async function generateSessionTitle(
  firstMessageContent: string
): Promise<string> {
  const snippet = firstMessageContent.trim().slice(0, 400);
  if (!snippet) return '';

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return snippet.slice(0, SESSION_TITLE_MAX_LENGTH);
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 30,
      system:
        'Reply with only a very short conversation title (3 to 6 words) that summarizes the user message. No quotes, no punctuation at the end.',
      messages: [{ role: 'user', content: snippet }],
    });
    const text = msg.content?.[0]?.type === 'text' ? msg.content[0].text : '';
    const title = text.trim().slice(0, SESSION_TITLE_MAX_LENGTH);
    return title || snippet.slice(0, SESSION_TITLE_MAX_LENGTH);
  } catch (err) {
    captureWithContext(err, {
      module: 'copilot',
      action: 'generateSessionTitle',
      userIntent: 'Generate session title from first message',
      expected: 'Short title string',
    });
    return snippet.slice(0, SESSION_TITLE_MAX_LENGTH);
  }
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

export type SaveCopilotMessageResult = {
  data: CopilotMessage | null;
  wasFirstMessage?: boolean;
};

export async function saveCopilotMessage(
  sessionId: string,
  projectId: string,
  role: CopilotMessageRole,
  content: string,
  tokenCount?: number
): Promise<SaveCopilotMessageResult> {
  const user = await requireAuth();
  const supabase = await createClient();

  let wasFirstMessage = false;
  if (role === 'user') {
    const { count } = await (supabase as any)
      .from('copilot_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('owner_id', user.id);
    wasFirstMessage = (count ?? 0) === 0;
  }

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
    return { data: null };
  }

  const message = data as CopilotMessage;
  if (wasFirstMessage && content.trim()) {
    const title = await generateSessionTitle(content.trim());
    if (title) await updateSessionTitle(sessionId, title);
  }

  return { data: message, wasFirstMessage: wasFirstMessage || undefined };
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

/** Returns titles of approved proposals in this session for system prompt context. */
export async function getApprovedProposalTitlesForSession(
  sessionId: string
): Promise<string[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_proposals')
    .select('payload')
    .eq('session_id', sessionId)
    .eq('owner_id', user.id)
    .eq('status', 'approved');

  if (error) return [];

  const rows = (data as { payload: { title?: string } }[]) ?? [];
  return rows
    .map((r) => r.payload?.title)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/** Returns titles of rejected proposals in this session for plan-iteration context. */
export async function getRejectedProposalTitlesForSession(
  sessionId: string
): Promise<string[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any)
    .from('copilot_proposals')
    .select('payload')
    .eq('session_id', sessionId)
    .eq('owner_id', user.id)
    .eq('status', 'rejected');

  if (error) return [];

  const rows = (data as { payload: { title?: string } }[]) ?? [];
  return rows
    .map((r) => r.payload?.title)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
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

export type ApproveProposalResult = {
  data?: {
    created_entity_id: string;
    type: 'task' | 'note';
    project_id: string;
  };
  error?: string;
};

export async function approveProposal(
  proposalId: string
): Promise<ApproveProposalResult> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await (supabase as any).rpc(
    'approve_copilot_proposal_atomic',
    { in_proposal_id: proposalId }
  );

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveProposal',
      userIntent: 'Approve AI-generated proposal and create entity',
      expected: 'Task or note created and proposal marked approved',
      extra: { proposalId },
    });
    return {
      error: error.message ?? 'Failed to approve proposal',
    };
  }

  const result = data as {
    created_entity_id: string;
    type: 'task' | 'note';
    project_id: string;
  } | null;
  if (!result?.created_entity_id || !result?.type || !result?.project_id) {
    return { error: 'Invalid response from server' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/context');
  revalidatePath(`/context/${result.project_id}/board`);
  revalidatePath(`/context/${result.project_id}/notes`);

  return {
    data: {
      created_entity_id: result.created_entity_id,
      type: result.type,
      project_id: result.project_id,
    },
  };
}
