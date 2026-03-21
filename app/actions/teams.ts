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
import { OWNER_ACCESS_NOT_EDITABLE } from '@/lib/teams/member-access-errors';

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
  allowed_modules: string[] | null;
  guest_scope: string | null;
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
  invited_by_name: string;
  rejected_at: string;
  rejection_reason: string | null;
};

/** @deprecated Removed in simplified-roles migration. Types kept for TS compat during Phase 6 UI rebuild. */
export type InviteRole = {
  id: string;
  project_id: string;
  name: string | null;
  granted_actions: string[];
  allowed_modules: string[];
  effective_role_name: string;
  created_at: string;
};

/** @deprecated Removed in simplified-roles migration. Types kept for TS compat during Phase 6 UI rebuild. */
export type ProjectAccessProfile = {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  base_role_id: string;
  base_role_name: string;
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
  await requireCan(user.id, 'teams.invite', {
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
  await requireCan(user.id, 'teams.invite', {
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
    allowed_modules: (row.allowed_modules as string[] | null) ?? null,
    guest_scope: (row.guest_scope as string | null) ?? null,
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
  await requireCan(user.id, 'teams.invite', {
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
    invited_by_name: (row.invited_by_name as string) ?? '',
    rejected_at: row.rejected_at as string,
    rejection_reason: (row.rejection_reason as string | null) ?? null,
  }));
}

// ── listProjectRoles ──────────────────────────────────────────────────
// Returns the 5 simplified project roles in hierarchy order.
export const listProjectRoles = cache(async () => {
  await requireAuth();
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from('rbac_roles')
    .select('id, name, description')
    .in('name', [
      'owner',
      'project_manager',
      'team_manager',
      'team_member',
      'guest',
    ])
    .eq('is_system_role', true);
  // Sort in hierarchy order
  const order = [
    'owner',
    'project_manager',
    'team_manager',
    'team_member',
    'guest',
  ];
  const rows = (data || []) as Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  return rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
});

// ── inviteProjectMember ───────────────────────────────────────────────
// 2-step simplified invite: email → (role + modules).
// allowed_modules: null = unrestricted; array = explicit allowlist.
// guest_scope is derived automatically: Team Manager inviting → 'team', else → 'project'.
export async function inviteProjectMember(
  projectId: string,
  email: string,
  roleId: string,
  allowedModules?: string[] | null,
  teamId?: string,
  projectName?: string
): Promise<{
  token?: string;
  error?: string;
  emailSent?: boolean;
  emailError?: string;
}> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite', {
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

  // Derive guest_scope: check if inviter is a team_manager
  const { data: inviterRole } = await (supabase as any)
    .from('user_role_assignments')
    .select('rbac_roles(name)')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .maybeSingle();

  const inviterRoleName: string | undefined = inviterRole?.rbac_roles?.name;
  const guestScope = inviterRoleName === 'team_manager' ? 'team' : 'project';

  // Fetch the guest role name to decide whether to set guest_scope
  const { data: roleRow } = await (supabase as any)
    .from('rbac_roles')
    .select('name')
    .eq('id', roleId)
    .maybeSingle();

  const roleName: string | undefined = roleRow?.name;
  const isGuestInvite = roleName === 'guest';
  const isTeamRole = roleName === 'team_manager' || roleName === 'team_member';

  let effectiveAllowedModules = allowedModules ?? null;
  if (isTeamRole) {
    if (!teamId?.trim()) {
      return { error: 'team_required_for_role' };
    }
    const { data: team } = await (supabase as any)
      .from('project_teams')
      .select('id, allowed_modules')
      .eq('id', teamId.trim())
      .eq('project_id', projectId)
      .maybeSingle();
    if (!team) return { error: 'team_not_found' };
    effectiveAllowedModules =
      Array.isArray(team.allowed_modules) && team.allowed_modules.length > 0
        ? team.allowed_modules
        : null;
  }

  const { data, error } = await (supabase as any)
    .from('project_invites')
    .insert({
      project_id: projectId,
      invited_by: user.id,
      email: normalizedEmail,
      role_id: roleId,
      allowed_modules: effectiveAllowedModules,
      team_id: isTeamRole ? (teamId?.trim() ?? null) : null,
      guest_scope: isGuestInvite ? guestScope : null,
    })
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
  await requireCan(user.id, 'teams.invite', {
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
  targetUserId: string,
  removalReason?: string | null
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });

  if (targetUserId === user.id) {
    return { error: 'Cannot remove yourself from the project' };
  }

  const supabase = await createClient();
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === targetUserId) {
    return { error: 'Cannot remove the project owner' };
  }

  const reason =
    typeof removalReason === 'string' && removalReason.trim().length > 0
      ? removalReason.trim().slice(0, 2000)
      : null;

  const { error } = await (supabase as any).rpc(
    'remove_project_member_atomic',
    {
      p_project_id: projectId,
      p_target_user_id: targetUserId,
      p_reason: reason,
    }
  );

  if (error) {
    const msg: string = error.message ?? '';
    if (msg.includes('cannot_remove_self'))
      return { error: 'Cannot remove yourself from the project' };
    if (msg.includes('cannot_remove_project_owner'))
      return { error: 'Cannot remove the project owner' };
    if (msg.includes('not_authorized_to_remove_member'))
      return {
        error:
          'Not allowed to remove this member. Project owners and project managers can remove any member; team managers only members of sub-teams they manage.',
      };
    captureWithContext(error, {
      module: 'teams',
      action: 'removeProjectMember',
      userIntent: 'Remove a member from the project',
      expected:
        'remove_project_member_atomic RPC removes member and role assignments',
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

/** Project owner (`projects.owner_id`) has full access; do not load or mutate RBAC/modules for them in the team UI. */
async function assertTargetIsNotProjectOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  targetUserId: string
): Promise<string | null> {
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();
  if (project?.owner_id === targetUserId) {
    return OWNER_ACCESS_NOT_EDITABLE;
  }
  return null;
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
  await requireCan(user.id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const ownerBlock = await assertTargetIsNotProjectOwner(
    supabase,
    projectId,
    userId
  );
  if (ownerBlock) return { error: ownerBlock };
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

// ── updateMemberRole ───────────────────────────────────────────────────
// Assigns a role to an existing project member.
// Use this instead of the removed profile-based updateMemberAccess.
export async function updateMemberRole(
  projectId: string,
  userId: string,
  roleId: string
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const ownerBlock = await assertTargetIsNotProjectOwner(
    supabase,
    projectId,
    userId
  );
  if (ownerBlock) return { error: ownerBlock };
  const { error } = await (supabase as any).rpc('update_member_role_atomic', {
    p_project_id: projectId,
    p_user_id: userId,
    p_role_id: roleId,
    p_assigned_by: user.id,
  });
  if (error) {
    const msg: string = error.message ?? '';
    if (msg.includes('cannot_demote_last_owner'))
      return {
        error:
          'Cannot change the last project owner. Assign another owner first.',
      };
    captureWithContext(error, {
      module: 'teams',
      action: 'updateMemberRole',
      userIntent: 'Update member role',
      expected: 'update_member_role_atomic RPC succeeds',
      extra: { projectId, userId, roleId },
    });
    return { error: error.message };
  }
  revalidatePath(`/context/${projectId}/team`);
  return { success: true };
}

// ── updateMemberAccess ─────────────────────────────────────────────────
// @deprecated Use updateMemberRole instead. Kept for TS compat during Phase 6 UI rebuild.
export async function updateMemberAccess(
  projectId: string,
  userId: string,
  roleId: string
): Promise<{ success?: boolean; error?: string }> {
  return updateMemberRole(projectId, userId, roleId);
}

// ── updateMemberAccessByInviteRole ─────────────────────────────────────
// @deprecated Removed. Kept for TS compat during Phase 6 UI rebuild.
export async function updateMemberAccessByInviteRole(
  projectId: string,
  _userId: string,
  _inviteRoleId: string
): Promise<{ success?: boolean; error?: string }> {
  await requireAuth();
  await requireCan((await requireAuth()).id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });
  return {
    error: 'Custom role builder removed. Use the simplified role selector.',
  };
}

// ── updateMemberModules ─────────────────────────────────────────────────
// Updates only the visible modules (allowed_modules) for a member.
export async function updateMemberModules(
  projectId: string,
  userId: string,
  allowedModules: string[] | null
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });
  const supabase = await createClient();
  const ownerBlock = await assertTargetIsNotProjectOwner(
    supabase,
    projectId,
    userId
  );
  if (ownerBlock) return { error: ownerBlock };
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
// Updates visible modules for a member.
// grantedActions parameter is ignored (custom action grants removed in simplified-roles migration).
export async function updateMemberAccessFull(
  projectId: string,
  userId: string,
  allowedModules: string[] | null,
  _grantedActions?: string[]
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.manage_members', {
    type: 'project',
    projectId,
  });

  const normalizedModules: string[] | null = Array.isArray(allowedModules)
    ? allowedModules.filter((m): m is string => typeof m === 'string')
    : null;
  const pAllowed =
    normalizedModules && normalizedModules.length > 0
      ? normalizedModules
      : null;

  const supabase = await createClient();
  const ownerBlock = await assertTargetIsNotProjectOwner(
    supabase,
    projectId,
    userId
  );
  if (ownerBlock) return { error: ownerBlock };
  const { error } = await (supabase as any).rpc(
    'update_member_access_full_atomic',
    {
      p_project_id: projectId,
      p_user_id: userId,
      p_allowed_modules: pAllowed,
      p_granted_actions: null,
    }
  );
  if (error) {
    captureWithContext(error, {
      module: 'teams',
      action: 'updateMemberAccessFull',
      userIntent: 'Update member visible modules',
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
  revalidatePath('/notifications');
  revalidatePath('/');
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

  revalidatePath('/notifications');
  revalidatePath('/');
  return { success: true };
}
