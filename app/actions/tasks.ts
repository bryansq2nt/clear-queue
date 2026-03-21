'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan, getGrantedActions } from '@/lib/rbac/resolver';
import { getReadScope } from '@/lib/rbac/read-scope';
import { getCanUseModuleMemberContent } from '@/app/actions/modules';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import {
  canAssignTasksToOtherMembers,
  isTeamManagerTaskAssignmentRole,
  type TaskAssignmentRoleName,
} from '@/lib/rbac/task-assignment';
import {
  BOARD_STATUSES,
  INITIAL_TASKS_PER_COLUMN,
  type TaskStatus,
  type TaskReadScope,
  type BoardInitialData,
} from '@/lib/board';

type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type TaskWithProject = Database['public']['Tables']['tasks']['Row'] & {
  projects: { id: string; name: string; color: string | null } | null;
};

type TaskActivityAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'assigned'
  | 'unassigned'
  | 'deleted';

type TaskAssigneeOption = { user_id: string; display_name: string };
type TaskAssignmentAccess = {
  roleName: TaskAssignmentRoleName;
  canAssignOthers: boolean;
  assignableUserIds: Set<string>;
};

/** Fire-and-forget audit log write. Never throws; captures errors via Sentry. */
async function logTaskActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  projectId: string,
  userId: string,
  action: TaskActivityAction,
  changedFields?: Record<string, unknown>
): Promise<void> {
  const { error } = await (supabase as any).from('task_activity_log').insert({
    task_id: taskId,
    project_id: projectId,
    user_id: userId,
    action,
    changed_fields: changedFields ?? null,
  });
  if (error) {
    captureWithContext(error, {
      module: 'tasks',
      action: 'logTaskActivity',
      userIntent: 'Audit: log task activity event',
      expected: 'Row inserted into task_activity_log',
      extra: { taskId, action },
    });
  }
}

const getTaskAssignmentRoleName = cache(
  async (
    projectId: string,
    userId: string
  ): Promise<TaskAssignmentRoleName> => {
    const supabase = await createClient();

    const [{ data: project }, { data: assignment }, { data: membership }] =
      await Promise.all([
        (supabase as any)
          .from('projects')
          .select('owner_id')
          .eq('id', projectId)
          .maybeSingle(),
        (supabase as any)
          .from('user_role_assignments')
          .select('rbac_roles!inner(name)')
          .eq('user_id', userId)
          .eq('project_id', projectId)
          .maybeSingle(),
        (supabase as any)
          .from('project_members')
          .select('id')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

    if (project?.owner_id === userId) {
      return 'owner';
    }

    const roleName = assignment?.rbac_roles?.name as
      | TaskAssignmentRoleName
      | undefined;
    if (roleName) {
      return roleName;
    }

    return membership ? 'team_member' : null;
  }
);

const getManagedTeamMemberIds = cache(
  async (projectId: string, userId: string): Promise<string[]> => {
    const supabase = await createClient();

    const { data: managedTeams } = await (supabase as any)
      .from('project_team_members')
      .select('team_id, project_teams!inner(project_id)')
      .eq('user_id', userId)
      .eq('role', 'manager')
      .eq('project_teams.project_id', projectId);

    if (!managedTeams?.length) return [userId];

    const teamIds = managedTeams.map((team: any) => team.team_id as string);
    const { data: members } = await (supabase as any)
      .from('project_team_members')
      .select('user_id, project_teams!inner(project_id)')
      .in('team_id', teamIds)
      .eq('project_teams.project_id', projectId);

    const ids = new Set<string>([userId]);
    for (const member of members ?? []) {
      ids.add(member.user_id as string);
    }
    return [...ids];
  }
);

const getTaskAssignmentAccess = cache(
  async (projectId: string, userId: string): Promise<TaskAssignmentAccess> => {
    const supabase = await createClient();
    const roleName = await getTaskAssignmentRoleName(projectId, userId);

    if (!canAssignTasksToOtherMembers(roleName)) {
      return {
        roleName,
        canAssignOthers: false,
        assignableUserIds: new Set([userId]),
      };
    }

    if (isTeamManagerTaskAssignmentRole(roleName)) {
      return {
        roleName,
        canAssignOthers: true,
        assignableUserIds: new Set(
          await getManagedTeamMemberIds(projectId, userId)
        ),
      };
    }

    const [{ data: project }, { data: members }] = await Promise.all([
      (supabase as any)
        .from('projects')
        .select('owner_id')
        .eq('id', projectId)
        .maybeSingle(),
      (supabase as any)
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId),
    ]);

    const ids = new Set<string>([userId]);
    if (project?.owner_id) ids.add(project.owner_id as string);
    for (const member of members ?? []) {
      ids.add(member.user_id as string);
    }

    return {
      roleName,
      canAssignOthers: true,
      assignableUserIds: ids,
    };
  }
);

async function validateTaskAssignmentRequest(params: {
  projectId: string;
  userId: string;
  requestedAssignedTo: string | null | undefined;
  previousAssignedTo?: string | null;
}): Promise<string | null> {
  const normalizedRequested = params.requestedAssignedTo?.trim() || null;
  const normalizedPrevious = params.previousAssignedTo?.trim() || null;

  if (normalizedRequested === normalizedPrevious) {
    return null;
  }

  if (normalizedRequested === null || normalizedRequested === params.userId) {
    return null;
  }

  const access = await getTaskAssignmentAccess(params.projectId, params.userId);
  if (!access.canAssignOthers) {
    return "You don't have permission to assign tasks to other members.";
  }

  if (!access.assignableUserIds.has(normalizedRequested)) {
    return 'You can only assign tasks to eligible members in your assignment scope.';
  }

  return null;
}

export async function createTask(formData: FormData) {
  const user = await requireAuth();
  const projectId = formData.get('project_id') as string;
  const supabaseForPerm = await createClient();

  // Use the same permission logic as getBoardPermissions (owner bypass → direct
  // grant check) so the button and the action are always consistent.
  // We intentionally skip the project_members gate here because the DB-level
  // checks in create_task_atomic (is_project_member) and the tasks INSERT RLS
  // provide defence-in-depth.
  const { data: perm } = await (supabaseForPerm as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();
  if (perm?.owner_id !== user.id) {
    const granted = await getGrantedActions(user.id, projectId, true);
    if (!granted.has('tasks.create')) {
      return {
        error: "You don't have permission to create tasks in this project.",
      };
    }
  }

  const supabase = await createClient();
  const title = formData.get('title') as string;
  const status = (formData.get('status') as TaskStatus) || 'next';
  const priority = parseInt(formData.get('priority') as string) || 3;
  const dueDate = formData.get('due_date') as string | null;
  const notes = formData.get('notes') as string | null;
  const tags = formData.get('tags') as string | null;
  const milestoneId = (formData.get('milestone_id') as string) || null;
  // Default to creator when no assignee is chosen so the task always appears
  // in the creator's own-scope view.
  const assignedTo = (formData.get('assigned_to') as string) || user.id;

  const assignmentError = await validateTaskAssignmentRequest({
    projectId,
    userId: user.id,
    requestedAssignedTo: assignedTo,
  });
  if (assignmentError) {
    return { error: assignmentError };
  }

  const { data, error } = await supabase.rpc(
    'create_task_atomic' as never,
    {
      in_project_id: projectId,
      in_title: title,
      in_status: status,
      in_priority: priority,
      in_due_date: dueDate || null,
      in_notes: notes || null,
      in_tags: tags || null,
      in_milestone_id: milestoneId || null,
      in_assigned_to: assignedTo,
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

  // Audit log — fire-and-forget
  if (data && (data as any).id) {
    void logTaskActivity(
      supabase,
      (data as any).id,
      projectId,
      user.id,
      'created'
    );
  }

  return { data };
}

export async function updateTask(id: string, formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const title = formData.get('title') as string | null;
  const projectId = formData.get('project_id') as string | null;
  const status = formData.get('status') as TaskStatus | null;
  const priority = formData.get('priority')
    ? parseInt(formData.get('priority') as string)
    : null;
  const dueDate = formData.get('due_date') as string | null;
  const notes = formData.get('notes') as string | null;
  const tags = formData.get('tags') as string | null | undefined;
  const milestoneId = formData.get('milestone_id') as string | null | undefined;
  const assignedTo = formData.get('assigned_to') as string | null | undefined;

  // Resolve projectId + created_by + assigned_to for the permission check in one query
  const taskMeta = (
    await (supabase as any)
      .from('tasks')
      .select('project_id, created_by, assigned_to')
      .eq('id', id)
      .maybeSingle()
  ).data as {
    project_id?: string;
    created_by?: string | null;
    assigned_to?: string | null;
  } | null;

  const resolvedProjectId = projectId || taskMeta?.project_id;

  if (resolvedProjectId) {
    const { data: proj } = await (supabase as any)
      .from('projects')
      .select('owner_id')
      .eq('id', resolvedProjectId)
      .maybeSingle();

    if (proj?.owner_id !== user.id) {
      const [granted, readScope] = await Promise.all([
        getGrantedActions(user.id, resolvedProjectId, true),
        getReadScope(user.id, resolvedProjectId),
      ]);
      const isCreator = taskMeta?.created_by === user.id;
      const isAssignee = taskMeta?.assigned_to === user.id;

      // Scope is role-derived (project/team/own); ownership check only needed
      // for 'own' scope (team_member can only edit tasks they created/are assigned to).
      const canEdit =
        granted.has('tasks.update') &&
        (readScope !== 'own' || isCreator || isAssignee);

      if (!canEdit) {
        return { error: "You don't have permission to edit this task." };
      }
    }
  }

  const updates: TaskUpdate & { milestone_id?: string | null } = {};
  if (title) updates.title = title;
  if (projectId) updates.project_id = projectId;
  if (status) updates.status = status;
  if (priority !== null) updates.priority = priority;
  if (dueDate !== undefined) updates.due_date = dueDate || null;
  if (notes !== undefined) updates.notes = notes || null;
  if (tags !== undefined) updates.tags = tags || null;
  if (milestoneId !== undefined) updates.milestone_id = milestoneId || null;
  if (assignedTo !== undefined)
    (updates as any).assigned_to = assignedTo || null;

  if (resolvedProjectId && assignedTo !== undefined) {
    const assignmentError = await validateTaskAssignmentRequest({
      projectId: resolvedProjectId,
      userId: user.id,
      requestedAssignedTo: assignedTo,
      previousAssignedTo: taskMeta?.assigned_to ?? null,
    });
    if (assignmentError) {
      return { error: assignmentError };
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates as never)
    .eq('id', id)
    .select(TASK_COLS)
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

  // Audit log — fire-and-forget
  if (data) {
    const taskRow = data as { id: string; project_id?: string | null };
    const prevAssignedTo = taskMeta?.assigned_to ?? null;
    const newAssignedTo =
      assignedTo !== undefined ? assignedTo || null : undefined;
    const assignmentChanged =
      newAssignedTo !== undefined && newAssignedTo !== prevAssignedTo;

    let activityAction: TaskActivityAction;
    let changedFields: Record<string, unknown> | undefined;
    if (status) {
      activityAction = 'status_changed';
      changedFields = { status };
    } else if (assignmentChanged) {
      activityAction = newAssignedTo ? 'assigned' : 'unassigned';
      changedFields = {
        assigned_to: { from: prevAssignedTo, to: newAssignedTo },
      };
    } else {
      activityAction = 'updated';
      changedFields =
        Object.keys(updates).length > 0
          ? { fields: Object.keys(updates) }
          : undefined;
    }

    void logTaskActivity(
      supabase,
      taskRow.id,
      (taskRow.project_id ?? resolvedProjectId) as string,
      user.id,
      activityAction,
      changedFields
    );
  }

  return { data };
}

export async function deleteTask(id: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: task } = await (supabase as any)
    .from('tasks')
    .select('project_id, created_by, assigned_to')
    .eq('id', id)
    .maybeSingle();
  const taskMeta = task as {
    project_id?: string;
    created_by?: string | null;
    assigned_to?: string | null;
  } | null;
  const taskProjectId = taskMeta?.project_id;
  if (taskProjectId) {
    const { data: proj } = await (supabase as any)
      .from('projects')
      .select('owner_id')
      .eq('id', taskProjectId)
      .maybeSingle();

    if (proj?.owner_id !== user.id) {
      const [granted, readScope] = await Promise.all([
        getGrantedActions(user.id, taskProjectId, true),
        getReadScope(user.id, taskProjectId),
      ]);
      const isCreator = taskMeta?.created_by === user.id;
      const isAssignee = taskMeta?.assigned_to === user.id;

      const canDelete =
        granted.has('tasks.delete') &&
        (readScope !== 'own' || isCreator || isAssignee);

      if (!canDelete) {
        return { error: "You don't have permission to delete this task." };
      }
    }
  }

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

  // Audit log — fire-and-forget
  void logTaskActivity(supabase, id, taskProjectId ?? '', user.id, 'deleted');

  return { success: true };
}

export async function deleteTasksByIds(ids: string[]) {
  const user = await requireAuth();
  const supabase = await createClient();

  if (!ids || ids.length === 0) {
    return { error: 'No task IDs provided' };
  }

  // Resolve projectId from the first task for the permission check
  const { data: firstTask } = await (supabase as any)
    .from('tasks')
    .select('project_id')
    .eq('id', ids[0])
    .maybeSingle();
  const firstTaskProjectId = (firstTask as { project_id?: string } | null)
    ?.project_id;
  if (firstTaskProjectId) {
    await requireCan(user.id, 'tasks.delete', {
      type: 'task',
      projectId: firstTaskProjectId,
    });
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
  'id, project_id, title, status, priority, due_date, notes, tags, order_index, milestone_id, assigned_to, created_by, created_at, updated_at';
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

/** Count of tasks per status for a project, respecting the user's read scope. */
export const getBoardCountsByStatus = cache(
  async (projectId: string): Promise<Record<TaskStatus, number>> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const { readScope } = await getBoardPermissions(projectId);

    let colleagueIds: string[] = [];
    if (readScope === 'team') {
      colleagueIds = await getTeamColleagueIds(projectId, user.id);
    }

    const counts = await Promise.all(
      BOARD_STATUSES.map(async (status) => {
        let q = supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('status', status);
        if (readScope === 'own') {
          q = (q as any).eq('assigned_to', user.id);
        } else if (readScope === 'team') {
          q = (q as any).in('assigned_to', colleagueIds);
        }
        const { count, error } = await q;
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

/** Paginated tasks for one column (status), respecting the user's read scope. */
export async function getTasksByProjectIdPaginated(
  projectId: string,
  status: TaskStatus,
  offset: number,
  limit: number
): Promise<Database['public']['Tables']['tasks']['Row'][]> {
  const user = await requireAuth();
  const supabase = await createClient();
  const { readScope } = await getBoardPermissions(projectId);

  let q = supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', projectId)
    .eq('status', status);

  if (readScope === 'own') {
    q = (q as any).eq('assigned_to', user.id);
  } else if (readScope === 'team') {
    const colleagueIds = await getTeamColleagueIds(projectId, user.id);
    q = (q as any).in('assigned_to', colleagueIds);
  }

  const { data, error } = await q
    .order('order_index', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return (data || []) as Database['public']['Tables']['tasks']['Row'][];
}

/** Initial board data: project, counts per status, first INITIAL_TASKS_PER_COLUMN tasks per column. */
export const getBoardInitialData = cache(
  async (projectId: string): Promise<BoardInitialData | null> => {
    const { getProjectById } = await import('@/app/actions/projects');
    const project = await getProjectById(projectId);
    if (!project) return null;

    const { readScope } = await getBoardPermissions(projectId);

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

    return { project, counts, tasksByStatus, readScope };
  }
);

export async function getCriticalTasks(): Promise<TaskWithProject[]> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `
      id, project_id, title, status, priority, due_date, notes, tags, order_index, created_at, updated_at,
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
      id, project_id, title, status, priority, due_date, notes, tags, order_index, created_at, updated_at,
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
      id, project_id, title, status, priority, due_date, notes, tags, order_index, created_at, updated_at,
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
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: task } = await (supabase as any)
    .from('tasks')
    .select('project_id')
    .eq('id', taskId)
    .maybeSingle();
  const taskProjectId2 = (task as { project_id?: string } | null)?.project_id;
  if (taskProjectId2) {
    await requireCan(user.id, 'tasks.update', {
      type: 'task',
      projectId: taskProjectId2,
    });
  }

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

  // Audit log — fire-and-forget
  if (taskProjectId2) {
    void logTaskActivity(
      supabase,
      taskId,
      taskProjectId2,
      user.id,
      'status_changed',
      { to: newStatus }
    );
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Board UI permissions
// ---------------------------------------------------------------------------

export type BoardPermissions = {
  canCreate: boolean;
  /** Whether the user can assign tasks to other members. */
  canAssign: boolean;
  /** Determines which tasks the user can see. */
  readScope: TaskReadScope;
};

/**
 * Returns the user IDs of all members who share a sub-team with the given user
 * in the project (includes the user themselves). Returns [userId] if the user
 * is not in any sub-team.
 */
const getTeamColleagueIds = cache(
  async (projectId: string, userId: string): Promise<string[]> => {
    const supabase = await createClient();

    const { data: myTeams } = await (supabase as any)
      .from('project_team_members')
      .select('team_id, project_teams!inner(project_id)')
      .eq('user_id', userId)
      .eq('project_teams.project_id', projectId);

    if (!myTeams?.length) return [userId];

    const teamIds = myTeams.map((m: any) => m.team_id as string);

    const { data: colleagues } = await (supabase as any)
      .from('project_team_members')
      .select('user_id')
      .in('team_id', teamIds);

    const ids = new Set<string>([userId]);
    for (const c of colleagues ?? []) ids.add(c.user_id as string);
    return [...ids];
  }
);

/**
 * Returns RBAC-gated board permissions for the current user.
 * Project owners always get all permissions at project scope.
 * Cached per projectId within a request.
 */
export const getBoardPermissions = cache(
  async (projectId: string): Promise<BoardPermissions> => {
    const user = await requireAuth();

    const allFalse: BoardPermissions = {
      canCreate: false,
      canAssign: false,
      readScope: 'own',
    };
    if (!projectId?.trim()) return allFalse;

    const [granted, readScope, memberUse] = await Promise.all([
      getGrantedActions(user.id, projectId, true),
      getReadScope(user.id, projectId),
      getCanUseModuleMemberContent(projectId, 'board'),
    ]);
    const assignmentAccess = await getTaskAssignmentAccess(projectId, user.id);

    return {
      canCreate:
        assignmentAccess.roleName === 'owner' ||
        granted.has('tasks.create') ||
        memberUse,
      canAssign: assignmentAccess.canAssignOthers,
      readScope: readScope as TaskReadScope,
    };
  }
);

export const listTaskAssignableMembers = cache(
  async (projectId: string): Promise<TaskAssigneeOption[]> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const access = await getTaskAssignmentAccess(projectId, user.id);

    if (!access.canAssignOthers) {
      return [];
    }

    const { data, error } = await supabase.rpc(
      'get_project_members_with_profile' as never,
      { p_project_id: projectId } as never
    );

    if (error) {
      captureWithContext(error, {
        module: 'tasks',
        action: 'listTaskAssignableMembers',
        userIntent: 'Load eligible assignee options for the board',
        expected: 'Eligible project members returned for assignee selectors',
        extra: { projectId },
      });
      return [];
    }

    return ((data || []) as TaskAssigneeOption[]).filter((member) =>
      access.assignableUserIds.has(member.user_id)
    );
  }
);

// ---------------------------------------------------------------------------
// updateTaskStatus — status-only update for task assignees.
//
// Who can call this:
//   • Project owner → always allowed.
//   • Broader-scope roles (readScope != 'own') → allowed for any project task.
//   • team_member (readScope 'own') → only for tasks they created or are
//     assigned to.
//
// An optional status note is written to task_activity_log so the team
// manager / owner can see the context behind the status change.
// ---------------------------------------------------------------------------

export async function updateTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
  statusNote?: string
): Promise<{
  data?: Database['public']['Tables']['tasks']['Row'];
  error?: string;
}> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: taskMeta } = await (supabase as any)
    .from('tasks')
    .select('project_id, created_by, assigned_to')
    .eq('id', taskId)
    .maybeSingle();

  if (!taskMeta) return { error: 'Task not found' };

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', taskMeta.project_id)
    .maybeSingle();

  if (project?.owner_id !== user.id) {
    const [granted, readScope] = await Promise.all([
      getGrantedActions(user.id, taskMeta.project_id, true),
      getReadScope(user.id, taskMeta.project_id),
    ]);

    const isCreator = taskMeta.created_by === user.id;
    const isAssignee = taskMeta.assigned_to === user.id;

    const canEdit =
      granted.has('tasks.update') &&
      (readScope !== 'own' || isCreator || isAssignee);

    if (!canEdit) {
      return {
        error: "You don't have permission to update this task's status.",
      };
    }
  }

  const { data, error } = await (supabase as any)
    .from('tasks')
    .update({ status: newStatus })
    .eq('id', taskId)
    .select(TASK_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'tasks',
      action: 'updateTaskStatus',
      userIntent: 'Update task status with optional note',
      expected: 'Task status field updated, activity log entry created',
      extra: { taskId, newStatus },
    });
    return { error: error.message ?? 'Failed to update status' };
  }

  // Fire-and-forget activity log — includes the optional human note.
  await logTaskActivity(
    supabase,
    taskId,
    taskMeta.project_id,
    user.id,
    'status_changed',
    { status: newStatus, status_note: statusNote?.trim() || null }
  );

  revalidatePath(`/context/${taskMeta.project_id}`);
  revalidatePath(`/context/${taskMeta.project_id}/board`);

  return {
    data: data as Database['public']['Tables']['tasks']['Row'],
  };
}
