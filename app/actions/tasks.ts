'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type TaskStatus = Database['public']['Tables']['tasks']['Row']['status'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type TaskWithProject = Database['public']['Tables']['tasks']['Row'] & {
  projects: { id: string; name: string; color: string | null } | null;
};

export async function createTask(formData: FormData) {
  await requireAuth();
  const supabase = await createClient();

  const projectId = formData.get('project_id') as string;
  const title = formData.get('title') as string;
  const status = (formData.get('status') as TaskStatus) || 'next';
  const priority = parseInt(formData.get('priority') as string) || 3;
  const dueDate = formData.get('due_date') as string | null;
  const notes = formData.get('notes') as string | null;

  // Get max order_index for this status
  const { data: maxOrder } = await supabase
    .from('tasks')
    .select('order_index')
    .eq('status', status)
    .order('order_index', { ascending: false })
    .limit(1)
    .single();

  const maxOrderRow = maxOrder as { order_index: number } | null;
  const orderIndex =
    maxOrderRow?.order_index != null ? maxOrderRow.order_index + 1 : 0;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      title,
      status,
      priority,
      due_date: dueDate || null,
      notes: notes || null,
      order_index: orderIndex,
    } as never)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  return { data };
}

export async function updateTask(id: string, formData: FormData) {
  await requireAuth();
  const supabase = await createClient();

  const title = formData.get('title') as string | null;
  const projectId = formData.get('project_id') as string | null;
  const status = formData.get('status') as TaskStatus | null;
  const priority = formData.get('priority')
    ? parseInt(formData.get('priority') as string)
    : null;
  const dueDate = formData.get('due_date') as string | null;
  const notes = formData.get('notes') as string | null;

  const updates: TaskUpdate = {};
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

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  return { data };
}

export async function deleteTask(id: string) {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from('tasks').delete().eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}

export async function deleteTasksByIds(ids: string[]) {
  await requireAuth();
  const supabase = await createClient();

  if (!ids || ids.length === 0) {
    return { error: 'No task IDs provided' };
  }

  const { error } = await supabase.from('tasks').delete().in('id', ids);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}

const TASK_COLS =
  'id, project_id, title, status, priority, due_date, notes, order_index, created_at, updated_at';
const PROJECT_COLS =
  'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at';

export const getDashboardData = cache(
  async (): Promise<{
    projects: Database['public']['Tables']['projects']['Row'][];
    tasks: Database['public']['Tables']['tasks']['Row'][];
  }> => {
    await requireAuth();
    const supabase = await createClient();
    const { getUser } = await import('@/lib/auth');
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
        .order('order_index', { ascending: true }),
    ]);

    const projects = (projectsRes.data ||
      []) as Database['public']['Tables']['projects']['Row'][];
    const tasks = (tasksRes.data ||
      []) as Database['public']['Tables']['tasks']['Row'][];
    return { projects, tasks };
  }
);

export const getTasksByProjectId = cache(async (projectId: string) => {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });
  if (error) return [];
  return (data || []) as Database['public']['Tables']['tasks']['Row'][];
});

export async function getCriticalTasks(): Promise<
  TaskWithProject[]
> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `
      id, project_id, title, status, priority, due_date, notes, order_index, created_at, updated_at,
      projects ( id, name, color )
    `
    )
    .eq('priority', 5)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(5);
  if (error) return [];
  return (data || []) as TaskWithProject[];
}

export async function getRecentTasksPage(
  page: number,
  pageSize: number
): Promise<{
  data: TaskWithProject[];
  count: number | null;
  error: Error | null;
}> {
  await requireAuth();
  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from('tasks')
    .select(
      `
      id, project_id, title, status, priority, due_date, notes, order_index, created_at, updated_at,
      projects ( id, name, color )
    `,
      { count: 'exact' }
    )
    .neq('status', 'done')
    .order('updated_at', { ascending: false })
    .range(from, to);
  return {
    data: (data || []) as TaskWithProject[],
    count: count ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function getHighPriorityTasksPage(
  page: number,
  pageSize: number
): Promise<{
  data: TaskWithProject[];
  count: number | null;
  error: Error | null;
}> {
  await requireAuth();
  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from('tasks')
    .select(
      `
      id, project_id, title, status, priority, due_date, notes, order_index, created_at, updated_at,
      projects ( id, name, color )
    `,
      { count: 'exact' }
    )
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
  oldStatus?: TaskStatus
) {
  await requireAuth();
  const supabase = await createClient();

  // Get the task being moved
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('order_index, status')
    .eq('id', taskId)
    .single();

  if (taskError || !task) {
    return { error: taskError?.message || 'Task not found' };
  }

  const taskRow = task as { order_index: number; status: TaskStatus };
  const oldIndex = taskRow.order_index;
  const actualOldStatus = oldStatus || taskRow.status;

  const statusesToFetch =
    actualOldStatus === newStatus
      ? [newStatus]
      : [actualOldStatus, newStatus];

  const { data: siblingTasks, error: siblingsError } = await supabase
    .from('tasks')
    .select('id, status, order_index')
    .in('status', statusesToFetch)
    .neq('id', taskId)
    .order('order_index', { ascending: true });

  if (siblingsError) {
    return { error: siblingsError.message };
  }

  const reorderPayload: Array<{
    id: string;
    order_index: number;
    status: TaskStatus;
  }> = [];

  const typedSiblings = (siblingTasks || []) as Array<{
    id: string;
    status: TaskStatus;
    order_index: number;
  }>;

  const oldColumnTasks = typedSiblings.filter(
    (sibling) => sibling.status === actualOldStatus
  );
  const newColumnTasks = typedSiblings.filter(
    (sibling) => sibling.status === newStatus
  );

  if (actualOldStatus !== newStatus) {
    for (const sibling of oldColumnTasks) {
      if (sibling.order_index > oldIndex) {
        reorderPayload.push({
          id: sibling.id,
          order_index: sibling.order_index - 1,
          status: actualOldStatus,
        });
      }
    }

    for (const sibling of newColumnTasks) {
      if (sibling.order_index >= newOrderIndex) {
        reorderPayload.push({
          id: sibling.id,
          order_index: sibling.order_index + 1,
          status: newStatus,
        });
      }
    }
  } else if (newOrderIndex > oldIndex) {
    for (const sibling of newColumnTasks) {
      if (
        sibling.order_index > oldIndex &&
        sibling.order_index <= newOrderIndex
      ) {
        reorderPayload.push({
          id: sibling.id,
          order_index: sibling.order_index - 1,
          status: newStatus,
        });
      }
    }
  } else {
    for (const sibling of newColumnTasks) {
      if (
        sibling.order_index >= newOrderIndex &&
        sibling.order_index < oldIndex
      ) {
        reorderPayload.push({
          id: sibling.id,
          order_index: sibling.order_index + 1,
          status: newStatus,
        });
      }
    }
  }

  reorderPayload.push({
    id: taskId,
    order_index: newOrderIndex,
    status: newStatus,
  });

  const { error } = await supabase.rpc('reorder_tasks_atomic' as never, {
    task_data: reorderPayload,
  } as never);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}
