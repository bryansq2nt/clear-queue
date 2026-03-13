'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { checkProjectMemberQuota } from '@/lib/quotas';
import { logAuditEvent } from '@/lib/rbac/audit';

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
  status: string;
  invited_by_name: string;
  expires_at: string;
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

// ── listPendingInvites ────────────────────────────────────────────────
export const listPendingInvites = cache(
  async (projectId: string): Promise<ProjectInvite[]> => {
    const user = await requireAuth();
    await requireCan(user.id, 'teams.read_project_members', {
      type: 'project',
      projectId,
    });
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from('project_invites')
      .select(
        'id, email, role_id, profile_id, status, expires_at, created_at, rbac_roles(name), profiles!project_invites_invited_by_fkey(display_name), project_access_profiles(name)'
      )
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id as string,
      email: row.email as string,
      role_id: row.role_id as string,
      role_name: (row.rbac_roles?.name as string) ?? '',
      profile_id: (row.profile_id as string | null) ?? null,
      profile_name:
        (row.project_access_profiles?.name as string | null) ?? null,
      status: row.status as string,
      invited_by_name: (row.profiles?.display_name as string) ?? '',
      expires_at: row.expires_at as string,
      created_at: row.created_at as string,
    }));
  }
);

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
export async function inviteProjectMember(
  projectId: string,
  email: string,
  roleId: string,
  profileId?: string
): Promise<{ token?: string; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'teams.invite_project_member', {
    type: 'project',
    projectId,
  });

  const quota = await checkProjectMemberQuota(projectId);
  if (!quota.allowed) {
    return { error: 'quota_members_per_project' };
  }

  const supabase = await createClient();

  const insertPayload: Record<string, unknown> = {
    project_id: projectId,
    invited_by: user.id,
    email: email.trim().toLowerCase(),
    role_id: roleId,
  };
  if (profileId) insertPayload.profile_id = profileId;

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

  void logAuditEvent({
    actorUserId: user.id,
    action: 'invite.created',
    resourceType: 'project_invite',
    resourceId: (data as any).token as string,
    projectId,
    metadata: {
      email: email.trim().toLowerCase(),
      role_id: roleId,
      profile_id: profileId ?? null,
    },
  });

  revalidatePath(`/context/${projectId}/team`);
  return { token: (data as any).token as string };
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

// ── getInviteByToken ──────────────────────────────────────────────────
// Used by the accept page — no auth required to read invite metadata
export const getInviteByToken = cache(async (token: string) => {
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from('project_invites')
    .select(
      'id, email, status, expires_at, project_id, projects(name), rbac_roles(name), project_access_profiles(name, allowed_modules)'
    )
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;
  return {
    id: (data as any).id as string,
    email: (data as any).email as string,
    status: (data as any).status as string,
    expires_at: (data as any).expires_at as string,
    project_id: (data as any).project_id as string,
    project_name: ((data as any).projects?.name as string) ?? '',
    role_name: ((data as any).rbac_roles?.name as string) ?? '',
    profile_name:
      ((data as any).project_access_profiles?.name as string | null) ?? null,
    /** NULL = unrestricted; array = explicit allowlist of module keys. */
    allowed_modules:
      ((data as any).project_access_profiles?.allowed_modules as
        | string[]
        | null) ?? null,
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
