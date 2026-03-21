'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import {
  resolveModules,
  getEnabledModuleKeys,
  MODULE_REGISTRY,
  type ModuleKey,
  type SerializableResolvedModule,
} from '@/lib/modules/registry';
import { isNonGuestContributorRole } from '@/lib/rbac/member-module-use';
import { getRoleIdsForUserInProject } from '@/lib/rbac/resolver';

// ─────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────

// Returns the current user's allowed_modules for a project.
//
// Return values:
//   undefined  — no row (fail-closed: user has no module access grant)
//   null       — row exists with null allowed_modules (explicitly unrestricted: all tabs visible)
//   string[]   — row exists with explicit allowlist (only listed tabs visible)
//
// After the backfill migration (20260324100000) every project member has a row,
// so undefined should only appear for users who are not members of the project.
export const getMyProjectAccessGrant = cache(
  async (projectId: string): Promise<string[] | null | undefined> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const { data } = await (supabase as any)
      .from('user_project_access_grants')
      .select('allowed_modules')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) {
      // Owner safeguard: owners always have full module visibility.
      const { data: project } = await (supabase as any)
        .from('projects')
        .select('owner_id')
        .eq('id', projectId)
        .maybeSingle();
      if (project?.owner_id === user.id) return null;
      return undefined; // no row → fail-closed for non-owners
    }
    const raw = data.allowed_modules;
    if (raw == null) return null; // row with null → unrestricted
    const arr = Array.isArray(raw) ? raw : [];
    const sanitized = arr.filter((x): x is string => typeof x === 'string');

    // Team members/managers must always see the Team module to know
    // their sub-team and teammates, even when invite allowlist omitted it.
    if (!sanitized.includes('team')) {
      const { data: teamMemberships } = await (supabase as any)
        .from('project_team_members')
        .select('team_id, project_teams!inner(project_id)')
        .eq('user_id', user.id)
        .eq('project_teams.project_id', projectId)
        .limit(1);

      if (Array.isArray(teamMemberships) && teamMemberships.length > 0) {
        return [...sanitized, 'team'];
      }
    }

    return sanitized;
  }
);

// Returns whether the current user can toggle project modules (enable/disable for the project).
export const getCanToggleModules = cache(
  async (projectId: string): Promise<boolean> => {
    try {
      const user = await requireAuth();
      await requireCan(user.id, 'projects.manage_modules', {
        type: 'project',
        projectId,
      });
      return true;
    } catch {
      return false;
    }
  }
);

// Whether the current user can view this module (project enabled AND user has access).
export const getCanViewModule = cache(
  async (
    projectId: string,
    moduleKey: ModuleKey
  ): Promise<{
    canView: boolean;
    reason?: 'no_access' | 'project_disabled';
  }> => {
    const [modules, grant] = await Promise.all([
      getProjectModules(projectId),
      getMyProjectAccessGrant(projectId),
    ]);
    const projectEnabledKeys = getEnabledModuleKeys(modules);
    const projectEnabled = projectEnabledKeys.has(moduleKey);
    // null  = row with null allowed_modules → unrestricted (all modules visible)
    // string[] = explicit allowlist → module must be in the list
    // undefined = no row → fail-closed (no module access)
    const userAllowed =
      grant === null || (Array.isArray(grant) && grant.includes(moduleKey));
    const canView = projectEnabled && userAllowed;
    const reason = !canView
      ? !projectEnabled
        ? 'project_disabled'
        : 'no_access'
      : undefined;
    return { canView, reason };
  }
);

/**
 * True when the user sees this module tab and has a non-guest contributor role
 * (team_member / team_manager / project_manager / owner). Used to show create /
 * edit / delete UI for own content even if rbac_role_module_actions is stale.
 * Server actions still call requireCan(); guests remain read-only.
 */
export const getCanUseModuleMemberContent = cache(
  async (projectId: string, moduleKey: ModuleKey): Promise<boolean> => {
    const { canView } = await getCanViewModule(projectId, moduleKey);
    if (!canView) return false;

    const user = await requireAuth();
    const supabase = await createClient();

    const { data: project } = await (supabase as any)
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle();
    if (project?.owner_id === user.id) return true;

    const roleIds = await getRoleIdsForUserInProject(user.id, projectId);
    if (roleIds.length === 0) return false;

    // Resolve names with an explicit select — avoids PostgREST embed edge cases
    // and matches getGrantedActions role expansion (project + org URA).
    const { data: roleRows } = await (supabase as any)
      .from('rbac_roles')
      .select('name')
      .in('id', roleIds);

    const roleNames: string[] = [];
    for (const row of roleRows ?? []) {
      const n = row?.name;
      if (typeof n === 'string') roleNames.push(n);
    }
    return isNonGuestContributorRole(roleNames);
  }
);

export const getProjectModules = cache(
  async (projectId: string): Promise<SerializableResolvedModule[]> => {
    await requireAuth();
    const supabase = await createClient();

    const { data, error } = await (supabase as any)
      .from('project_modules')
      .select('module_key, enabled')
      .eq('project_id', projectId);

    if (error) {
      captureWithContext(error, {
        module: 'modules',
        action: 'getProjectModules',
        userIntent: 'Load module settings for a project',
        expected: 'List of project_modules rows from DB',
      });
      // Fallback: return all modules with their registry defaults.
      // Better to show everything than block the project view.
      return resolveModules([]);
    }

    return resolveModules(data ?? []);
  }
);

// ─────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────

export async function setProjectModuleEnabled(
  projectId: string,
  moduleKey: ModuleKey,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'projects.manage_modules', {
    type: 'project',
    projectId,
  });

  // Validate moduleKey is a known key
  if (!(moduleKey in MODULE_REGISTRY)) {
    return { ok: false, error: 'Invalid module key' };
  }

  // Reject attempts to toggle locked modules
  if (MODULE_REGISTRY[moduleKey].lock) {
    return { ok: false, error: 'This module cannot be disabled' };
  }

  const supabase = await createClient();

  const { error } = await (supabase as any).from('project_modules').upsert(
    {
      project_id: projectId,
      module_key: moduleKey,
      enabled,
    },
    { onConflict: 'project_id,module_key' }
  );

  if (error) {
    captureWithContext(error, {
      module: 'modules',
      action: 'setProjectModuleEnabled',
      userIntent: `Set module "${moduleKey}" to ${enabled} for project ${projectId}`,
      expected: 'Upsert row in project_modules',
    });
    return { ok: false, error: 'No se pudo guardar el cambio' };
  }

  revalidatePath(`/context/${projectId}`, 'layout');

  return { ok: true };
}
