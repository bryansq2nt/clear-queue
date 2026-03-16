import { createClient } from '@/lib/supabase/server';
import { getGrantedActions } from './resolver';

export type ReadScope = 'own' | 'team' | 'project';

/**
 * Returns the highest read scope the user holds for a given module in a project.
 *
 * Resolution order (highest wins):
 *   1. Project owner fast path → 'project'
 *   2. `{module}.read.project` OR legacy `{module}.read` → 'project'
 *   3. `{module}.read.team` → 'team'
 *   4. `{module}.read.own` → 'own'
 *   5. Fallback → 'own' (show only own content rather than nothing)
 *
 * Uses `getGrantedActions()` which is React-cache()-wrapped, so multiple
 * calls for the same (userId, projectId) in one render share one DB round-trip.
 */
export async function getReadScope(
  userId: string,
  projectId: string,
  module: string
): Promise<ReadScope> {
  const supabase = await createClient();

  // Owner fast path
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === userId) return 'project';

  const granted = await getGrantedActions(userId, projectId, true);

  // Legacy *.read key acts as project-scope for backwards compatibility
  if (granted.has(`${module}.read.project`) || granted.has(`${module}.read`)) {
    return 'project';
  }
  if (granted.has(`${module}.read.team`)) return 'team';
  if (granted.has(`${module}.read.own`)) return 'own';

  // Fallback: if user has any read capability at all, default to own
  return 'own';
}

/**
 * Returns the user IDs of all members of every sub-team the given user belongs
 * to within a project (including the user themselves).
 *
 * Used when scope = 'team' to build an `owner_id IN (...)` filter.
 * Returns an empty array if the user belongs to no sub-teams.
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
