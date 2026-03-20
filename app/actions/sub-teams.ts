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
  canUpdate: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  /** IDs of sub-teams the current user manages (for team_manager scoping) */
  managedTeamIds: string[];
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listProjectTeams = cache(
  async (projectId: string): Promise<ProjectTeam[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const allowed = await can(user.id, 'project_teams.read', {
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
      .select(
        'id, team_id, user_id, role, joined_at, user_profiles(display_name, email, avatar_url)'
      )
      .in('team_id', teamIds);

    const membersByTeam: Record<string, ProjectTeamMember[]> = {};
    for (const m of members ?? []) {
      if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
      membersByTeam[m.team_id].push({
        id: m.id,
        team_id: m.team_id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        display_name: m.user_profiles?.display_name ?? null,
        email: m.user_profiles?.email ?? null,
        avatar_url: m.user_profiles?.avatar_url ?? null,
      });
    }

    return teams.map((t: Omit<ProjectTeam, 'members'>) => ({
      ...t,
      members: membersByTeam[t.id] ?? [],
    }));
  }
);

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

  // Find which teams this user manages
  let managedTeamIds: string[] = [];
  if (granted.has('project_teams.update')) {
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
    canManageMembers: granted.has('project_teams.update'),
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

export async function updateProjectTeam(
  teamId: string,
  name: string,
  description?: string,
  allowedModules?: string[]
): Promise<{
  data?: Pick<ProjectTeam, 'id' | 'name' | 'description' | 'allowed_modules'>;
  error?: string;
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

    // team_manager can only update teams they manage
    const allowed = await can(user.id, 'project_teams.update', {
      type: 'project',
      projectId: team.project_id,
    });
    if (!allowed)
      return { error: 'You do not have permission to update this sub-team.' };

    // If team_manager (not project_manager/owner), verify they manage this specific team
    const { data: projectRow } = await (supabase as any)
      .from('projects')
      .select('owner_id')
      .eq('id', team.project_id)
      .maybeSingle();

    if (projectRow?.owner_id !== user.id) {
      const granted = await getGrantedActions(user.id, team.project_id, true);
      if (!granted.has('project_teams.create')) {
        // team_manager tier — verify they manage this team
        const { data: membership } = await (supabase as any)
          .from('project_team_members')
          .select('role')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (membership?.role !== 'manager') {
          return { error: 'You can only update sub-teams you manage.' };
        }
      }
    }

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      return { error: 'Team name must be between 1 and 100 characters.' };
    }

    const { data, error } = await (supabase as any)
      .from('project_teams')
      .update({
        name: trimmedName,
        description: description?.trim() || null,
        allowed_modules:
          allowedModules && allowedModules.length > 0 ? allowedModules : null,
      })
      .eq('id', teamId)
      .select('id, name, description, allowed_modules')
      .single();

    if (error) {
      if (error.code === '23505') {
        return {
          error: 'A sub-team with that name already exists in this project.',
        };
      }
      throw error;
    }

    revalidatePath(`/context/${team.project_id}/team`);
    revalidatePath(`/context/${team.project_id}`);
    return { data };
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'updateProjectTeam',
      userIntent: 'Rename or update a sub-team',
      expected: 'project_teams row updated',
    });
    return { error: 'Failed to update sub-team. Please try again.' };
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

    // Verify the target user is a project member
    const { data: projectMember } = await (supabase as any)
      .from('project_members')
      .select('id')
      .eq('project_id', team.project_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!projectMember) {
      return {
        error: 'User must be a project member before joining a sub-team.',
      };
    }

    const { data, error } = await (supabase as any)
      .from('project_team_members')
      .insert({ team_id: teamId, user_id: userId, role: 'member' })
      .select(
        'id, team_id, user_id, role, joined_at, user_profiles(display_name, email, avatar_url)'
      )
      .single();

    if (error) {
      if (error.code === '23505')
        return { error: 'User is already a member of this sub-team.' };
      throw error;
    }

    revalidatePath(`/context/${team.project_id}/team`);
    return {
      data: {
        id: data.id,
        team_id: data.team_id,
        user_id: data.user_id,
        role: data.role,
        joined_at: data.joined_at,
        display_name: data.user_profiles?.display_name ?? null,
        email: data.user_profiles?.email ?? null,
        avatar_url: data.user_profiles?.avatar_url ?? null,
      },
    };
  } catch (err) {
    captureWithContext(err, {
      module: 'sub-teams',
      action: 'addTeamMember',
      userIntent: 'Add a member to a sub-team',
      expected: 'project_team_members row inserted',
    });
    return { error: 'Failed to add team member. Please try again.' };
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
 * - project_manager / project_owner → always allowed (has project_teams.manage_members + create)
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

  // Check if user has broad manage permission (project_manager tier)
  const granted = await getGrantedActions(userId, projectId, true);
  if (!granted.has('project_teams.update')) {
    throw new Error("Forbidden: missing permission 'project_teams.update'");
  }

  // If they have create permission, they're project_manager or higher → allow
  if (granted.has('project_teams.create')) return;

  // team_manager tier — must manage this specific team
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
