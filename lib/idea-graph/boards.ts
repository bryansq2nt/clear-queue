import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import { Database } from '@/lib/supabase/types';

type IdeaBoard = Database['public']['Tables']['idea_boards']['Row'];
type IdeaBoardInsert = Database['public']['Tables']['idea_boards']['Insert'];
type IdeaBoardUpdate = Database['public']['Tables']['idea_boards']['Update'];
type IdeaBoardItem = Database['public']['Tables']['idea_board_items']['Row'];
type IdeaBoardItemInsert =
  Database['public']['Tables']['idea_board_items']['Insert'];
type IdeaBoardItemUpdate =
  Database['public']['Tables']['idea_board_items']['Update'];

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
// Board Operations
// ============================================================================

/**
 * Create a new board
 */
export async function createBoard(input: {
  name: string;
  description?: string | null;
}): Promise<IdeaBoard> {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Board name is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const insertData: IdeaBoardInsert = {
    owner_id: ownerId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('idea_boards')
    // @ts-ignore - Supabase type inference issue with generated types
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create board: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create board: No data returned');
  }

  return data;
}

/**
 * List all boards for the current user (RLS filters by owner_id)
 */
export async function listBoards(): Promise<IdeaBoard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('idea_boards')
    .select(
      'id, owner_id, name, description, project_id, created_at, updated_at'
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list boards: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a board (name, description, project_id)
 */
export async function updateBoard(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    project_id?: string | null;
  }
): Promise<IdeaBoard> {
  if (!id || id.trim().length === 0) {
    throw new Error('Board ID is required');
  }

  await getUserIdOrThrow();
  const supabase = await createClient();

  const updateData: Partial<IdeaBoardUpdate> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    updateData.name = input.name.trim();
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }
  if (input.project_id !== undefined) {
    updateData.project_id = input.project_id || null;
  }

  const { data, error } = await supabase
    .from('idea_boards')
    // @ts-ignore - Supabase type inference issue with generated types
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update board: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to update board: No data returned');
  }

  return data;
}

/**
 * Get a board by ID
 */
export async function getBoardById(id: string): Promise<IdeaBoard | null> {
  if (!id || id.trim().length === 0) {
    throw new Error('Board ID is required');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('idea_boards')
    .select(
      'id, owner_id, name, description, project_id, created_at, updated_at'
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to get board: ${error.message}`);
  }

  return data;
}

/**
 * Delete a board
 */
export async function deleteBoard(id: string): Promise<void> {
  if (!id || id.trim().length === 0) {
    throw new Error('Board ID is required');
  }

  const supabase = await createClient();

  const { error } = await supabase.from('idea_boards').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete board: ${error.message}`);
  }
}

// ============================================================================
// Board Items Operations
// ============================================================================

/**
 * Add an idea to a board
 */
export async function addIdeaToBoard(input: {
  boardId: string;
  ideaId: string;
  x?: number;
  y?: number;
}): Promise<IdeaBoardItem> {
  if (!input.boardId || input.boardId.trim().length === 0) {
    throw new Error('Board ID is required');
  }

  if (!input.ideaId || input.ideaId.trim().length === 0) {
    throw new Error('Idea ID is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const insertData: IdeaBoardItemInsert = {
    owner_id: ownerId,
    board_id: input.boardId,
    idea_id: input.ideaId,
    x: input.x ?? 0,
    y: input.y ?? 0,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('idea_board_items')
    // @ts-ignore - Supabase type inference issue with generated types
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add idea to board: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to add idea to board: No data returned');
  }

  return data;
}

/**
 * Update the position of a board item
 */
export async function updateBoardItemPosition(input: {
  boardItemId: string;
  x: number;
  y: number;
}): Promise<IdeaBoardItem> {
  if (!input.boardItemId || input.boardItemId.trim().length === 0) {
    throw new Error('Board item ID is required');
  }

  if (typeof input.x !== 'number' || typeof input.y !== 'number') {
    throw new Error('X and Y coordinates must be numbers');
  }

  const supabase = await createClient();

  const updateData: IdeaBoardItemUpdate = {
    x: input.x,
    y: input.y,
    updated_at: new Date().toISOString(),
  };

  // @ts-ignore - Supabase type inference issue with generated types
  const { data, error } = await supabase
    .from('idea_board_items')
    // @ts-ignore - Supabase type inference issue with generated types
    .update(updateData)
    .eq('id', input.boardItemId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update board item position: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to update board item position: No data returned');
  }

  return data;
}

/**
 * List all items for a board
 */
export async function listBoardItems(
  boardId: string
): Promise<IdeaBoardItem[]> {
  if (!boardId || boardId.trim().length === 0) {
    throw new Error('Board ID is required');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('idea_board_items')
    .select('id, owner_id, board_id, idea_id, x, y, created_at, updated_at')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to list board items: ${error.message}`);
  }

  return data || [];
}
