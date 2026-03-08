// Copilot streaming API route.
//
// IMPORTANT: This is a Route Handler, not a Server Action.
// Server Actions cannot stream tokens to the client — this pattern is intentional.
// See docs/project-copilot/architecture/project-copilot-architecture-adr.md (ADR-001, ADR-002).
//
// Rate limiting is enforced HERE before any model call.
// The route is not considered complete without rate limiting. See ADR-003.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  getApprovedProposalTitlesForSession,
  getRejectedProposalTitlesForSession,
} from '@/app/context/[projectId]/copilot/actions';
import { buildProjectContext } from '@/lib/copilot/context';
import { captureWithContext } from '@/lib/sentry';

// Raised for development; can be lowered or read from env for production.
const DAILY_LIMIT = 200;
const HOURLY_LIMIT = 60;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES_IN_CONTEXT = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // 1. Auth — first line, no exceptions
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = params;
  const supabase = await createClient();

  // 2. Validate project ownership
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 403 });
  }

  // 3. Parse and validate request body
  let body: {
    sessionId?: string;
    messages?: unknown[];
    contextScope?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, messages } = body;
  const contextScope: 'standard' | 'full' =
    body.contextScope === 'full' ? 'full' : 'standard';

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages array is required' },
      { status: 400 }
    );
  }

  // Validate messages structure and length
  const validatedMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }> = [];
  for (const m of messages.slice(-MAX_MESSAGES_IN_CONTEXT)) {
    if (
      typeof m !== 'object' ||
      m === null ||
      !('role' in m) ||
      !('content' in m) ||
      ((m as Record<string, unknown>).role !== 'user' &&
        (m as Record<string, unknown>).role !== 'assistant')
    ) {
      return NextResponse.json(
        { error: 'Invalid message format' },
        { status: 400 }
      );
    }
    const content = String((m as Record<string, unknown>).content);
    if (
      (m as Record<string, unknown>).role === 'user' &&
      content.length > MAX_MESSAGE_LENGTH
    ) {
      return NextResponse.json(
        { error: `User message exceeds ${MAX_MESSAGE_LENGTH} character limit` },
        { status: 400 }
      );
    }
    validatedMessages.push({
      role: (m as Record<string, unknown>).role as 'user' | 'assistant',
      content,
    });
  }

  // 4. Rate limit check — daily limit (DB-counted)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: dailyCount } = await (supabase as any)
    .from('copilot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('role', 'user')
    .gte('created_at', oneDayAgo);

  if ((dailyCount ?? 0) >= DAILY_LIMIT) {
    // resetAt = oldest message in window + 24h
    const { data: oldest } = await (supabase as any)
      .from('copilot_messages')
      .select('created_at')
      .eq('owner_id', user.id)
      .eq('role', 'user')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const resetAt = oldest?.created_at
      ? new Date(
          new Date(oldest.created_at).getTime() + 24 * 60 * 60 * 1000
        ).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return NextResponse.json(
      { error: 'rate_limit_exceeded', limitType: 'daily', resetAt },
      { status: 429 }
    );
  }

  // Hourly sub-limit
  const { count: hourlyCount } = await (supabase as any)
    .from('copilot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('role', 'user')
    .gte('created_at', oneHourAgo);

  if ((hourlyCount ?? 0) >= HOURLY_LIMIT) {
    const { data: oldestHourly } = await (supabase as any)
      .from('copilot_messages')
      .select('created_at')
      .eq('owner_id', user.id)
      .eq('role', 'user')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const resetAt = oldestHourly?.created_at
      ? new Date(
          new Date(oldestHourly.created_at).getTime() + 60 * 60 * 1000
        ).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return NextResponse.json(
      { error: 'rate_limit_exceeded', limitType: 'hourly', resetAt },
      { status: 429 }
    );
  }

  // 5. Build project context (system prompt) + approved/rejected proposals for plan iteration
  let systemPrompt: string;
  try {
    systemPrompt = await buildProjectContext(projectId, {
      scope: contextScope,
    });
    const [approvedTitles, rejectedTitles] = await Promise.all([
      getApprovedProposalTitlesForSession(sessionId),
      getRejectedProposalTitlesForSession(sessionId),
    ]);
    if (approvedTitles.length > 0) {
      systemPrompt += `\n\n## Already approved in this session\nThese have been created; do not propose them again:\n${approvedTitles.map((t) => `- ${t}`).join('\n')}`;
    }
    if (rejectedTitles.length > 0) {
      systemPrompt += `\n\n## Rejected in this session\nDo not re-propose these as-is; suggest alternatives if the user asks to revise:\n${rejectedTitles.map((t) => `- ${t}`).join('\n')}`;
    }
  } catch (err) {
    captureWithContext(err, {
      module: 'copilot',
      action: 'buildProjectContext',
      userIntent: 'Build AI system prompt from project data',
      expected: 'System prompt string assembled from project tasks and notes',
      extra: { projectId },
    });
    return NextResponse.json(
      { error: 'Failed to build project context' },
      { status: 500 }
    );
  }

  // 6. Stream from Anthropic (require API key so we fail with clear error, not pipe failure)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      {
        error:
          'Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env.local.',
      },
      { status: 503 }
    );
  }

  try {
    const anthropicWithKey = new Anthropic({ apiKey });
    const stream = anthropicWithKey.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: validatedMessages,
    });

    return new Response(stream.toReadableStream(), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    captureWithContext(err, {
      module: 'copilot',
      action: 'streamText',
      userIntent: 'Stream AI planning response',
      expected: 'Token stream returned to client',
      extra: { projectId, sessionId },
    });
    return NextResponse.json(
      { error: 'AI service unavailable' },
      { status: 503 }
    );
  }
}
