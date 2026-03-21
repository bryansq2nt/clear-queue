'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan, getGrantedActions } from '@/lib/rbac/resolver';
import { getReadScope, getTeamMemberIds } from '@/lib/rbac/read-scope';
import { captureWithContext } from '@/lib/sentry';
import { getCanUseModuleMemberContent } from '@/app/actions/modules';
import { revalidatePath } from 'next/cache';
import type {
  Milestone,
  MilestoneWithProgress,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from '@/lib/milestones/schema';

const MILESTONE_COLS =
  'id, project_id, title, description, sort_order, status, completed_at, created_by, created_at, updated_at';

export const listMilestones = cache(
  async (projectId: string): Promise<Milestone[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const readScope = await getReadScope(user.id, projectId);

    let q = (supabase as any)
      .from('milestones')
      .select(MILESTONE_COLS)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (readScope === 'own') {
      q = q.eq('created_by', user.id);
    } else if (readScope === 'team') {
      const memberIds = await getTeamMemberIds(user.id, projectId);
      q = q.in('created_by', memberIds);
    }
    // 'project' scope: no additional filter — all milestones visible

    const { data, error } = await q;

    if (error) {
      captureWithContext(error, {
        module: 'milestones',
        action: 'listMilestones',
        userIntent: 'List project milestones',
        expected: 'Milestones array',
        extra: { projectId },
      });
      return [];
    }
    return (data as Milestone[]) ?? [];
  }
);

export async function getMilestonesWithProgress(
  projectId: string
): Promise<MilestoneWithProgress[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const readScope = await getReadScope(user.id, projectId);

  let mq = (supabase as any)
    .from('milestones')
    .select(MILESTONE_COLS)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (readScope === 'own') {
    mq = mq.eq('created_by', user.id);
  } else if (readScope === 'team') {
    const memberIds = await getTeamMemberIds(user.id, projectId);
    mq = mq.in('created_by', memberIds);
  }

  const { data: milestones, error: milestonesError } = await mq;

  if (milestonesError || !milestones?.length) {
    if (milestonesError) {
      captureWithContext(milestonesError, {
        module: 'milestones',
        action: 'getMilestonesWithProgress',
        userIntent: 'Load milestones with task counts',
        expected: 'Milestones with progress',
        extra: { projectId },
      });
    }
    return [];
  }

  // Task counts: scoped to the same set of tasks the user can see.
  let tq = (supabase as any)
    .from('tasks')
    .select('milestone_id, status')
    .eq('project_id', projectId);

  if (readScope === 'own') {
    tq = tq.eq('assigned_to', user.id);
  } else if (readScope === 'team') {
    const memberIds = await getTeamMemberIds(user.id, projectId);
    tq = tq.in('assigned_to', memberIds);
  }

  const { data: taskCounts } = await tq;

  const countByMilestone = new Map<string, { total: number; done: number }>();
  for (const m of milestones as Milestone[]) {
    countByMilestone.set(m.id, { total: 0, done: 0 });
  }
  for (const t of taskCounts ?? []) {
    const mid = t.milestone_id as string | null;
    if (!mid) continue;
    const cur = countByMilestone.get(mid);
    if (!cur) continue;
    cur.total += 1;
    if (t.status === 'done') cur.done += 1;
  }

  return (milestones as Milestone[]).map((m) => {
    const { total, done } = countByMilestone.get(m.id) ?? {
      total: 0,
      done: 0,
    };
    return { ...m, tasks_total: total, tasks_done: done };
  });
}

export async function createMilestone(
  projectId: string,
  input: CreateMilestoneInput
): Promise<{ data?: Milestone; error?: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'milestones.create', {
    type: 'milestone',
    projectId,
  });
  const supabase = await createClient();

  const title = input.title?.trim();
  if (!title) return { error: 'Title is required' };

  const { data: maxOrder } = await (supabase as any)
    .from('milestones')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = input.sort_order ?? (maxOrder?.sort_order ?? -1) + 1;

  const { data, error } = await (supabase as any)
    .from('milestones')
    .insert({
      project_id: projectId,
      title,
      description: input.description?.trim() || null,
      sort_order,
      created_by: user.id,
    })
    .select(MILESTONE_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'milestones',
      action: 'createMilestone',
      userIntent: 'Create milestone',
      expected: 'Milestone row',
      extra: { projectId },
    });
    return { error: error.message ?? 'Failed to create milestone' };
  }

  revalidatePath('/');
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/milestones`);
  return { data: data as Milestone };
}

export async function updateMilestone(
  milestoneId: string,
  input: UpdateMilestoneInput
): Promise<{ data?: Milestone; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: milestoneRow } = await (supabase as any)
    .from('milestones')
    .select('project_id')
    .eq('id', milestoneId)
    .maybeSingle();
  if (milestoneRow?.project_id) {
    await requireCan(user.id, 'milestones.update', {
      type: 'milestone',
      projectId: milestoneRow.project_id,
    });
  }

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined)
    updates.description = input.description?.trim() || null;
  if (input.sort_order !== undefined) updates.sort_order = input.sort_order;
  if (input.status !== undefined) {
    if (input.status === 'completed') {
      const { count } = await (supabase as any)
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('milestone_id', milestoneId)
        .neq('status', 'done');
      if ((count ?? 0) > 0) {
        return {
          error: 'MILESTONE_INCOMPLETE_TASKS',
        };
      }
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_at = null;
    }
    updates.status = input.status;
  }
  if (Object.keys(updates).length === 0) {
    const { data } = await (supabase as any)
      .from('milestones')
      .select(MILESTONE_COLS)
      .eq('id', milestoneId)
      .single();
    return { data: data as Milestone };
  }

  const { data, error } = await (supabase as any)
    .from('milestones')
    .update(updates)
    .eq('id', milestoneId)
    .select(MILESTONE_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'milestones',
      action: 'updateMilestone',
      userIntent: 'Update milestone',
      expected: 'Milestone row',
      extra: { milestoneId },
    });
    return { error: error.message ?? 'Failed to update milestone' };
  }

  const projectId = (data as Milestone).project_id;
  revalidatePath('/');
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/milestones`);
  return { data: data as Milestone };
}

export async function completeMilestone(
  milestoneId: string
): Promise<{ data?: Milestone; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: milestoneRow } = await (supabase as any)
    .from('milestones')
    .select('project_id')
    .eq('id', milestoneId)
    .maybeSingle();
  if (milestoneRow?.project_id) {
    await requireCan(user.id, 'milestones.update', {
      type: 'milestone',
      projectId: milestoneRow.project_id,
    });
  }

  const { data, error } = await (supabase as any).rpc(
    'complete_milestone_atomic',
    {
      p_milestone_id: milestoneId,
    }
  );

  if (error) {
    captureWithContext(error, {
      module: 'milestones',
      action: 'completeMilestone',
      userIntent: 'Complete milestone and its tasks',
      expected: 'Milestone row',
      extra: { milestoneId },
    });
    return { error: error.message ?? 'Failed to complete milestone' };
  }

  if (!data) return { error: 'Milestone not found' };

  const projectId = (data as Milestone).project_id;
  revalidatePath('/');
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/milestones`);
  return { data: data as Milestone };
}

export async function reopenMilestone(
  milestoneId: string
): Promise<{ data?: Milestone; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: milestoneRow } = await (supabase as any)
    .from('milestones')
    .select('project_id')
    .eq('id', milestoneId)
    .maybeSingle();
  if (milestoneRow?.project_id) {
    await requireCan(user.id, 'milestones.update', {
      type: 'milestone',
      projectId: milestoneRow.project_id,
    });
  }

  const { data, error } = await (supabase as any).rpc(
    'reopen_milestone_atomic',
    {
      p_milestone_id: milestoneId,
    }
  );

  if (error) {
    captureWithContext(error, {
      module: 'milestones',
      action: 'reopenMilestone',
      userIntent: 'Reopen milestone and set tasks to pending',
      expected: 'Milestone row',
      extra: { milestoneId },
    });
    return { error: error.message ?? 'Failed to reopen milestone' };
  }

  if (!data) return { error: 'Milestone not found' };

  const projectId = (data as Milestone).project_id;
  revalidatePath('/');
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/milestones`);
  return { data: data as Milestone };
}

export async function deleteMilestone(
  milestoneId: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: row } = await (supabase as any)
    .from('milestones')
    .select('project_id')
    .eq('id', milestoneId)
    .single();

  if (row?.project_id) {
    await requireCan(user.id, 'milestones.delete', {
      type: 'milestone',
      projectId: row.project_id,
    });
  }

  const { error } = await (supabase as any)
    .from('milestones')
    .delete()
    .eq('id', milestoneId);

  if (error) {
    captureWithContext(error, {
      module: 'milestones',
      action: 'deleteMilestone',
      userIntent: 'Delete milestone',
      expected: 'Row deleted',
      extra: { milestoneId },
    });
    return { error: error.message ?? 'Failed to delete milestone' };
  }

  if (row?.project_id) {
    revalidatePath('/');
    revalidatePath('/context');
    revalidatePath(`/context/${row.project_id}`);
    revalidatePath(`/context/${row.project_id}/milestones`);
  }
  return {};
}

// ---------------------------------------------------------------------------
// Milestones UI permissions
// ---------------------------------------------------------------------------

export type MilestonesPermissions = {
  canCreate: boolean;
  canUpdate: boolean;
  canComplete: boolean;
  canDelete: boolean;
};

export async function getMilestonesPermissions(
  projectId: string
): Promise<MilestonesPermissions> {
  const user = await requireAuth();
  const supabase = await createClient();

  const allFalse: MilestonesPermissions = {
    canCreate: false,
    canUpdate: false,
    canComplete: false,
    canDelete: false,
  };
  if (!projectId?.trim()) return allFalse;

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === user.id) {
    return {
      canCreate: true,
      canUpdate: true,
      canComplete: true,
      canDelete: true,
    };
  }

  const [granted, memberUse] = await Promise.all([
    getGrantedActions(user.id, projectId, true),
    getCanUseModuleMemberContent(projectId, 'milestones'),
  ]);
  return {
    canCreate: granted.has('milestones.create') || memberUse,
    canUpdate: granted.has('milestones.update') || memberUse,
    canComplete: granted.has('milestones.update') || memberUse,
    canDelete: granted.has('milestones.delete') || memberUse,
  };
}
