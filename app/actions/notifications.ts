'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';

export type AppNotification =
  | {
      id: string;
      type: 'invite_pending';
      projectName: string;
      roleName: string;
      href: string;
      /** pending | accepted | rejected — invite may still be open until resolved */
      inviteStatus: 'pending' | 'accepted' | 'rejected';
      rejectionReason: string | null;
      created_at: string;
      read_at: string | null;
    }
  | {
      id: string;
      type: 'invite_response';
      outcome: 'accepted' | 'rejected';
      projectName: string;
      inviteeEmail: string;
      inviteeDisplayName: string;
      roleName: string;
      rejectionReason: string | null;
      href: string;
      created_at: string;
      read_at: string | null;
    }
  | {
      id: string;
      type: 'project_removed';
      projectName: string;
      reason: string | null;
      href: string;
      created_at: string;
      read_at: string | null;
    }
  | {
      id: string;
      type: 'sub_team_changed';
      projectName: string;
      previousTeamNames: string[];
      newTeamName: string;
      firstAssignment: boolean;
      href: string;
      created_at: string;
      read_at: string | null;
    };

function mapInAppRow(row: {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}): AppNotification | null {
  const p = row.payload ?? {};
  const read_at = row.read_at ?? null;

  if (row.kind === 'invite_pending') {
    const statusRaw = p.status;
    const inviteStatus =
      statusRaw === 'accepted' || statusRaw === 'rejected'
        ? statusRaw
        : 'pending';
    const rr = p.rejection_reason;
    const rejectionReason =
      typeof rr === 'string' && rr.trim().length > 0 ? String(rr) : null;
    const token = String(p.token ?? '');
    return {
      id: String(row.id),
      type: 'invite_pending',
      projectName: String(p.project_name ?? 'Project'),
      roleName: String(p.role_name ?? 'member'),
      href: token ? `/invite/${token}` : '/notifications',
      inviteStatus,
      rejectionReason,
      created_at: row.created_at,
      read_at,
    };
  }

  if (row.kind === 'invite_response') {
    const outcome = p.invite_outcome === 'rejected' ? 'rejected' : 'accepted';
    const rr = p.rejection_reason;
    let rejectionReason: string | null = null;
    if (typeof rr === 'string' && rr.trim().length > 0) {
      rejectionReason = rr.trim();
    }
    return {
      id: String(row.id),
      type: 'invite_response',
      outcome,
      projectName: String(p.project_name ?? 'Project'),
      inviteeEmail: String(p.invitee_email ?? ''),
      inviteeDisplayName: String(
        p.invitee_display_name ?? p.invitee_email ?? ''
      ),
      roleName: String(p.role_name ?? 'member'),
      rejectionReason,
      href: '/',
      created_at: row.created_at,
      read_at,
    };
  }

  if (row.kind === 'project_removed') {
    const reasonRaw = p.reason;
    const reason =
      typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
        ? String(reasonRaw)
        : null;
    return {
      id: String(row.id),
      type: 'project_removed',
      projectName: String(p.project_name ?? 'Project'),
      reason,
      href: '/',
      created_at: row.created_at,
      read_at,
    };
  }

  if (row.kind === 'sub_team_changed') {
    const prev = p.previous_team_names;
    const previousTeamNames = Array.isArray(prev)
      ? prev.map((x: unknown) => String(x))
      : [];
    return {
      id: String(row.id),
      type: 'sub_team_changed',
      projectName: String(p.project_name ?? 'Project'),
      previousTeamNames,
      newTeamName: String(p.new_team_name ?? ''),
      firstAssignment: Boolean(p.first_assignment_to_sub_team),
      href: '/',
      created_at: row.created_at,
      read_at,
    };
  }

  return null;
}

export async function listMyNotifications(): Promise<AppNotification[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  // Invites created before the invitee had an account never fired the invite_pending
  // trigger; materialize matching rows now (idempotent).
  const { error: syncError } = await (supabase as any).rpc(
    'sync_invite_pending_notifications_for_current_user'
  );
  if (syncError) {
    captureWithContext(syncError, {
      module: 'notifications',
      action: 'syncInvitePendingNotifications',
      userIntent: 'Backfill invite inbox after signup',
      expected:
        'sync_invite_pending_notifications_for_current_user RPC succeeds',
    });
  }

  const { data: rows, error } = await (supabase as any)
    .from('user_in_app_notifications')
    .select('id, kind, payload, created_at, read_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    captureWithContext(error, {
      module: 'notifications',
      action: 'listMyNotifications',
      userIntent: 'Load notification inbox',
      expected: 'user_in_app_notifications select succeeds',
    });
    return [];
  }

  const list: AppNotification[] = (rows ?? [])
    .map((row: any) =>
      mapInAppRow({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        created_at: row.created_at,
        read_at: row.read_at,
      })
    )
    .filter((n: AppNotification | null): n is AppNotification => n !== null);

  return list.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getMyNotificationsCount(): Promise<number> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error: syncError } = await (supabase as any).rpc(
    'sync_invite_pending_notifications_for_current_user'
  );
  if (syncError) {
    captureWithContext(syncError, {
      module: 'notifications',
      action: 'syncInvitePendingNotifications',
      userIntent: 'Backfill invite inbox for unread count',
      expected:
        'sync_invite_pending_notifications_for_current_user RPC succeeds',
    });
  }

  const { count, error } = await (supabase as any)
    .from('user_in_app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) {
    captureWithContext(error, {
      module: 'notifications',
      action: 'getMyNotificationsCount',
      userIntent: 'Unread notification count',
      expected: 'count query succeeds',
    });
    return 0;
  }
  return count ?? 0;
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!notificationId?.trim()) {
    return { ok: false, error: 'Invalid id' };
  }
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from('user_in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId.trim())
    .eq('user_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'notifications',
      action: 'markNotificationRead',
      userIntent: 'Mark notification as read',
      expected: 'update read_at',
      extra: { notificationId },
    });
    return { ok: false, error: error.message };
  }

  revalidatePath('/notifications');
  revalidatePath('/');
  return { ok: true };
}
