'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import {
  BOARD_STATUSES,
  INITIAL_TASKS_PER_COLUMN,
  type TaskStatus,
  type BoardInitialData,
} from '@/lib/board';

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

  const { data, error } = await supabase.rpc(
    'create_task_atomic' as never,
    {
      in_project_id: projectId,
      in_title: title,
      in_status: status,
      in_priority: priority,
      in_due_date: dueDate || null,
      in_notes: notes || null,
    } as never
  );

  if (error) {
    captureWithContext(error, {
      module: 'tasks',
      action: 'createTask',
      userIntent: 'Crear nueva tarea en el proyecto',
      expected: 'La tarea se crea y aparece en la columna indicada',
      extra: { projectId },
    });
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/context');
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
    captureWithContext(error, {
      module: 'tasks',
      action: 'updateTask',
      userIntent: 'Actualizar título, estado, prioridad o notas de la tarea',
      expected: 'Los cambios se guardan y la UI se actualiza',
      extra: { taskId: id },
    });
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/context');
  return { data };
}

export async function deleteTask(id: string) {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from('tasks').delete().eq('id', id);

  if (error) {
    captureWithContext(error, {
      module: 'tasks',
      action: 'deleteTask',
      userIntent: 'Eliminar la tarea',
      expected: 'La tarea se elimina del tablero',
      extra: { taskId: id },
    });
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/context');
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
    captureWithContext(error, {
      module: 'tasks',
      action: 'deleteTasksByIds',
      userIntent: 'Eliminar varias tareas',
      expected: 'Las tareas seleccionadas se eliminan',
      extra: { count: ids.length },
    });
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/context');
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

/** Count of tasks per status for a project (scoped by project_id; RLS enforces ownership). */
export const getBoardCountsByStatus = cache(
  async (projectId: string): Promise<Record<TaskStatus, number>> => {
    await requireAuth();
    const supabase = await createClient();
    const counts = await Promise.all(
      BOARD_STATUSES.map(async (status) => {
        const { count, error } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', status);
        if (error) return { status, count: 0 };
        return { status, count: count ?? 0 };
      })
    );
    const result = {} as Record<TaskStatus, number>;
    for (const { status, count } of counts) {
      result[status] = count;
    }
    return result;
  }
);

/** Paginated tasks for one column (status). Order by order_index. */
export async function getTasksByProjectIdPaginated(
  projectId: string,
  status: TaskStatus,
  offset: number,
  limit: number
): Promise<Database['public']['Tables']['tasks']['Row'][]> {
  await requireAuth();
  const supabase = await createClient();
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', projectId)
    .eq('status', status)
    .order('order_index', { ascending: true })
    .range(from, to);
  if (error) return [];
  return (data || []) as Database['public']['Tables']['tasks']['Row'][];
}

/** Initial board data: project, counts per status, first INITIAL_TASKS_PER_COLUMN tasks per column. */
export const getBoardInitialData = cache(
  async (projectId: string): Promise<BoardInitialData | null> => {
    const { getProjectById } = await import('@/app/actions/projects');
    const project = await getProjectById(projectId);
    if (!project) return null;

    const [counts, ...tasksPerStatus] = await Promise.all([
      getBoardCountsByStatus(projectId),
      ...BOARD_STATUSES.map((status) =>
        getTasksByProjectIdPaginated(
          projectId,
          status,
          0,
          INITIAL_TASKS_PER_COLUMN
        )
      ),
    ]);

    const tasksByStatus = {} as Record<
      TaskStatus,
      Database['public']['Tables']['tasks']['Row'][]
    >;
    BOARD_STATUSES.forEach((status, i) => {
      tasksByStatus[status] = tasksPerStatus[i] ?? [];
    });

    return { project, counts, tasksByStatus };
  }
);

export async function getCriticalTasks(): Promise<TaskWithProject[]> {
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
  _oldStatus?: TaskStatus,
  options?: { revalidate?: boolean }
) {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.rpc(
    'move_task_atomic' as never,
    {
      in_task_id: taskId,
      in_new_status: newStatus,
      in_new_order_index: newOrderIndex,
    } as never
  );

  if (error) {
    captureWithContext(error, {
      module: 'board',
      action: 'updateTaskOrder',
      userIntent: 'Mover tarea a otra columna o reordenar',
      expected: 'La tarea cambia de columna y el orden se persiste',
      extra: { taskId, newStatus },
    });
    return { error: error.message };
  }

  if (options?.revalidate !== false) {
    revalidatePath('/dashboard');
    revalidatePath('/context');
  }
  return { success: true };
}
