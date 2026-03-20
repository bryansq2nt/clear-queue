import { createClient } from '@/lib/supabase/server';

export type ReadScope = 'own' | 'team' | 'project';

/**
 * Returns the read scope for the given user in a project.
 *
 * Scope is derived from the user's role name, not from action key variants.
 * This replaces the old action-key-based resolution (*.read.own/team/project).
 *
 * Resolution order:
 *   1. Project owner fast path → 'project'
 *   2. Role name:
 *      'owner' | 'project_manager' → 'project'
 *      'team_manager'              → 'team'
 *      'team_member'               → 'own'
 *      'guest'                     → read from user_project_access_grants.read_scope
 *                                    (defaults to 'project' if null)
 *   3. Fallback (no role assigned) → 'own'
 *
 * The `module` parameter is accepted for interface compatibility but is no
 * longer used in scope resolution — scope is uniform across all modules for
 * a given role.
 */
export async function getReadScope(
  userId: string,
  projectId: string,
  _module?: string
): Promise<ReadScope> {
  const supabase = await createClient();

  // 1. Owner fast path — always project scope
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === userId) return 'project';

  // 2. Look up the user's role name and (for guests) their access grant
  const [{ data: assignment }, { data: grant }] = await Promise.all([
    (supabase as any)
      .from('user_role_assignments')
      .select('rbac_roles(name)')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .maybeSingle(),
    (supabase as any)
      .from('user_project_access_grants')
      .select('read_scope')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .maybeSingle(),
  ]);

  const roleName: string | undefined = assignment?.rbac_roles?.name;

  switch (roleName) {
    case 'owner':
    case 'project_manager':
      return 'project';

    case 'team_manager':
      return 'team';

    case 'team_member':
      return 'own';

    case 'guest': {
      // Guest scope is set at invite time and stored in user_project_access_grants
      const grantedScope = grant?.read_scope as ReadScope | null | undefined;
      return grantedScope ?? 'project';
    }

    default:
      // No role assigned (e.g. before backfill) — fail safe to 'own'
      return 'own';
  }
}

/**
 * Returns the user IDs of all members of every sub-team the given user belongs
 * to within a project (including the user themselves).
 *
 * Used when scope = 'team' to build an `owner_id IN (...)` filter.
 * Returns [userId] (self only) if the user belongs to no sub-teams.
 */
export async function getTeamMemberIds(
  userId: string,
  projectId: string
): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await (supabase as any)
    .from('project_team_members')
    .select('user_id, project_teams!inner(project_id)')
    .eq('project_teams.project_id', projectId)
    .in(
      'team_id',
      (supabase as any)
        .from('project_team_members')
        .select('team_id')
        .eq('user_id', userId)
    );

  if (!data || data.length === 0) return [userId];

  const ids = new Set<string>(data.map((r: { user_id: string }) => r.user_id));
  ids.add(userId); // always include self
  return Array.from(ids);
}
