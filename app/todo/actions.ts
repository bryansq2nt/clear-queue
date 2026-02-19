'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  getTodoLists,
  getTodoListById,
  createTodoList,
  updateTodoList,
  archiveTodoList,
  deleteTodoList,
  getTodoItems,
  getTodoItemsByListIds,
  createTodoItem,
  updateTodoItem,
  toggleTodoItem,
  deleteTodoItem,
} from '@/lib/todo/lists';
import { getProjects } from '@/app/budgets/actions';
import type { TodoItem, TodoList } from '@/lib/todo/lists';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function getTodoListsAction(options?: {
  includeArchived?: boolean;
  projectId?: string | null;
}): Promise<ActionResult<TodoList[]>> {
  await requireAuth();
  return getTodoLists(options);
}

export async function createTodoListAction(
  formData: FormData
): Promise<ActionResult<TodoList>> {
  await requireAuth();

  const title = formData.get('title') as string;
  const projectId = formData.get('project_id') as string | null;
  const description = formData.get('description') as string | null;
  const color = formData.get('color') as string | null;

  if (!title || title.trim().length === 0) {
    return { ok: false, error: 'List title is required' };
  }

  const result = await createTodoList({
    title,
    project_id: projectId || null,
    description: description || null,
    color: color || null,
  });

  if (!result.ok) return result;
  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export async function renameTodoListAction(
  id: string,
  title: string
): Promise<ActionResult<TodoList>> {
  await requireAuth();

  if (!id || !title || title.trim().length === 0) {
    return { ok: false, error: 'List ID and title are required' };
  }

  const result = await updateTodoList(id, { title });
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath(`/todo/list/${id}`);
  revalidatePath('/context');
  return result;
}

export async function updateTodoListAction(
  id: string,
  updates: { title?: string; project_id?: string | null }
): Promise<ActionResult<TodoList>> {
  await requireAuth();

  if (!id) {
    return { ok: false, error: 'List ID is required' };
  }

  const result = await updateTodoList(id, updates);
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath(`/todo/list/${id}`);
  revalidatePath('/context');
  return result;
}

export async function archiveTodoListAction(
  id: string,
  isArchived: boolean
): Promise<ActionResult<TodoList>> {
  await requireAuth();

  if (!id) {
    return { ok: false, error: 'List ID is required' };
  }

  const result = await archiveTodoList(id, isArchived);
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export async function deleteTodoListAction(
  id: string
): Promise<ActionResult<{ success: true }>> {
  await requireAuth();

  if (!id) {
    return { ok: false, error: 'List ID is required' };
  }

  const result = await deleteTodoList(id);
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export async function getTodoItemsAction(
  listId: string
): Promise<ActionResult<TodoItem[]>> {
  await requireAuth();

  if (!listId) {
    return { ok: false, error: 'List ID is required' };
  }

  return getTodoItems(listId);
}

export type TodoListWithItems = {
  list: TodoList;
  items: TodoItem[];
  projectName: string | null;
};

export async function getTodoListWithItemsAction(
  listId: string
): Promise<ActionResult<TodoListWithItems>> {
  await requireAuth();

  if (!listId) {
    return { ok: false, error: 'List ID is required' };
  }

  const listResult = await getTodoListById(listId);
  if (!listResult.ok) return listResult;

  const list = listResult.data;
  if (!list) {
    return { ok: false, error: 'List not found' };
  }

  const itemsResult = await getTodoItems(listId);
  if (!itemsResult.ok) return itemsResult;

  const projects = await getProjects();
  const projectName = list.project_id
    ? (projects.find((p) => p.id === list.project_id)?.name ?? null)
    : null;

  return {
    ok: true,
    data: { list, items: itemsResult.data, projectName },
  };
}

export async function createTodoItemAction(
  formData: FormData
): Promise<ActionResult<TodoItem>> {
  await requireAuth();

  const listId = formData.get('list_id') as string;
  const content = formData.get('content') as string;
  const dueDate = formData.get('due_date') as string | null;

  if (!listId || !content || content.trim().length === 0) {
    return { ok: false, error: 'List ID and content are required' };
  }

  const result = await createTodoItem({
    list_id: listId,
    content,
    due_date: dueDate || null,
  });

  if (!result.ok) return result;
  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export async function toggleTodoItemAction(
  id: string
): Promise<ActionResult<TodoItem>> {
  await requireAuth();

  if (!id) {
    return { ok: false, error: 'Item ID is required' };
  }

  const result = await toggleTodoItem(id);
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export async function updateTodoItemAction(
  id: string,
  updates: {
    content?: string;
    due_date?: string | null;
  }
): Promise<ActionResult<TodoItem>> {
  await requireAuth();

  if (!id) {
    return { ok: false, error: 'Item ID is required' };
  }

  const result = await updateTodoItem(id, updates);
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export async function deleteTodoItemAction(
  id: string
): Promise<ActionResult<{ success: true }>> {
  await requireAuth();

  if (!id) {
    return { ok: false, error: 'Item ID is required' };
  }

  const result = await deleteTodoItem(id);
  if (!result.ok) return result;

  revalidatePath('/todo');
  revalidatePath('/context');
  return result;
}

export type ProjectTodoSummary = {
  projectId: string;
  projectName: string;
  pendingCount: number;
  previewItems: TodoItem[];
};

export async function getProjectsWithTodoSummaryAction(): Promise<
  ActionResult<ProjectTodoSummary[]>
> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_project_todo_summary' as never
  );
  if (error) {
    return { ok: false, error: error.message };
  }

  type SummaryRow = {
    project_id: string;
    project_name: string;
    pending_count: number;
    preview_items: TodoItem[] | null;
  };

  const summaries = ((data || []) as SummaryRow[]).map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    pendingCount: row.pending_count,
    previewItems: row.preview_items ?? [],
  }));

  return { ok: true, data: summaries };
}

export type ProjectTodoBoard = {
  defaultListId: string;
  projectName: string;
  items: TodoItem[];
};

export async function getProjectTodoBoardAction(
  projectId: string
): Promise<ActionResult<ProjectTodoBoard>> {
  await requireAuth();

  if (!projectId) {
    return { ok: false, error: 'Project ID is required' };
  }

  const projects = await getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return { ok: false, error: 'Project not found' };
  }

  const listsResult = await getTodoLists({ includeArchived: false, projectId });
  if (!listsResult.ok) return listsResult;

  let lists = listsResult.data;
  if (lists.length === 0) {
    const newListResult = await createTodoList({
      title: 'Tasks',
      project_id: projectId,
    });
    if (!newListResult.ok) return newListResult;

    lists = [newListResult.data];
    revalidatePath('/todo');
    revalidatePath(`/todo/project/${projectId}`);
    revalidatePath('/context');
  }

  const sortedLists = [...lists].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  const defaultListId = sortedLists[0]?.id ?? lists[0].id;
  const listIds = lists.map((l) => l.id);

  const itemsResult = await getTodoItemsByListIds(listIds);
  if (!itemsResult.ok) return itemsResult;

  return {
    ok: true,
    data: {
      defaultListId,
      projectName: project.name,
      items: itemsResult.data,
    },
  };
}
