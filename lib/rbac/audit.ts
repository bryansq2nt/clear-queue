/**
 * lib/rbac/audit.ts
 *
 * Lightweight helper for writing to rbac_audit_log.
 *
 * Design decisions:
 * - Fire-and-forget by default: callers may `void logAuditEvent(...)` so a
 *   slow or failed audit write never blocks the mutation itself.
 * - Never throws: audit failures are logged to Sentry but do not surface
 *   to the user. Correctness of the mutation is more important than the log.
 * - Uses the server Supabase client (same session as the caller's action).
 */

import { createClient } from '@/lib/supabase/server';
import { captureWithContext } from '@/lib/sentry';

export type AuditEvent = {
  /** Who performed the action — must match auth.uid() */
  actorUserId: string;
  /** Dot-separated verb: 'invite.created', 'member.removed', 'project.created' */
  action: string;
  /** The table or domain entity affected */
  resourceType: string;
  /** ID of the affected row (omit for bulk ops) */
  resourceId?: string;
  /** Project scope (if applicable) */
  projectId?: string;
  /** Org scope (if applicable) */
  orgId?: string;
  /** Any extra context — keep small, never include PII beyond IDs */
  metadata?: Record<string, unknown>;
};

/**
 * Appends one row to rbac_audit_log.
 *
 * Usage (fire-and-forget):
 *   void logAuditEvent({ actorUserId: user.id, action: 'invite.created', ... });
 *
 * Usage (await when you want to surface errors in tests):
 *   await logAuditEvent({ ... });
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from('rbac_audit_log')
      .insert({
        actor_user_id: event.actorUserId,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId ?? null,
        project_id: event.projectId ?? null,
        org_id: event.orgId ?? null,
        metadata: event.metadata ?? {},
      });

    if (error) {
      captureWithContext(error, {
        module: 'rbac',
        action: 'logAuditEvent',
        userIntent: 'Write an audit log entry',
        expected: 'Row inserted into rbac_audit_log',
        extra: { auditAction: event.action, resourceType: event.resourceType },
      });
    }
  } catch (err) {
    // Audit must never crash the caller
    captureWithContext(err as Error, {
      module: 'rbac',
      action: 'logAuditEvent',
      userIntent: 'Write an audit log entry',
      expected: 'Row inserted into rbac_audit_log',
    });
  }
}
