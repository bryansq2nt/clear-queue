import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import type { Database } from '@/lib/supabase/types';

type TodoList = Database['public']['Tables']['todo_lists']['Row'];
type TodoListInsert = Database['public']['Tables']['todo_lists']['Insert'];
type TodoListUpdate = Database['public']['Tables']['todo_lists']['Update'];

type TodoItem = Database['public']['Tables']['todo_items']['Row'];
type TodoItemInsert = Database['public']['Tables']['todo_items']['Insert'];
type TodoItemUpdate = Database['public']['Tables']['todo_items']['Update'];

// Export the Row types for use in components
export type { TodoList, TodoItem };

const TODO_LIST_COLS =
  'id, owner_id, project_id, title, description, color, position, is_archived, created_at, updated_at';
const TODO_ITEM_COLS =
  'id, owner_id, list_id, content, is_done, due_date, position, created_at, updated_at';

/**
 * Helper to get the current user ID or throw an error
 */
async function getUserIdOrThrow(): Promise<string> {
  const user = await getUser();
  if (!user || !user.id) {
    throw new Error('User must be authenticated');
  }
  return user.id;
}

// ============================================================================
// List Operations
// ============================================================================

/**
 * Get all todo lists for the current user
 */
export async function getTodoLists(options?: {
  includeArchived?: boolean;
  projectId?: string | null;
}): Promise<TodoList[]> {
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
    if (options.projectId === null) {
      query = query.is('project_id', null);
    } else {
      query = query.eq('project_id', options.projectId);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch todo lists: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a single todo list by ID
 */
export async function getTodoListById(
  listId: string
): Promise<TodoList | null> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('todo_lists')
    .select(TODO_LIST_COLS)
    .eq('id', listId)
    .eq('owner_id', ownerId)
    .single();

  if (error || !data) return null;
  return data as TodoList;
}

/**
 * Create a new todo list
 */
export async function createTodoList(input: {
  title: string;
  project_id?: string | null;
  description?: string | null;
  color?: string | null;
}): Promise<TodoList> {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error('List title is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  // Get max position to append at end
  const { data: existingLists } = await supabase
    .from('todo_lists')
    .select('position')
    .eq('owner_id', ownerId)
    .order('position', { ascending: false })
    .limit(1);

  const position =
    existingLists && existingLists.length > 0
      ? ((existingLists[0] as { position: number }).position || 0) + 1
      : 0;

  const insertData: TodoListInsert = {
    owner_id: ownerId,
    title: input.title.trim(),
    project_id: input.project_id || null,
    description: input.description?.trim() || null,
    color: input.color || null,
    position,
  };

  const { data, error } = await supabase
    .from('todo_lists')
    .insert(insertData as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create todo list: ${error.message}`);
  }

  return data;
}

/**
 * Update a todo list
 */
export async function updateTodoList(
  id: string,
  updates: {
    title?: string;
    description?: string | null;
    color?: string | null;
    project_id?: string | null;
  }
): Promise<TodoList> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const updateData: TodoListUpdate = {};
  if (updates.title !== undefined) {
    updateData.title = updates.title.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() || null;
  }
  if (updates.color !== undefined) {
    updateData.color = updates.color || null;
  }
  if (updates.project_id !== undefined) {
    updateData.project_id = updates.project_id || null;
  }

  const query: any = (supabase.from('todo_lists') as any).update(
    updateData as any
  );

  const result: any = await query
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select()
    .single();

  const { data, error } = result;

  if (error) {
    throw new Error(`Failed to update todo list: ${error.message}`);
  }

  if (!data) {
    throw new Error('Todo list not found');
  }

  return data;
}

/**
 * Archive or unarchive a todo list
 */
export async function archiveTodoList(
  id: string,
  isArchived: boolean
): Promise<TodoList> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const updateData: TodoListUpdate = {
    is_archived: isArchived,
  };

  const query: any = (supabase.from('todo_lists') as any).update(
    updateData as any
  );

  const result: any = await query
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select()
    .single();

  const { data, error } = result;

  if (error) {
    throw new Error(`Failed to archive todo list: ${error.message}`);
  }

  if (!data) {
    throw new Error('Todo list not found');
  }

  return data;
}

/**
 * Delete a todo list
 */
export async function deleteTodoList(id: string): Promise<void> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { error } = await supabase
    .from('todo_lists')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);

  if (error) {
    throw new Error(`Failed to delete todo list: ${error.message}`);
  }
}

// ============================================================================
// Item Operations
// ============================================================================

/**
 * Get all items for a todo list
 */
export async function getTodoItems(listId: string): Promise<TodoItem[]> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  // Verify list belongs to user
  const { data: list } = await supabase
    .from('todo_lists')
    .select('id')
    .eq('id', listId)
    .eq('owner_id', ownerId)
    .single();

  if (!list) {
    throw new Error('Todo list not found');
  }

  const { data, error } = await supabase
    .from('todo_items')
    .select(TODO_ITEM_COLS)
    .eq('list_id', listId)
    .eq('owner_id', ownerId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch todo items: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all items for multiple lists (e.g. all lists of a project)
 */
export async function getTodoItemsByListIds(
  listIds: string[]
): Promise<TodoItem[]> {
  if (listIds.length === 0) return [];

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('todo_items')
    .select(TODO_ITEM_COLS)
    .in('list_id', listIds)
    .eq('owner_id', ownerId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch todo items: ${error.message}`);
  }

  return data || [];
}

/**
 * Create a new todo item
 */
export async function createTodoItem(input: {
  list_id: string;
  content: string;
  due_date?: string | null;
}): Promise<TodoItem> {
  if (!input.content || input.content.trim().length === 0) {
    throw new Error('Item content is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  // Verify list belongs to user
  const { data: list } = await supabase
    .from('todo_lists')
    .select('id')
    .eq('id', input.list_id)
    .eq('owner_id', ownerId)
    .single();

  if (!list) {
    throw new Error('Todo list not found');
  }

  // Get max position to append at end
  const { data: existingItems } = await supabase
    .from('todo_items')
    .select('position')
    .eq('list_id', input.list_id)
    .order('position', { ascending: false })
    .limit(1);

  const position =
    existingItems && existingItems.length > 0
      ? ((existingItems[0] as { position: number }).position || 0) + 1
      : 0;

  const insertData: TodoItemInsert = {
    owner_id: ownerId,
    list_id: input.list_id,
    content: input.content.trim(),
    due_date: input.due_date || null,
    position,
  };

  const { data, error } = await supabase
    .from('todo_items')
    .insert(insertData as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create todo item: ${error.message}`);
  }

  return data;
}

/**
 * Update a todo item
 */
export async function updateTodoItem(
  id: string,
  updates: {
    content?: string;
    is_done?: boolean;
    due_date?: string | null;
  }
): Promise<TodoItem> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const updateData: TodoItemUpdate = {};
  if (updates.content !== undefined) {
    updateData.content = updates.content.trim();
  }
  if (updates.is_done !== undefined) {
    updateData.is_done = updates.is_done;
  }
  if (updates.due_date !== undefined) {
    updateData.due_date = updates.due_date || null;
  }

  const query: any = (supabase.from('todo_items') as any).update(
    updateData as any
  );

  const result: any = await query
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select()
    .single();

  const { data, error } = result;

  if (error) {
    throw new Error(`Failed to update todo item: ${error.message}`);
  }

  if (!data) {
    throw new Error('Todo item not found');
  }

  return data;
}

/**
 * Toggle todo item done status
 */
export async function toggleTodoItem(id: string): Promise<TodoItem> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  // Get current state
  const { data: current } = await supabase
    .from('todo_items')
    .select('is_done')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .single();

  if (!current) {
    throw new Error('Todo item not found');
  }

  const updateData: TodoItemUpdate = {
    is_done: !(current as { is_done: boolean }).is_done,
  };

  const query: any = (supabase.from('todo_items') as any).update(
    updateData as any
  );

  const result: any = await query
    .eq('id', id)
    .eq('owner_id', ownerId)
    .select()
    .single();

  const { data, error } = result;

  if (error) {
    throw new Error(`Failed to toggle todo item: ${error.message}`);
  }

  return data!;
}

/**
 * Delete a todo item
 */
export async function deleteTodoItem(id: string): Promise<void> {
  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);

  if (error) {
    throw new Error(`Failed to delete todo item: ${error.message}`);
  }
}
