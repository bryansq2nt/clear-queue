'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan, getGrantedActions } from '@/lib/rbac/resolver';
import { getReadScope, getTeamMemberIds } from '@/lib/rbac/read-scope';
import { getCanUseModuleMemberContent } from '@/app/actions/modules';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import {
  validateCalendarEventTitle,
  validateCalendarEventType,
  validateCalendarEventStatus,
  validateStartAt,
  validateEndAt,
  validateFeedRange,
  type CalendarEventType,
  type CalendarEventStatus,
} from '@/lib/validation/calendar';

type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row'];
type CalendarEventInsert =
  Database['public']['Tables']['calendar_events']['Insert'];
type CalendarEventUpdate =
  Database['public']['Tables']['calendar_events']['Update'];

const CALENDAR_EVENT_COLS =
  'id, owner_id, project_id, title, description, location, event_type, status, all_day, start_at, end_at, created_at, updated_at';

/** One row from get_project_calendar_feed RPC (tasks, billings, todo_items, events). */
export type CalendarFeedItem = {
  source_type: 'task' | 'billing' | 'todo_item' | 'event';
  source_id: string;
  date_key: string;
  title: string;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  amount: number | null;
  paid_at: string | null;
};

function revalidateCalendarPaths(projectId: string) {
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/calendar`);
}

// ------------------------------------------------------------
// Read: project calendar feed (1 DB round trip via RPC)
// ------------------------------------------------------------

export const getProjectCalendarFeed = cache(
  async (input: {
    projectId: string;
    start: string;
    end: string;
  }): Promise<CalendarFeedItem[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const projectId = input.projectId?.trim();
    if (!projectId) return [];

    const range = validateFeedRange(input.start, input.end);
    if (!range.ok) return [];

    // Resolve read scope for the calendar module and build owner filter
    const scope = await getReadScope(user.id, projectId, 'calendar');
    let ownerIds: string[] | null;
    if (scope === 'project') {
      ownerIds = null; // no owner filter
    } else if (scope === 'team') {
      ownerIds = await getTeamMemberIds(user.id, projectId);
    } else {
      ownerIds = [user.id]; // 'own'
    }

    const { data, error } = await supabase.rpc(
      'get_project_calendar_feed' as never,
      {
        p_project_id: projectId,
        p_start_date: range.start,
        p_end_date: range.end,
        p_owner_ids: ownerIds,
      } as never
    );

    if (error) {
      captureWithContext(error, {
        module: 'calendar',
        action: 'getProjectCalendarFeed',
        userIntent: 'Load calendar feed for project',
        expected: 'Unified feed of tasks, billings, todos, events',
        extra: { projectId },
      });
      return [];
    }

    const rows = (data ?? []) as {
      source_type: string;
      source_id: string;
      date_key: string;
      title: string;
      status: string | null;
      start_at: string | null;
      end_at: string | null;
      all_day: boolean;
      amount: number | null;
      paid_at: string | null;
    }[];

    return rows.map((r) => ({
      source_type: r.source_type as CalendarFeedItem['source_type'],
      source_id: r.source_id,
      date_key:
        typeof r.date_key === 'string' ? r.date_key : String(r.date_key),
      title: r.title,
      status: r.status,
      start_at: r.start_at,
      end_at: r.end_at,
      all_day: Boolean(r.all_day),
      amount: r.amount ?? null,
      paid_at: r.paid_at ?? null,
    }));
  }
);

// ------------------------------------------------------------
// Read single event (for edit dialog)
// ------------------------------------------------------------

export async function getCalendarEvent(
  id: string
): Promise<{ data: CalendarEventRow | null; error?: string }> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_EVENT_COLS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return { data: null };
    captureWithContext(error, {
      module: 'calendar',
      action: 'getCalendarEvent',
      userIntent: 'Load event for edit',
      expected: 'Event row or null',
      extra: { eventId: id },
    });
    return { data: null, error: error.message };
  }

  return { data: data as CalendarEventRow };
}

// ------------------------------------------------------------
// Mutations: native calendar events CRUD
// ------------------------------------------------------------

export async function createCalendarEvent(
  projectId: string,
  formData: {
    title: string;
    description?: string | null;
    location?: string | null;
    event_type: CalendarEventType;
    status?: CalendarEventStatus;
    all_day?: boolean;
    start_at: string;
    end_at?: string | null;
  }
): Promise<{ data?: CalendarEventRow; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const titleResult = validateCalendarEventTitle(formData.title);
  if (!titleResult.ok) return { error: titleResult.error };

  const typeResult = validateCalendarEventType(formData.event_type);
  if (!typeResult.ok) return { error: typeResult.error };

  const startResult = validateStartAt(formData.start_at);
  if (!startResult.ok) return { error: startResult.error };

  const statusResult = validateCalendarEventStatus(
    formData.status ?? 'scheduled'
  );
  if (!statusResult.ok) return { error: statusResult.error };

  const endResult = validateEndAt(formData.end_at ?? null, startResult.value);
  if (!endResult.ok) return { error: endResult.error };

  const pid = projectId?.trim() || null;
  if (pid) {
    await requireCan(user.id, 'calendar.create', {
      type: 'calendar_event',
      projectId: pid,
    });
  }
  const insert: CalendarEventInsert = {
    owner_id: user.id,
    project_id: pid,
    title: titleResult.value,
    description: formData.description?.trim() || null,
    location: formData.location?.trim() || null,
    event_type: typeResult.value,
    status: statusResult.value,
    all_day: formData.all_day ?? false,
    start_at: startResult.value,
    end_at: endResult.value,
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(insert as never)
    .select(CALENDAR_EVENT_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'calendar',
      action: 'createCalendarEvent',
      userIntent: 'Create calendar event',
      expected: 'Event created and visible in calendar',
      extra: { projectId: pid },
    });
    return { error: error.message };
  }

  if (pid) revalidateCalendarPaths(pid);
  return { data: data as CalendarEventRow };
}

export async function updateCalendarEvent(
  id: string,
  formData: {
    title?: string;
    description?: string | null;
    location?: string | null;
    event_type?: CalendarEventType;
    status?: CalendarEventStatus;
    all_day?: boolean;
    start_at?: string;
    end_at?: string | null;
  }
): Promise<{ data?: CalendarEventRow; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: eventRow } = await (supabase as any)
    .from('calendar_events')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();
  const eventProjectId = (eventRow as { project_id?: string } | null)
    ?.project_id;
  if (eventProjectId) {
    await requireCan(user.id, 'calendar.update', {
      type: 'calendar_event',
      projectId: eventProjectId,
    });
  }

  const updates: CalendarEventUpdate = {};

  if (formData.title !== undefined) {
    const r = validateCalendarEventTitle(formData.title);
    if (!r.ok) return { error: r.error };
    updates.title = r.value;
  }
  if (formData.description !== undefined)
    updates.description = formData.description?.trim() || null;
  if (formData.location !== undefined)
    updates.location = formData.location?.trim() || null;
  if (formData.event_type !== undefined) {
    const r = validateCalendarEventType(formData.event_type);
    if (!r.ok) return { error: r.error };
    updates.event_type = r.value;
  }
  if (formData.status !== undefined) {
    const r = validateCalendarEventStatus(formData.status);
    if (!r.ok) return { error: r.error };
    updates.status = r.value;
  }
  if (formData.all_day !== undefined) updates.all_day = formData.all_day;
  if (formData.start_at !== undefined) {
    const r = validateStartAt(formData.start_at);
    if (!r.ok) return { error: r.error };
    updates.start_at = r.value;
    const endVal = formData.end_at ?? updates.end_at ?? null;
    const endR = validateEndAt(endVal, r.value);
    if (!endR.ok) return { error: endR.error };
    updates.end_at = endR.value;
  } else if (formData.end_at !== undefined && updates.start_at == null) {
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('start_at')
      .eq('id', id)
      .single();
    const startAt = (existing as { start_at: string } | null)?.start_at;
    if (startAt) {
      const endR = validateEndAt(formData.end_at, startAt);
      if (!endR.ok) return { error: endR.error };
      updates.end_at = endR.value;
    }
  }

  if (Object.keys(updates).length === 0) {
    const { data: row } = await supabase
      .from('calendar_events')
      .select(CALENDAR_EVENT_COLS)
      .eq('id', id)
      .single();
    return { data: row ? (row as CalendarEventRow) : undefined };
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates as never)
    .eq('id', id)
    .select(CALENDAR_EVENT_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'calendar',
      action: 'updateCalendarEvent',
      userIntent: 'Update calendar event',
      expected: 'Event updated in calendar',
      extra: { eventId: id },
    });
    return { error: error.message };
  }

  const row = data as CalendarEventRow;
  if (row.project_id) revalidateCalendarPaths(row.project_id);
  return { data: row };
}

export async function deleteCalendarEvent(
  id: string
): Promise<{ data?: { project_id: string | null }; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from('calendar_events')
    .select('id, project_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    if (fetchError) {
      captureWithContext(fetchError, {
        module: 'calendar',
        action: 'deleteCalendarEvent',
        userIntent: 'Delete calendar event',
        expected: 'Event deleted',
        extra: { eventId: id },
      });
    }
    return { error: fetchError?.message ?? 'Event not found' };
  }

  if ((existing as { project_id: string | null }).project_id) {
    await requireCan(user.id, 'calendar.delete', {
      type: 'calendar_event',
      projectId: (existing as unknown as { project_id: string }).project_id,
    });
  }

  const { error: deleteError } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id);

  if (deleteError) {
    captureWithContext(deleteError, {
      module: 'calendar',
      action: 'deleteCalendarEvent',
      userIntent: 'Delete calendar event',
      expected: 'Event deleted',
      extra: { eventId: id },
    });
    return { error: deleteError.message };
  }

  const projectId = (existing as { project_id: string | null }).project_id;
  if (projectId) revalidateCalendarPaths(projectId);
  return { data: { project_id: projectId } };
}

// ---------------------------------------------------------------------------
// Calendar UI permissions
// ---------------------------------------------------------------------------

export type CalendarPermissions = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export async function getCalendarPermissions(
  projectId: string
): Promise<CalendarPermissions> {
  const user = await requireAuth();
  const supabase = await createClient();

  const allFalse: CalendarPermissions = {
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  };
  if (!projectId?.trim()) return allFalse;

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === user.id) {
    return { canCreate: true, canUpdate: true, canDelete: true };
  }

  const [granted, memberUse] = await Promise.all([
    getGrantedActions(user.id, projectId, true),
    getCanUseModuleMemberContent(projectId, 'calendar'),
  ]);
  return {
    canCreate: granted.has('calendar.create') || memberUse,
    canUpdate: granted.has('calendar.update') || memberUse,
    canDelete: granted.has('calendar.delete') || memberUse,
  };
}
