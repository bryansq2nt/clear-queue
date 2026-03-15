'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { checkProjectMemberQuota } from '@/lib/quotas';
import { logAuditEvent } from '@/lib/rbac/audit';
import { sendEmail } from '@/lib/email/send';

export type ProjectMember = {
  user_id: string;
  email: string;
  display_name: string;
  joined_at: string;
  roles: Array<{ id: string; name: string }>;
};

export type ProjectInvite = {
  id: string;
  email: string;
  role_id: string;
  role_name: string;
  profile_id: string | null;
  profile_name: string | null;
  invite_role_id: string | null;
  invite_role_name: string | null;
  status: string;
  invited_by_name: string;
  expires_at: string;
  created_at: string;
  /** Present so the inviter can copy/share the link from the pending list. */
  token: string;
};

export type RejectedInvite = {
  id: string;
  email: string;
  role_name: string;
  profile_name: string | null;
  invite_role_name: string | null;
  invited_by_name: string;
  rejected_at: string;
  rejection_reason: string | null;
};

export type InviteRole = {
  id: string;
  project_id: string;
  name: string | null;
  granted_actions: string[];
  allowed_modules: string[];
  effective_role_name: string;
  created_at: string;
};

export type ProjectAccessProfile = {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  base_role_id: string;
  base_role_name: string;
  /** NULL = unrestricted (all tabs visible). Array = explicit allowlist of module keys. */
  allowed_modules: string[] | null;
  sort_order: number;
  is_default: boolean;
};

// ── listProjectMembers ────────────────────────────────────────────────
export const listProjectMembers = cache(
  async (projectId: string): Promise<ProjectMember[]> => {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'get_project_members_with_profile' as never,
      { p_project_id: projectId } as never
    );
    if (error) return [];
    return (data || []) as ProjectMember[];
  }
);

// ── checkCanInviteEmail ───────────────────────────────────────────────
// Used to validate before advancing from email step; avoids duplicate invites.
export async function checkCanInviteEmail(
  projectId: string,
  email: string
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite_project_member', {
    type: 'project',
    projectId,
  });
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { allowed: false, error: 'invalid_email' };
  }
  const supabase = await createClient();
  const { data: existingPending } = await (supabase as any)
    .from('project_invites')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingPending)
    return { allowed: false, error: 'invite_already_pending' };
  const { data: isMember } = await (supabase as any).rpc(
    'project_has_member_with_email' as never,
    { p_project_id: projectId, p_email: normalizedEmail } as never
  );
  if (isMember === true)
    return { allowed: false, error: 'user_already_member' };
  return { allowed: true };
}

// ── listPendingInvites ────────────────────────────────────────────────
// Not wrapped in cache() — must reflect newly created/revoked invites immediately.
// Uses RPC because project_invites has no direct FK to profiles (invited_by → auth.users);
// a PostgREST embed for inviter display_name would fail, so we use get_pending_invites_for_project.
export async function listPendingInvites(
  projectId: string
): Promise<ProjectInvite[]> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.read_project_members', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(
    'get_pending_invites_for_project' as never,
    { p_project_id: projectId } as never
  );
  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'listPendingInvites',
      userIntent: 'List pending project invites',
      expected: 'RPC returns pending invites with inviter name',
      extra: { projectId },
    });
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id as string,
    email: row.email as string,
    role_id: (row.role_id as string | null) ?? '',
    role_name: (row.role_name as string) ?? '',
    profile_id: (row.profile_id as string | null) ?? null,
    profile_name: (row.profile_name as string | null) ?? null,
    invite_role_id: (row.invite_role_id as string | null) ?? null,
    invite_role_name: (row.invite_role_name as string | null) ?? null,
    status: row.status as string,
    invited_by_name: (row.invited_by_name as string) ?? '',
    expires_at: row.expires_at as string,
    created_at: row.created_at as string,
    token: (row.token as string) ?? '',
  }));
}

// ── listRejectedInvites ─────────────────────────────────────────────────
export async function listRejectedInvites(
  projectId: string
): Promise<RejectedInvite[]> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.read_project_members', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(
    'get_rejected_invites_for_project',
    { p_project_id: projectId }
  );
  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'listRejectedInvites',
      userIntent: 'List rejected project invites',
      expected: 'RPC returns rejected invites with reason',
      extra: { projectId },
    });
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id as string,
    email: row.email as string,
    role_name: (row.role_name as string) ?? '',
    profile_name: (row.profile_name as string | null) ?? null,
    invite_role_name: (row.invite_role_name as string | null) ?? null,
    invited_by_name: (row.invited_by_name as string) ?? '',
    rejected_at: row.rejected_at as string,
    rejection_reason: (row.rejection_reason as string | null) ?? null,
  }));
}

// ── listProjectAccessProfiles ─────────────────────────────────────────
// Returns global defaults + any project-scoped profiles, ordered by sort_order.
export const listProjectAccessProfiles = cache(
  async (projectId: string): Promise<ProjectAccessProfile[]> => {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from('project_access_profiles')
      .select(
        'id, project_id, name, description, base_role_id, allowed_modules, sort_order, is_default, rbac_roles(name)'
      )
      .or(`project_id.is.null,project_id.eq.${projectId}`)
      .order('sort_order', { ascending: true });

    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id as string,
      project_id: row.project_id as string | null,
      name: row.name as string,
      description: row.description as string | null,
      base_role_id: row.base_role_id as string,
      base_role_name: (row.rbac_roles?.name as string) ?? '',
      allowed_modules: (row.allowed_modules as string[] | null) ?? null,
      sort_order: row.sort_order as number,
      is_default: row.is_default as boolean,
    }));
  }
);

// ── createProjectAccessProfile ────────────────────────────────────────
// Creates a project-scoped access profile. Used by the invite form for custom configs.
export async function createProjectAccessProfile(
  projectId: string,
  payload: {
    name: string;
    base_role_id: string;
    allowed_modules: string[] | null;
    description?: string;
  }
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite_project_member', {
    type: 'project',
    projectId,
  });

  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('project_access_profiles')
    .insert({
      project_id: projectId,
      name: payload.name,
      base_role_id: payload.base_role_id,
      allowed_modules: payload.allowed_modules,
      description: payload.description ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'createProjectAccessProfile',
      userIntent: 'Create a custom access profile for a project invite',
      expected: 'Profile record inserted and id returned',
      extra: { projectId },
    });
    return { error: error.message };
  }

  return { data: { id: (data as any).id as string } };
}

// ── Permission derivation helpers ─────────────────────────────────────
// Used by createInviteRole to compute allowed_modules and effective_role_name.

const OWNER_ONLY_ACTIONS = new Set([
  'tasks.bulk_delete',
  'notes.bulk_delete',
  'documents.bulk_delete',
  'documents.mark_final',
  'media.share_create',
  'copilot.bulk_approve',
  'copilot.bulk_reject',
  'projects.update',
  'projects.archive',
  'projects.unarchive',
  'projects.delete',
  'projects.link_client',
  'projects.toggle_module',
  'teams.invite_project_member',
  'teams.remove_project_member',
  'teams.update_project_member_roles',
]);

const VIEWER_ONLY_ACTIONS = new Set([
  'tasks.read',
  'milestones.read',
  'notes.read',
  'documents.read',
  'media.read',
  'calendar.read',
  'links.read',
  'ideas.read',
  'budgets.read',
  'billings.read',
  'todos.read',
  'copilot.read_sessions',
  'copilot.read_proposals',
  'projects.read',
  'profile.read',
  'workspace.read',
  'teams.read_project_members',
]);

// Maps module key → action key prefix for allowed_modules derivation.
const MODULE_ACTION_PREFIXES: Record<string, string> = {
  board: 'tasks.',
  notes: 'notes.',
  documents: 'documents.',
  media: 'media.',
  links: 'links.',
  milestones: 'milestones.',
  budgets: 'budgets.',
  billings: 'billings.',
  ideas: 'ideas.',
  calendar: 'calendar.',
  todos: 'todos.',
  copilot: 'copilot.',
};

const ALL_MODULE_KEYS = Object.keys(MODULE_ACTION_PREFIXES);

function deriveEffectiveRoleName(
  grantedActions: string[]
): 'project_viewer' | 'project_editor' | 'project_owner' {
  if (grantedActions.some((a) => OWNER_ONLY_ACTIONS.has(a)))
    return 'project_owner';
  if (grantedActions.some((a) => !VIEWER_ONLY_ACTIONS.has(a)))
    return 'project_editor';
  return 'project_viewer';
}

function deriveAllowedModules(grantedActions: string[]): string[] {
  return ALL_MODULE_KEYS.filter((moduleKey) =>
    grantedActions.some((a) => a.startsWith(MODULE_ACTION_PREFIXES[moduleKey]))
  );
}

// ── createInviteRole ──────────────────────────────────────────────────
// Creates a project_invite_roles row with derived allowed_modules and effective_role_name.
// If name is provided, the role is saved as reusable; otherwise it is ephemeral.
export async function createInviteRole(
  projectId: string,
  payload: { grantedActions: string[]; name?: string }
): Promise<{ data?: { id: string }; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite_project_member', {
    type: 'project',
    projectId,
  });

  if (!payload.grantedActions.length) {
    return { error: 'At least one permission must be granted' };
  }

  const allowedModules = deriveAllowedModules(payload.grantedActions);
  const effectiveRoleName = deriveEffectiveRoleName(payload.grantedActions);

  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('project_invite_roles')
    .insert({
      project_id: projectId,
      name: payload.name ?? null,
      granted_actions: payload.grantedActions,
      allowed_modules: allowedModules,
      effective_role_name: effectiveRoleName,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'createInviteRole',
      userIntent: 'Create a granular invite permission role',
      expected: 'project_invite_roles row inserted and id returned',
      extra: { projectId },
    });
    return { error: error.message };
  }

  return { data: { id: (data as any).id as string } };
}

// ── listReusableInviteRoles ───────────────────────────────────────────
// Returns named (reusable) invite roles for this project, newest first.
export const listReusableInviteRoles = cache(
  async (projectId: string): Promise<InviteRole[]> => {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from('project_invite_roles')
      .select(
        'id, project_id, name, granted_actions, allowed_modules, effective_role_name, created_at'
      )
      .eq('project_id', projectId)
      .not('name', 'is', null)
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id as string,
      project_id: row.project_id as string,
      name: row.name as string | null,
      granted_actions: (row.granted_actions as string[]) ?? [],
      allowed_modules: (row.allowed_modules as string[]) ?? [],
      effective_role_name: row.effective_role_name as string,
      created_at: row.created_at as string,
    }));
  }
);

// ── listProjectRoles ──────────────────────────────────────────────────
export const listProjectRoles = cache(async () => {
  await requireAuth();
  const supabase = await createClient();
  const { data } = await supabase
    .from('rbac_roles')
    .select('id, name, description')
    .in('name', ['project_owner', 'project_editor', 'project_viewer'])
    .order('name');
  return (data || []) as Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
});

// ── inviteProjectMember ───────────────────────────────────────────────
// When invite_role_id is set, role_id and profile_id are intentionally not set
// (nullable); accept_invite_atomic uses invite_role_id first.
export async function inviteProjectMember(
  projectId: string,
  email: string,
  roleId: string,
  profileId?: string,
  inviteRoleId?: string,
  projectName?: string
): Promise<{
  token?: string;
  error?: string;
  emailSent?: boolean;
  emailError?: string;
}> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite_project_member', {
    type: 'project',
    projectId,
  });

  const quota = await checkProjectMemberQuota(projectId);
  if (!quota.allowed) {
    return { error: 'quota_members_per_project' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = await createClient();

  // Block duplicate invites: already pending or already a member
  const { data: existingPending } = await (supabase as any)
    .from('project_invites')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending) {
    return { error: 'invite_already_pending' };
  }

  const { data: isMember } = await (supabase as any).rpc(
    'project_has_member_with_email' as never,
    { p_project_id: projectId, p_email: normalizedEmail } as never
  );

  if (isMember === true) {
    return { error: 'user_already_member' };
  }

  // When inviteRoleId is set, role_id is redundant — accept_invite_atomic
  // resolves the system role from project_invite_roles.effective_role_name.
  // role_id is nullable (migration 20260313210000) so we omit it in that path.
  const insertPayload: Record<string, unknown> = {
    project_id: projectId,
    invited_by: user.id,
    email: normalizedEmail,
  };
  if (!inviteRoleId) {
    // Legacy path: role_id must be a valid UUID.
    insertPayload.role_id = roleId;
  }
  if (profileId) insertPayload.profile_id = profileId;
  if (inviteRoleId) insertPayload.invite_role_id = inviteRoleId;

  const { data, error } = await (supabase as any)
    .from('project_invites')
    .insert(insertPayload)
    .select('token')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'inviteProjectMember',
      userIntent: 'Invite a user to the project',
      expected: 'Invite record created and token returned',
      extra: { projectId },
    });
    return { error: error.message };
  }

  const token = (data as any).token as string;
  void logAuditEvent({
    actorUserId: user.id,
    action: 'invite.created',
    resourceType: 'project_invite',
    resourceId: token,
    projectId,
    metadata: {
      email: email.trim().toLowerCase(),
      role_id: roleId,
      profile_id: profileId ?? null,
      invite_role_id: inviteRoleId ?? null,
    },
  });

  revalidatePath(`/context/${projectId}/team`);

  // Auto-send invite email when Resend is configured and we have a base URL
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (baseUrl && process.env.RESEND_API_KEY?.trim()) {
    const inviteLink = `${baseUrl}/invite/${token}`;
    const sendResult = await sendInviteEmail(
      email.trim().toLowerCase(),
      inviteLink,
      projectName?.trim() || undefined
    );
    if (sendResult.success) {
      return { token, emailSent: true };
    }
    return {
      token,
      emailSent: false,
      emailError: sendResult.error ?? 'Failed to send email',
    };
  }

  return { token };
}

// ── sendInviteEmail ────────────────────────────────────────────────────
// Sends the invite link to the given email. Prefers your SMTP server (SMTP_* env)
// when set; otherwise uses Resend (RESEND_API_KEY). If neither is configured,
// returns an error so the UI can tell the user to copy the link and share manually.
export async function sendInviteEmail(
  toEmail: string,
  inviteLink: string,
  projectName?: string
): Promise<{ success?: boolean; error?: string }> {
  await requireAuth();

  const projectLabel = projectName?.trim() || 'A project';
  const subject = `You're invited to ${projectLabel}`;
  const html = `
    <p>You've been invited to join <strong>${escapeHtml(projectLabel)}</strong>.</p>
    <p>Use the link below to accept the invitation (it expires in 7 days):</p>
    <p><a href="${escapeHtml(inviteLink)}">${escapeHtml(inviteLink)}</a></p>
    <p>If you don't have an account yet, you can sign up when you open the link.</p>
  `.trim();

  // Prefer your own SMTP server when configured
  if (process.env.SMTP_HOST?.trim()) {
    const from =
      process.env.SMTP_FROM_EMAIL?.trim() || 'ClearQueue <noreply@localhost>';
    const result = await sendEmail({
      to: toEmail,
      subject,
      html,
      from,
    });
    if (result.error) {
      captureWithContext(new Error(result.error), {
        module: 'teams',
        action: 'sendInviteEmail',
        userIntent: 'Send invite link by email (SMTP)',
        expected: 'SMTP accepts the email',
        extra: { toEmail },
      });
    }
    return result;
  }

  // Fallback to Resend when RESEND_API_KEY is set
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey?.trim()) {
    return {
      error:
        'Email sending is not configured. Set SMTP_HOST (your server) or RESEND_API_KEY, or copy the invite link and share it manually.',
    };
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    'ClearQueue <onboarding@resend.dev>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [toEmail.trim().toLowerCase()],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      captureWithContext(new Error(`Resend API error: ${res.status} ${body}`), {
        module: 'teams',
        action: 'sendInviteEmail',
        userIntent: 'Send invite link by email',
        expected: 'Resend accepts the email',
        extra: { toEmail, status: res.status },
      });
      return {
        error:
          'Failed to send email. Try copying the link and sharing it manually.',
      };
    }
    return { success: true };
  } catch (err) {
    captureWithContext(err, {
      module: 'teams',
      action: 'sendInviteEmail',
      userIntent: 'Send invite link by email',
      expected: 'Resend request succeeds',
      extra: { toEmail },
    });
    return {
      error:
        'Failed to send email. Try copying the link and sharing it manually.',
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── revokeInvite ──────────────────────────────────────────────────────
export async function revokeInvite(
  inviteId: string,
  projectId: string
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite_project_member', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from('project_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('project_id', projectId);

  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'revokeInvite',
      userIntent: 'Revoke a pending project invite',
      expected: 'Invite status set to revoked',
      extra: { inviteId, projectId },
    });
    return { error: error.message };
  }

  void logAuditEvent({
    actorUserId: user.id,
    action: 'invite.revoked',
    resourceType: 'project_invite',
    resourceId: inviteId,
    projectId,
  });

  revalidatePath(`/context/${projectId}/team`);
  return { success: true };
}

// ── removeProjectMember ───────────────────────────────────────────────
export async function removeProjectMember(
  projectId: string,
  targetUserId: string
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.remove_project_member', {
    type: 'project',
    projectId,
  });

  if (targetUserId === user.id) {
    return { error: 'Cannot remove yourself from the project' };
  }

  const supabase = await createClient();

  // Delete role assignments first, then membership
  await (supabase as any)
    .from('user_role_assignments')
    .delete()
    .eq('user_id', targetUserId)
    .eq('project_id', projectId);

  const { error } = await (supabase as any)
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', targetUserId);

  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'removeProjectMember',
      userIntent: 'Remove a member from the project',
      expected: 'Member removed from project_members and user_role_assignments',
      extra: { projectId, targetUserId },
    });
    return { error: error.message };
  }

  void logAuditEvent({
    actorUserId: user.id,
    action: 'member.removed',
    resourceType: 'project_member',
    resourceId: targetUserId,
    projectId,
  });

  revalidatePath(`/context/${projectId}/team`);
  return { success: true };
}

// ── getMemberAccess ───────────────────────────────────────────────────
// Returns current roles, allowed_modules, and granted_actions for a project member.
// Used by the Teams UI to show and edit a member's permissions.
export type MemberAccess = {
  roleIds: string[];
  roleNames: string[];
  allowedModules: string[] | null;
  grantedActions: string[];
};

export async function getMemberAccess(
  projectId: string,
  userId: string
): Promise<{ data?: MemberAccess; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.read_project_members', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(
    'get_member_access_for_project',
    { p_project_id: projectId, p_user_id: userId }
  );
  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'getMemberAccess',
      userIntent: 'View member access',
      expected: 'RPC returns roles and granted actions',
      extra: { projectId, userId },
    });
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return { error: 'No data' };
  const roleIds = row.role_ids;
  const roleNames = row.role_names;
  const allowedModules = row.allowed_modules;
  const grantedActions = row.granted_actions;
  return {
    data: {
      roleIds: Array.isArray(roleIds) ? roleIds : [],
      roleNames: Array.isArray(roleNames) ? roleNames : [],
      allowedModules:
        allowedModules == null || !Array.isArray(allowedModules)
          ? null
          : allowedModules,
      grantedActions: Array.isArray(grantedActions) ? grantedActions : [],
    },
  };
}

// ── updateMemberAccess ──────────────────────────────────────────────────
// Assigns an access profile to an existing project member (role + module allowlist).
export async function updateMemberAccess(
  projectId: string,
  userId: string,
  profileId: string
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.update_project_member_roles', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const { error } = await (supabase as any).rpc('update_member_access_atomic', {
    p_project_id: projectId,
    p_user_id: userId,
    p_profile_id: profileId,
    p_assigned_by: user.id,
  });
  if (error) {
    const msg: string = error.message ?? '';
    if (msg.includes('cannot_demote_last_owner'))
      return {
        error:
          'Cannot change the last project owner. Assign another owner first.',
      };
    if (msg.includes('profile_not_found'))
      return { error: 'Profile not found' };
    captureWithContext(error, {
      module: 'teams',
      action: 'updateMemberAccess',
      userIntent: 'Update member permissions',
      expected: 'update_member_access_atomic RPC succeeds',
      extra: { projectId, userId, profileId },
    });
    return { error: error.message };
  }
  revalidatePath(`/context/${projectId}/team`);
  return { success: true };
}

// ── updateMemberAccessByInviteRole ──────────────────────────────────────
// Applies a saved invite role (e.g. Developer) to an existing member.
export async function updateMemberAccessByInviteRole(
  projectId: string,
  userId: string,
  inviteRoleId: string
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.update_project_member_roles', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const { error } = await (supabase as any).rpc(
    'update_member_access_by_invite_role_atomic',
    {
      p_project_id: projectId,
      p_user_id: userId,
      p_invite_role_id: inviteRoleId,
      p_assigned_by: user.id,
    }
  );
  if (error) {
    const msg: string = error.message ?? '';
    if (msg.includes('cannot_demote_last_owner'))
      return {
        error:
          'Cannot change the last project owner. Assign another owner first.',
      };
    if (msg.includes('invite_role_not_found'))
      return { error: 'Role not found' };
    captureWithContext(error, {
      module: 'teams',
      action: 'updateMemberAccessByInviteRole',
      userIntent: 'Apply saved role to member',
      expected: 'update_member_access_by_invite_role_atomic RPC succeeds',
      extra: { projectId, userId, inviteRoleId },
    });
    return { error: error.message };
  }
  revalidatePath(`/context/${projectId}/team`);
  return { success: true };
}

// ── updateMemberModules ─────────────────────────────────────────────────
// Updates only the visible modules (allowed_modules) for a member.
export async function updateMemberModules(
  projectId: string,
  userId: string,
  allowedModules: string[] | null
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.update_project_member_roles', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const { error } = await (supabase as any).rpc(
    'update_member_modules_atomic',
    {
      p_project_id: projectId,
      p_user_id: userId,
      p_allowed_modules:
        allowedModules && allowedModules.length > 0 ? allowedModules : null,
    }
  );
  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'updateMemberModules',
      userIntent: 'Update member visible modules',
      expected: 'update_member_modules_atomic RPC succeeds',
      extra: { projectId, userId },
    });
    return { error: error.message };
  }
  revalidatePath(`/context/${projectId}/team`);
  return { success: true };
}

// ── updateMemberAccessFull ─────────────────────────────────────────────
// Updates both visible modules and granted actions (custom permissions).
// Use this when the editor has made granular changes; avoids per-toggle reload.
export async function updateMemberAccessFull(
  projectId: string,
  userId: string,
  allowedModules: string[] | null,
  grantedActions: string[]
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.update_project_member_roles', {
    type: 'project',
    projectId,
  });
  // Normalize: ensure we send a plain string[] or null so the RPC persists correctly
  const normalizedModules: string[] | null = Array.isArray(allowedModules)
    ? allowedModules.filter((m): m is string => typeof m === 'string')
    : null;
  const pAllowed =
    normalizedModules && normalizedModules.length > 0
      ? normalizedModules
      : null;

  const normalizedActions: string[] = Array.isArray(grantedActions)
    ? grantedActions.filter((a): a is string => typeof a === 'string')
    : [];
  const pActions = normalizedActions.length > 0 ? normalizedActions : null;

  const supabase = await createClient();
  const { error } = await (supabase as any).rpc(
    'update_member_access_full_atomic',
    {
      p_project_id: projectId,
      p_user_id: userId,
      p_allowed_modules: pAllowed,
      p_granted_actions: pActions,
    }
  );
  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'updateMemberAccessFull',
      userIntent: 'Update member modules and permissions',
      expected: 'update_member_access_full_atomic RPC succeeds',
      extra: { projectId, userId },
    });
    return { error: error.message };
  }
  revalidatePath(`/context/${projectId}/team`);
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/media`);
  return { success: true };
}

// ── getInviteByToken ──────────────────────────────────────────────────
// Used by the accept page. No auth required — RPC get_invite_by_token is
// SECURITY DEFINER so anyone with the link can read invite metadata (RLS
// would otherwise block non–project-members from seeing the row).
export const getInviteByToken = cache(async (token: string) => {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('get_invite_by_token', {
    p_token: token,
  });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: row.id as string,
    email: row.email as string,
    status: row.status as string,
    expires_at: row.expires_at as string,
    project_id: row.project_id as string,
    project_name: (row.project_name as string) ?? '',
    role_name: (row.role_name as string) ?? '',
    profile_name: (row.profile_name as string | null) ?? null,
    allowed_modules: (row.allowed_modules as string[] | null) ?? null,
  };
});

// ── acceptInvite ──────────────────────────────────────────────────────
export async function acceptInvite(
  token: string
): Promise<{ projectId?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: projectId, error: rpcError } = await (supabase as any).rpc(
    'accept_invite_atomic',
    { p_token: token, p_user_id: user.id }
  );

  if (rpcError) {
    const msg: string = rpcError.message ?? '';
    if (msg.includes('invite_not_found')) return { error: 'Invite not found' };
    if (msg.includes('invite_not_pending'))
      return { error: 'This invite has already been used or revoked' };
    if (msg.includes('invite_expired'))
      return { error: 'This invite has expired' };
    if (msg.includes('invite_email_mismatch'))
      return {
        error:
          'This invite was sent to another email address. Sign in with the account that received the invite to accept.',
      };

    captureWithContext(rpcError, {
      module: 'teams',
      action: 'acceptInvite',
      userIntent: 'Accept a project invitation',
      expected:
        'accept_invite_atomic RPC succeeds — member added and invite marked accepted',
    });
    return { error: rpcError.message };
  }

  const pid = projectId as string;

  void logAuditEvent({
    actorUserId: user.id,
    action: 'invite.accepted',
    resourceType: 'project_invite',
    projectId: pid,
  });

  revalidatePath(`/context/${pid}/team`);
  return { projectId: pid };
}

// ── rejectInvite ───────────────────────────────────────────────────────
export async function rejectInvite(
  token: string,
  reason?: string | null
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error: rpcError } = await (supabase as any).rpc(
    'reject_invite_atomic',
    { p_token: token, p_user_id: user.id, p_reason: reason ?? null }
  );

  if (rpcError) {
    const msg: string = rpcError.message ?? '';
    if (msg.includes('invite_not_found')) return { error: 'Invite not found' };
    if (msg.includes('invite_not_pending'))
      return { error: 'This invite has already been used or revoked' };
    if (msg.includes('invite_expired'))
      return { error: 'This invite has expired' };
    if (msg.includes('invite_email_mismatch'))
      return {
        error:
          'This invite was sent to another email address. Only that account can decline.',
      };
    captureWithContext(rpcError, {
      module: 'teams',
      action: 'rejectInvite',
      userIntent: 'Decline a project invitation',
      expected: 'reject_invite_atomic RPC succeeds',
    });
    return { error: rpcError.message };
  }

  return { success: true };
}
