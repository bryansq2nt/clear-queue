'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { createTaskSchema } from '@/lib/server/action-schemas';
import { parseWithSchema } from '@/lib/server/validation';
import {
  assertOwnedRecord,
  assertTaskOwnedByProject,
} from '@/lib/server/authz';

type TaskStatus = Database['public']['Tables']['tasks']['Row']['status'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type TaskWithProject = Database['public']['Tables']['tasks']['Row'] & {
  projects: { id: string; name: string; color: string | null } | null;
};

export async function createTask(formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();
  const parsed = parseWithSchema(createTaskSchema, {
    project_id: formData.get('project_id'),
    title: formData.get('title'),
    status: formData.get('status') || 'next',
    priority: formData.get('priority') || 3,
    due_date: formData.get('due_date'),
    notes: formData.get('notes'),
  });
  if (!parsed.data) return { error: parsed.error ?? 'Invalid payload' };

  const ownership = await assertOwnedRecord(
    'projects',
    parsed.data.project_id,
    user.id
  );
  if (!ownership.ok) return { error: ownership.error };

  const { data, error } = await supabase.rpc(
    'create_task_atomic' as never,
    {
      in_project_id: parsed.data.project_id,
      in_title: parsed.data.title,
      in_status: parsed.data.status,
      in_priority: parsed.data.priority,
      in_due_date: parsed.data.due_date,
      in_notes: parsed.data.notes,
    } as never
  );

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return { data };
}

export async function updateTask(id: string, formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const ownerCheck = await assertTaskOwnedByProject(id, user.id);
  if (!ownerCheck.ok) return { error: ownerCheck.error };

  const projectId = (formData.get('project_id') as string | null) || null;
  if (projectId) {
    const projectCheck = await assertOwnedRecord(
      'projects',
      projectId,
      user.id
    );
    if (!projectCheck.ok) return { error: projectCheck.error };
  }

  const updates: TaskUpdate = {};
  const title = formData.get('title') as string | null;
  const status = formData.get('status') as TaskStatus | null;
  const priority = formData.get('priority')
    ? parseInt(formData.get('priority') as string)
    : null;
  const dueDate = formData.get('due_date') as string | null;
  const notes = formData.get('notes') as string | null;

  if (title) updates.title = title;
  if (projectId) updates.project_id = projectId;
  if (status) updates.status = status;
  if (priority !== null) updates.priority = priority;
  if (dueDate !== undefined) updates.due_date = dueDate || null;
  if (notes !== undefined) updates.notes = notes || null;

  const { data, error } = await supabase
    .from('tasks')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { data };
}

export async function deleteTask(id: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const ownerCheck = await assertTaskOwnedByProject(id, user.id);
  if (!ownerCheck.ok) return { error: ownerCheck.error };

  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}

export async function deleteTasksByIds(ids: string[]) {
  const user = await requireAuth();
  const supabase = await createClient();
  if (!ids || ids.length === 0) return { error: 'No task IDs provided' };

  for (const id of ids) {
    const ownerCheck = await assertTaskOwnedByProject(id, user.id);
    if (!ownerCheck.ok) return { error: ownerCheck.error };
  }

  const { error } = await supabase.from('tasks').delete().in('id', ids);
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}

const TASK_COLS =
  'id, project_id, owner_id, title, status, priority, due_date, notes, order_index, created_at, updated_at';
const PROJECT_COLS =
  'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at';

export const getDashboardData = cache(async () => {
  await requireAuth();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { projects: [], tasks: [] };

  const [projectsRes, tasksRes] = await Promise.all([
    supabase
      .from('projects')
      .select(PROJECT_COLS)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('owner_id', user.id)
      .order('order_index', { ascending: true }),
  ]);

  return {
    projects: (projectsRes.data || []) as any[],
    tasks: (tasksRes.data || []) as any[],
  };
});

export const getTasksByProjectId = cache(async (projectId: string) => {
  await requireAuth();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('owner_id', user.id)
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });
  if (error) return [];
  return data || [];
});

export async function getCriticalTasks(): Promise<TaskWithProject[]> {
  await requireAuth();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, project_id, owner_id, title, status, priority, due_date, notes, order_index, created_at, updated_at, projects ( id, name, color )'
    )
    .eq('owner_id', user.id)
    .eq('priority', 5)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(5);

  if (error) return [];
  return (data || []) as TaskWithProject[];
}

export async function getRecentTasksPage(page: number, pageSize: number) {
  await requireAuth();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { data: [], count: 0, error: null };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from('tasks')
    .select(
      'id, project_id, owner_id, title, status, priority, due_date, notes, order_index, created_at, updated_at, projects ( id, name, color )',
      { count: 'exact' }
    )
    .eq('owner_id', user.id)
    .neq('status', 'done')
    .order('updated_at', { ascending: false })
    .range(from, to);
  return {
    data: (data || []) as TaskWithProject[],
    count: count ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function getHighPriorityTasksPage(page: number, pageSize: number) {
  await requireAuth();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { data: [], count: 0, error: null };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from('tasks')
    .select(
      'id, project_id, owner_id, title, status, priority, due_date, notes, order_index, created_at, updated_at, projects ( id, name, color )',
      { count: 'exact' }
    )
    .eq('owner_id', user.id)
    .eq('priority', 5)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(from, to);
  return {
    data: (data || []) as TaskWithProject[],
    count: count ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateTaskOrder(
  taskId: string,
  newStatus: TaskStatus,
  newOrderIndex: number,
  _oldStatus?: TaskStatus
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const ownerCheck = await assertTaskOwnedByProject(taskId, user.id);
  if (!ownerCheck.ok) return { error: ownerCheck.error };

  const { error } = await supabase.rpc(
    'move_task_atomic' as never,
    {
      in_task_id: taskId,
      in_new_status: newStatus,
      in_new_order_index: newOrderIndex,
    } as never
  );

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}
