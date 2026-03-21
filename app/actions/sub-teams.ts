'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan, can, getGrantedActions } from '@/lib/rbac/resolver';
import { revalidatePath } from 'next/cache';
import { captureWithContext } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectTeam = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  allowed_modules: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  members: ProjectTeamMember[];
};

export type ProjectTeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: 'member' | 'manager';
  joined_at: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type SubTeamsPermissions = {
  canRead: boolean;
  canCreate: boolean;
  /** Edit sub-team definition (name, description, allowed modules). */
  canUpdate: boolean;
  canDelete: boolean;
  /** Manage sub-team members and manager role within scoped teams. */
  canManageMembers: boolean;
  /** IDs of sub-teams the current user manages (for team_manager scoping) */
  managedTeamIds: string[];
};

/** Current user's sub-team rows for this project (for "Tu rol y equipos"). */
export type MySubTeamMembership = {
  teamId: string;
  teamName: string;
  role: 'member' | 'manager';
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const fetchMySubTeamMemberships = cache(
  async (projectId: string, userId: string): Promise<MySubTeamMembership[]> => {
    const supabase = await createClient();
    const { data, error } = await (supabase as any).rpc(
      'get_my_sub_team_memberships',
      { p_project_id: projectId }
    );
    if (error) {
      captureWithContext(error, {
        module: 'sub-teams',
        action: 'listMySubTeamMemberships',
        userIntent: 'Load current user sub-team memberships for team tab',
        expected: 'get_my_sub_team_memberships RPC returns rows',
        extra: { projectId, userId },
      });
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    return rows.map(
      (row: { team_id: string; team_name: string; role: string }) => ({
        teamId: row.team_id,
        teamName: row.team_name,
        role: row.role === 'manager' ? 'manager' : 'member',
      })
    );
  }
);

/** Sub-teams the current user belongs to in this project (not gated on project_teams.read). */
export async function listMySubTeamMemberships(
  projectId: string
): Promise<MySubTeamMembership[]> {
  const user = await requireAuth();
  return fetchMySubTeamMemberships(projectId, user.id);
}

const fetchListProjectTeams = cache(
  async (projectId: string, userId: string): Promise<ProjectTeam[]> => {
    const supabase = await createClient();

    const allowed = await can(userId, 'project_teams.read', {
      type: 'project',
      projectId,
    });
    if (!allowed) return [];

    const { data: teams, error } = await (supabase as any)
      .from('project_teams')
      .select(
        'id, project_id, name, description, allowed_modules, created_by, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error || !teams) return [];

    const teamIds: string[] = teams.map((t: { id: string }) => t.id);
    if (teamIds.length === 0)
      return teams.map((t: ProjectTeam) => ({ ...t, members: [] }));

    const { data: members } = await (supabase as any)
      .from('project_team_members')
      .select('id, team_id, user_id, role, joined_at')
      .in('team_id', teamIds);

    const memberUserIds = Array.from(
      new Set((members ?? []).map((m: { user_id: string }) => m.user_id))
    );
    const { data: profiles } =
      memberUserIds.length > 0
        ? await (supabase as any)
            .from('profiles')
            .select('user_id, display_name, avatar_asset_id')
            .in('user_id', memberUserIds)
        : { data: [] };
    const profileByUserId = new Map<
      string,
      {
        display_name: string | null;
        avatar_asset_id: string | null;
      }
    >(
      (profiles ?? []).map(
        (p: {
          user_id: string;
          display_name: string | null;
          avatar_asset_id: string | null;
        }) => [p.user_id, p]
      )
    );

    const membersByTeam: Record<string, ProjectTeamMember[]> = {};
    for (const m of members ?? []) {
      if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
      const profile = profileByUserId.get(m.user_id);
      membersByTeam[m.team_id].push({
        id: m.id,
        team_id: m.team_id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        display_name: profile?.display_name ?? null,
        email: null,
        avatar_url: null,
      });
    }

    return teams.map((t: Omit<ProjectTeam, 'members'>) => ({
      ...t,
      members: membersByTeam[t.id] ?? [],
    }));
  }
);

export async function listProjectTeams(
  projectId: string
): Promise<ProjectTeam[]> {
  const user = await requireAuth();
  return fetchListProjectTeams(projectId, user.id);
}

export async function getSubTeamsPermissions(
  projectId: string
): Promise<SubTeamsPermissions> {
  const user = await requireAuth();
  const supabase = await createClient();

  // Owner fast path
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === user.id) {
    // Owner manages all sub-teams — load their IDs
    const teams = await listProjectTeams(projectId);
    return {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canManageMembers: true,
      managedTeamIds: teams.map((t) => t.id),
    };
  }

  const granted = await getGrantedActions(user.id, projectId, true);

  // Sub-teams where this user is sub-team lead (project_team_members.role = manager).
  // Do not gate on !project_teams.create: some DBs may still grant create to team_manager
  // until migration applies; the list is still correct and PM/owner use canCreate for UI.
  let managedTeamIds: string[] = [];
  if (granted.has('project_teams.manage_members')) {
    const { data: managedRows } = await (supabase as any)
      .from('project_team_members')
      .select('team_id, project_teams!inner(project_id)')
      .eq('user_id', user.id)
      .eq('role', 'manager')
      .eq('project_teams.project_id', projectId);

    managedTeamIds = (managedRows ?? []).map(
      (r: { team_id: string }) => r.team_id
    );
  }

  return {
    canRead: granted.has('project_teams.read'),
    canCreate: granted.has('project_teams.create'),
    canUpdate: granted.has('project_teams.update'),
    canDelete: granted.has('project_teams.delete'),
    canManageMembers: granted.has('project_teams.manage_members'),
    managedTeamIds,
  };
}

// ---------------------------------------------------------------------------
// Writes — Sub-team CRUD
// ---------------------------------------------------------------------------

export async function createProjectTeam(
  projectId: string,
  name: string,
  description?: string,
  allowedModules?: string[]
): Promise<{ data?: ProjectTeam; error?: string }> {
  try {
    const user = await requireAuth();
    await requireCan(user.id, 'project_teams.create', {
      type: 'project',
      projectId,
    });

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      return { error: 'Team name must be between 1 and 100 characters.' };
    }

    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from('project_teams')
      .insert({
        project_id: projectId,
        name: trimmedName,
        description: description?.trim() || null,
        allowed_modules:
          allowedModules && allowedModules.length > 0 ? allowedModules : null,
        created_by: user.id,
      })
      .select(
        'id, project_id, name, description, allowed_modules, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          error: 'A sub-team with that name already exists in this project.',
        };
      }
      throw error;
    }

    revalidatePath(`/context/${projectId}/team`);
    revalidatePath(`/context/${projectId}`);
    return { data: { ...data, members: [] } };
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'createProjectTeam',
      userIntent: 'Create a sub-team in the project',
      expected: 'New project_teams row inserted',
    });
    return { error: 'Failed to create sub-team. Please try again.' };
  }
}

function serializeClientDebugError(err: unknown): string {
  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return JSON.stringify(
      {
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
      },
      null,
      2
    );
  }
  return String(err);
}

export async function updateProjectTeam(
  teamId: string,
  name: string,
  description?: string,
  allowedModules?: string[]
): Promise<{
  data?: Pick<ProjectTeam, 'id' | 'name' | 'description' | 'allowed_modules'>;
  error?: string;
  /** PostgREST / Postgres payload for debugging (log in browser console). */
  errorDetails?: string;
}> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    // Resolve project_id to check permission
    const { data: team } = await (supabase as any)
      .from('project_teams')
      .select('project_id')
      .eq('id', teamId)
      .maybeSingle();

    if (!team) return { error: 'Sub-team not found.' };

    // Only users with sub-team definition edit permission (PM/owner tier).
    const allowed = await can(user.id, 'project_teams.update', {
      type: 'project',
      projectId: team.project_id,
    });
    if (!allowed)
      return {
        error: 'You do not have permission to edit this sub-team.',
      };

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      return { error: 'Team name must be between 1 and 100 characters.' };
    }

    const { data, error } = await (supabase as any).rpc(
      'update_project_team_atomic',
      {
        p_team_id: teamId,
        p_name: trimmedName,
        p_description: description?.trim() || null,
        p_allowed_modules:
          allowedModules && allowedModules.length > 0 ? allowedModules : null,
      }
    );

    if (error) {
      const msg = String(error.message ?? '');
      const errorDetails = serializeClientDebugError(error);
      console.error('[updateProjectTeam] RPC error', {
        teamId,
        userMessage: msg,
        errorDetails,
        raw: error,
      });
      captureWithContext(error, {
        module: 'sub-teams',
        action: 'updateProjectTeam',
        userIntent: 'Update sub-team name, description, or allowed modules',
        expected: 'update_project_team_atomic RPC succeeds',
        extra: { teamId, code: (error as { code?: string }).code, msg },
      });
      if (msg.includes('not_authorized_to_edit_sub_team')) {
        return {
          error: 'You do not have permission to edit this sub-team.',
          errorDetails,
        };
      }
      if (msg.includes('sub_team_not_found')) {
        return { error: 'Sub-team not found.', errorDetails };
      }
      if (msg.includes('Access denied')) {
        return {
          error: 'You do not have access to update this sub-team.',
          errorDetails,
        };
      }
      if (msg.includes('invalid_team_name')) {
        return {
          error: 'Team name must be between 1 and 100 characters.',
          errorDetails,
        };
      }
      if ((error as { code?: string }).code === '23505') {
        return {
          error: 'A sub-team with that name already exists in this project.',
          errorDetails,
        };
      }
      return {
        error: 'Failed to update sub-team. Please try again.',
        errorDetails,
      };
    }

    revalidatePath(`/context/${team.project_id}/team`);
    revalidatePath(`/context/${team.project_id}`);
    revalidatePath(`/context/${team.project_id}/media`);
    return { data: Array.isArray(data) ? data[0] : data };
  } catch (err) {
    const errorDetails =
      err instanceof Error
        ? JSON.stringify(
            { message: err.message, name: err.name, stack: err.stack },
            null,
            2
          )
        : serializeClientDebugError(err);
    console.error('[updateProjectTeam] unexpected error', {
      teamId,
      errorDetails,
      raw: err,
    });
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'updateProjectTeam',
      userIntent: 'Rename or update a sub-team',
      expected: 'project_teams row updated',
      extra: { teamId, errorDetails },
    });
    return {
      error: 'Failed to update sub-team. Please try again.',
      errorDetails,
    };
  }
}

export async function deleteProjectTeam(
  teamId: string
): Promise<{ error?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: team } = await (supabase as any)
      .from('project_teams')
      .select('project_id')
      .eq('id', teamId)
      .maybeSingle();

    if (!team) return { error: 'Sub-team not found.' };

    await requireCan(user.id, 'project_teams.delete', {
      type: 'project',
      projectId: team.project_id,
    });

    const { error } = await (supabase as any)
      .from('project_teams')
      .delete()
      .eq('id', teamId);

    if (error) throw error;

    revalidatePath(`/context/${team.project_id}/team`);
    revalidatePath(`/context/${team.project_id}`);
    return {};
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'deleteProjectTeam',
      userIntent: 'Delete a sub-team',
      expected: 'project_teams row deleted with cascaded members',
    });
    return { error: 'Failed to delete sub-team. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Writes — Team membership
// ---------------------------------------------------------------------------

export async function addTeamMember(
  teamId: string,
  userId: string
): Promise<{ data?: ProjectTeamMember; error?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: team } = await (supabase as any)
      .from('project_teams')
      .select('project_id')
      .eq('id', teamId)
      .maybeSingle();

    if (!team) return { error: 'Sub-team not found.' };

    await _requireCanManageTeam(user.id, teamId, team.project_id);

    const { error: rpcError } = await (supabase as any).rpc(
      'move_sub_team_member_atomic',
      {
        p_project_id: team.project_id,
        p_new_team_id: teamId,
        p_user_id: userId,
      }
    );

    if (rpcError) {
      const msg = String(rpcError.message ?? '');
      if (msg.includes('not_authorized_to_manage_sub_team')) {
        return {
          error:
            'You do not have permission to manage members of this sub-team.',
        };
      }
      if (msg.includes('not_authorized_to_move_from_sub_team')) {
        return {
          error:
            'You cannot reassign this member from their current sub-team. Ask a project manager or the manager of that sub-team.',
        };
      }
      if (msg.includes('invalid_arguments')) {
        return { error: 'Invalid sub-team or member.' };
      }
      captureWithContext(rpcError, {
        module: 'sub-teams',
        action: 'addTeamMember',
        userIntent: 'Assign member to sub-team (move if needed)',
        expected: 'move_sub_team_member_atomic completes',
        extra: { teamId, userId },
      });
      return {
        error: msg.trim() || 'Failed to update sub-team membership.',
      };
    }

    const { data: row } = await (supabase as any)
      .from('project_team_members')
      .select('id, team_id, user_id, role, joined_at')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!row) {
      return {
        error: 'Sub-team membership could not be loaded after update.',
      };
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('display_name, avatar_asset_id')
      .eq('user_id', userId)
      .maybeSingle();

    revalidatePath(`/context/${team.project_id}/team`);
    return {
      data: {
        id: row.id,
        team_id: row.team_id,
        user_id: row.user_id,
        role: row.role,
        joined_at: row.joined_at,
        display_name: profile?.display_name ?? null,
        email: null,
        avatar_url: null,
      },
    };
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'addTeamMember',
      userIntent: 'Add a member to a sub-team',
      expected: 'project_team_members row inserted',
      extra: { teamId, userId },
    });
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' &&
            err !== null &&
            'message' in err &&
            typeof (err as { message?: unknown }).message === 'string'
          ? ((err as { message: string }).message ?? '')
          : '';
    return {
      error: message.trim() || 'Failed to add team member. Please try again.',
    };
  }
}

export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<{ error?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: team } = await (supabase as any)
      .from('project_teams')
      .select('project_id')
      .eq('id', teamId)
      .maybeSingle();

    if (!team) return { error: 'Sub-team not found.' };

    await _requireCanManageTeam(user.id, teamId, team.project_id);

    const { error } = await (supabase as any)
      .from('project_team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) throw error;

    revalidatePath(`/context/${team.project_id}/team`);
    return {};
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'removeTeamMember',
      userIntent: 'Remove a member from a sub-team',
      expected: 'project_team_members row deleted',
    });
    return { error: 'Failed to remove team member. Please try again.' };
  }
}

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: 'member' | 'manager'
): Promise<{ error?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: team } = await (supabase as any)
      .from('project_teams')
      .select('project_id')
      .eq('id', teamId)
      .maybeSingle();

    if (!team) return { error: 'Sub-team not found.' };

    await _requireCanManageTeam(user.id, teamId, team.project_id);

    const { error } = await (supabase as any)
      .from('project_team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) throw error;

    revalidatePath(`/context/${team.project_id}/team`);
    return {};
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'updateTeamMemberRole',
      userIntent: "Change a member's role within a sub-team",
      expected: 'project_team_members role column updated',
    });
    return { error: 'Failed to update member role. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Verifies the caller can manage members of a specific sub-team.
 * - project_manager / project_owner → always allowed (PM tier has create + manage_members)
 * - team_manager → allowed only if they have role='manager' for this specific team
 */
async function _requireCanManageTeam(
  userId: string,
  teamId: string,
  projectId: string
): Promise<void> {
  const supabase = await createClient();

  // Owner fast path
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === userId) return;

  const granted = await getGrantedActions(userId, projectId, true);
  if (!granted.has('project_teams.manage_members')) {
    throw new Error(
      "Forbidden: missing permission 'project_teams.manage_members'"
    );
  }

  // Project-manager tier can manage any sub-team in the project.
  if (granted.has('project_teams.create')) return;

  // Sub-team lead (team_manager): must manage this specific team
  const { data: membership } = await (supabase as any)
    .from('project_team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membership?.role !== 'manager') {
    throw new Error(
      'Forbidden: you can only manage members of sub-teams you manage.'
    );
  }
}
