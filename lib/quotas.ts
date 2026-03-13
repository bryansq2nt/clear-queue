/**
 * lib/quotas.ts
 *
 * Quota check helpers for plan enforcement.
 * Called from server actions before any create/invite operation.
 *
 * Each helper returns { allowed: true } or { allowed: false, reason: string }.
 * Callers should return an error early when allowed === false.
 */

import { createClient } from '@/lib/supabase/server';

export type QuotaResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Checks whether the project can accept one more member,
 * based on the org plan's max_members_per_project limit.
 */
export async function checkProjectMemberQuota(
  projectId: string
): Promise<QuotaResult> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(
    'check_project_member_quota',
    { p_project_id: projectId }
  );
  if (error) {
    // Fail open: if the quota check itself errors, log but allow the operation
    // so quota infrastructure problems don't hard-block the product.
    console.error('[quotas] check_project_member_quota error', error);
    return { allowed: true };
  }
  if (data === false) {
    return {
      allowed: false,
      reason: 'quota_members_per_project',
    };
  }
  return { allowed: true };
}

/**
 * Checks whether the org can create one more project,
 * based on the org plan's max_projects_per_org limit.
 */
export async function checkOrgProjectQuota(
  orgId: string
): Promise<QuotaResult> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(
    'check_org_project_quota',
    { p_org_id: orgId }
  );
  if (error) {
    console.error('[quotas] check_org_project_quota error', error);
    return { allowed: true };
  }
  if (data === false) {
    return {
      allowed: false,
      reason: 'quota_projects_per_org',
    };
  }
  return { allowed: true };
}
