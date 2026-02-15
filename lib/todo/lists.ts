import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import type { Database } from '@/lib/supabase/types';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type TodoList = Database['public']['Tables']['todo_lists']['Row'];
type TodoListInsert = Database['public']['Tables']['todo_lists']['Insert'];
type TodoListUpdate = Database['public']['Tables']['todo_lists']['Update'];

type TodoItem = Database['public']['Tables']['todo_items']['Row'];
type TodoItemInsert = Database['public']['Tables']['todo_items']['Insert'];
type TodoItemUpdate = Database['public']['Tables']['todo_items']['Update'];

export type { TodoList, TodoItem };

const TODO_LIST_COLS =
  'id, owner_id, project_id, title, description, color, position, is_archived, created_at, updated_at';
const TODO_ITEM_COLS =
  'id, owner_id, list_id, content, is_done, due_date, position, created_at, updated_at';

async function getUserIdOrThrow(): Promise<string> {
  const user = await getUser();
  if (!user || !user.id) {
    throw new Error('User must be authenticated');
  }
  return user.id;
}

function fail(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

async function insertTodoList(
  values: TodoListInsert
): Promise<ActionResult<TodoList>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('todo_lists')
    .insert(values as never)
    .select(TODO_LIST_COLS)
    .single();

  if (error || !data)
    return fail(error?.message ?? 'Failed to create todo list');
  return { ok: true, data };
}

async function updateTodoListRow(
  values: TodoListUpdate,
  match: { id: string; owner_id: string }
): Promise<ActionResult<TodoList>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('todo_lists')
    .update(values as never)
    .eq('id', match.id)
    .eq('owner_id', match.owner_id)
    .select(TODO_LIST_COLS)
    .single();

  if (error || !data)
    return fail(error?.message ?? 'Failed to update todo list');
  return { ok: true, data };
}

async function insertTodoItem(
  values: TodoItemInsert
): Promise<ActionResult<TodoItem>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('todo_items')
    .insert(values as never)
    .select(TODO_ITEM_COLS)
    .single();

  if (error || !data)
    return fail(error?.message ?? 'Failed to create todo item');
  return { ok: true, data };
}

async function updateTodoItemRow(
  values: TodoItemUpdate,
  match: { id: string; owner_id: string }
): Promise<ActionResult<TodoItem>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('todo_items')
    .update(values as never)
    .eq('id', match.id)
    .eq('owner_id', match.owner_id)
    .select(TODO_ITEM_COLS)
    .single();

  if (error || !data)
    return fail(error?.message ?? 'Failed to update todo item');
  return { ok: true, data };
}

export async function getTodoLists(options?: {
  includeArchived?: boolean;
  projectId?: string | null;
}): Promise<ActionResult<TodoList[]>> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  let query = supabase
    .from('todo_lists')
    .select(TODO_LIST_COLS)
    .eq('owner_id', ownerId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (options?.includeArchived === false) {
    query = query.eq('is_archived', false);
  }

  if (options?.projectId !== undefined) {
    query =
      options.projectId === null
        ? query.is('project_id', null)
        : query.eq('project_id', options.projectId);
  }

  const { data, error } = await query;
  if (error) return fail(`Failed to fetch todo lists: ${error.message}`);
  return { ok: true, data: data || [] };
}

export async function getTodoListById(
  listId: string
): Promise<ActionResult<TodoList | null>> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('todo_lists')
    .select(TODO_LIST_COLS)
    .eq('id', listId)
    .eq('owner_id', ownerId)
    .single();

  if (error) return { ok: true, data: null };
  return { ok: true, data };
}

export async function createTodoList(input: {
  title: string;
  project_id?: string | null;
  description?: string | null;
  color?: string | null;
}): Promise<ActionResult<TodoList>> {
  if (!input.title || input.title.trim().length === 0) {
    return fail('List title is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();
  const { data: existingLists } = await supabase
    .from('todo_lists')
    .select('position')
    .eq('owner_id', ownerId)
    .order('position', { ascending: false })
    .limit(1);

  const listPositions = (existingLists || []) as Pick<TodoList, 'position'>[];
  const currentMax = listPositions[0]?.position ?? 0;
  const position =
    existingLists && existingLists.length > 0 ? currentMax + 1 : 0;

  const insertData: TodoListInsert = {
    owner_id: ownerId,
    title: input.title.trim(),
    project_id: input.project_id || null,
    description: input.description?.trim() || null,
    color: input.color || null,
    position,
  };

  return insertTodoList(insertData);
}

export async function updateTodoList(
  id: string,
  updates: {
    title?: string;
    description?: string | null;
    color?: string | null;
    project_id?: string | null;
  }
): Promise<ActionResult<TodoList>> {
  const ownerId = await getUserIdOrThrow();

  const updateData: TodoListUpdate = {};
  if (updates.title !== undefined) updateData.title = updates.title.trim();
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() || null;
  }
  if (updates.color !== undefined) updateData.color = updates.color || null;
  if (updates.project_id !== undefined) {
    updateData.project_id = updates.project_id || null;
  }

  return updateTodoListRow(updateData, { id, owner_id: ownerId });
}

export async function archiveTodoList(
  id: string,
  isArchived: boolean
): Promise<ActionResult<TodoList>> {
  const ownerId = await getUserIdOrThrow();
  return updateTodoListRow(
    { is_archived: isArchived },
    { id, owner_id: ownerId }
  );
}

export async function deleteTodoList(
  id: string
): Promise<ActionResult<{ success: true }>> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { error } = await supabase
    .from('todo_lists')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);

  if (error) return fail(`Failed to delete todo list: ${error.message}`);
  return { ok: true, data: { success: true } };
}

export async function getTodoItems(
  listId: string
): Promise<ActionResult<TodoItem[]>> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from('todo_lists')
    .select('id')
    .eq('id', listId)
    .eq('owner_id', ownerId)
    .single();

  if (!list) return fail('Todo list not found');

  const { data, error } = await supabase
    .from('todo_items')
    .select(TODO_ITEM_COLS)
    .eq('list_id', listId)
    .eq('owner_id', ownerId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return fail(`Failed to fetch todo items: ${error.message}`);
  return { ok: true, data: data || [] };
}

export async function getTodoItemsByListIds(
  listIds: string[]
): Promise<ActionResult<TodoItem[]>> {
  if (listIds.length === 0) return { ok: true, data: [] };

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('todo_items')
    .select(TODO_ITEM_COLS)
    .in('list_id', listIds)
    .eq('owner_id', ownerId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return fail(`Failed to fetch todo items: ${error.message}`);
  return { ok: true, data: data || [] };
}

export async function createTodoItem(input: {
  list_id: string;
  content: string;
  due_date?: string | null;
}): Promise<ActionResult<TodoItem>> {
  if (!input.content || input.content.trim().length === 0) {
    return fail('Item content is required');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'create_todo_item_atomic' as never,
    {
      in_list_id: input.list_id,
      in_content: input.content,
      in_due_date: input.due_date || null,
    } as never
  );

  if (error || !data)
    return fail(error?.message ?? 'Failed to create todo item');
  return { ok: true, data: data as TodoItem };
}

export async function updateTodoItem(
  id: string,
  updates: {
    content?: string;
    is_done?: boolean;
    due_date?: string | null;
  }
): Promise<ActionResult<TodoItem>> {
  const ownerId = await getUserIdOrThrow();

  const updateData: TodoItemUpdate = {};
  if (updates.content !== undefined)
    updateData.content = updates.content.trim();
  if (updates.is_done !== undefined) updateData.is_done = updates.is_done;
  if (updates.due_date !== undefined)
    updateData.due_date = updates.due_date || null;

  return updateTodoItemRow(updateData, { id, owner_id: ownerId });
}

export async function toggleTodoItem(
  id: string
): Promise<ActionResult<TodoItem>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'toggle_todo_item_atomic' as never,
    {
      in_item_id: id,
    } as never
  );

  if (error || !data)
    return fail(error?.message ?? 'Failed to toggle todo item');
  return { ok: true, data: data as TodoItem };
}

export async function deleteTodoItem(
  id: string
): Promise<ActionResult<{ success: true }>> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);

  if (error) return fail(`Failed to delete todo item: ${error.message}`);
  return { ok: true, data: { success: true } };
}
