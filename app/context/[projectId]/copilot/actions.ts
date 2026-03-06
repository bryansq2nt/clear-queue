'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import type {
  CopilotSession,
  CopilotMessage,
  CopilotMessageRole,
} from '@/lib/copilot/schema';

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
