import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Resource descriptor — the resolver extracts context from this typed union.
// ---------------------------------------------------------------------------

export type Resource =
  | { type: 'own' }
  | { type: 'project'; projectId: string }
  | { type: 'organization'; orgId: string }
  | {
      type:
        | 'task'
        | 'note'
        | 'milestone'
        | 'document'
        | 'media'
        | 'link'
        | 'idea'
        | 'budget'
        | 'billing'
        | 'todo'
        | 'calendar_event';
      projectId: string;
    }
  | { type: 'client' | 'business'; orgId: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContextFromResource(resource: Resource): {
  isProjectScope: boolean;
  contextId: string;
} | null {
  if (resource.type === 'own') return null;
  if ('projectId' in resource)
    return { isProjectScope: true, contextId: resource.projectId };
  return { isProjectScope: false, contextId: resource.orgId };
}

// ---------------------------------------------------------------------------
// getGrantedActions — the expensive DB lookup, cached per request.
//
// React's cache() deduplicates calls with the same (userId, contextId,
// isProjectScope) within a single server render. Multiple can() calls for
// the same project share one resolution result.
//
// Role is the single source of truth. Per-member action key overrides were
// removed in the Phase 1 simplified-roles migration — roles now define the
// complete permission set for each member.
// ---------------------------------------------------------------------------

export const getGrantedActions = cache(
  async (
    userId: string,
    contextId: string,
    isProjectScope: boolean
  ): Promise<Set<string>> => {
    const supabase = await createClient();

    const roleIds: string[] = [];

    if (isProjectScope) {
      // Fetch project roles and the project's org_id in parallel
      const [{ data: projectRoles }, { data: project }] = await Promise.all([
        (supabase as any)
          .from('user_role_assignments')
          .select('role_id')
          .eq('user_id', userId)
          .eq('project_id', contextId),
        (supabase as any)
          .from('projects')
          .select('org_id')
          .eq('id', contextId)
          .maybeSingle(),
      ]);

      if (projectRoles) {
        for (const r of projectRoles) roleIds.push(r.role_id);
      }

      // Inherit org-level role assignments via the project's parent org
      if (project?.org_id) {
        const { data: orgRoles } = await (supabase as any)
          .from('user_role_assignments')
          .select('role_id')
          .eq('user_id', userId)
          .eq('org_id', project.org_id);

        if (orgRoles) {
          for (const r of orgRoles) roleIds.push(r.role_id);
        }
      }
    } else {
      const { data: orgRoles } = await (supabase as any)
        .from('user_role_assignments')
        .select('role_id')
        .eq('user_id', userId)
        .eq('org_id', contextId);

      if (orgRoles) {
        for (const r of orgRoles) roleIds.push(r.role_id);
      }
    }

    const granted = new Set<string>();

    if (roleIds.length > 0) {
      const { data: actionRows } = await (supabase as any)
        .from('rbac_role_module_actions')
        .select('rbac_module_actions(action_key)')
        .in('role_id', roleIds);

      for (const row of actionRows ?? []) {
        const key = row?.rbac_module_actions?.action_key;
        if (key) granted.add(key);
      }
    }

    return granted;
  }
);

// ---------------------------------------------------------------------------
// can() — returns true if the user has the given permission.
//
// For 'own'-scoped resources the check passes as long as the user is
// authenticated (the caller must already have called requireAuth()).
//
// Note: can() itself is NOT wrapped with cache() because Resource is an
// object and React's cache() uses referential equality. The expensive work
// is inside getGrantedActions(), which IS cached and deduplicates DB hits
// across all can() calls for the same (userId, contextId) pair.
// ---------------------------------------------------------------------------

export async function can(
  userId: string,
  action: string,
  resource: Resource
): Promise<boolean> {
  if (resource.type === 'own') return true;

  const ctx = getContextFromResource(resource);
  if (!ctx) return false;

  const supabase = await createClient();

  if (ctx.isProjectScope) {
    // Project owners bypass role expansion entirely — they always have full access.
    // This is the authoritative fallback: even if user_role_assignments has no row
    // for the owner, the owner is never locked out of their own project.
    const { data: project } = await (supabase as any)
      .from('projects')
      .select('owner_id')
      .eq('id', ctx.contextId)
      .maybeSingle();

    if (project?.owner_id === userId) return true;

    // Not the owner: confirm they are a project member before expanding roles
    const { data: member } = await (supabase as any)
      .from('project_members')
      .select('id')
      .eq('project_id', ctx.contextId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member) return false;
  } else {
    const { data: member } = await (supabase as any)
      .from('organization_members')
      .select('id')
      .eq('org_id', ctx.contextId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member) return false;
  }

  const grantedActions = await getGrantedActions(
    userId,
    ctx.contextId,
    ctx.isProjectScope
  );
  return grantedActions.has(action);
}

// ---------------------------------------------------------------------------
// requireCan() — throws if the permission check fails.
// Use this in server actions immediately after requireAuth().
//
// Example:
//   const user = await requireAuth();
//   await requireCan(user.id, 'tasks.create', { type: 'task', projectId });
// ---------------------------------------------------------------------------

export async function requireCan(
  userId: string,
  action: string,
  resource: Resource
): Promise<void> {
  const allowed = await can(userId, action, resource);
  if (!allowed) {
    throw new Error(`Forbidden: missing permission '${action}'`);
  }
}
