import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import { Database } from '@/lib/supabase/types';

type Idea = Database['public']['Tables']['ideas']['Row'];
type IdeaInsert = Database['public']['Tables']['ideas']['Insert'];
type IdeaUpdate = Database['public']['Tables']['ideas']['Update'];

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

/**
 * Create a new idea
 */
export async function createIdea(input: {
  title: string;
  description?: string | null;
}): Promise<Idea> {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error('Idea title is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const insertData: IdeaInsert = {
    owner_id: ownerId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ideas')
    // @ts-ignore - Supabase type inference issue with generated types
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create idea: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create idea: No data returned');
  }

  return data;
}

/**
 * List all ideas for the current user (RLS filters by owner_id)
 */
export async function listIdeas(): Promise<Idea[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select('id, owner_id, title, description, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list ideas: ${error.message}`);
  }

  return data || [];
}

/**
 * Get an idea by ID
 */
export async function getIdeaById(id: string): Promise<Idea | null> {
  if (!id || id.trim().length === 0) {
    throw new Error('Idea ID is required');
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select('id, owner_id, title, description, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to get idea: ${error.message}`);
  }

  return data;
}

/**
 * Get multiple ideas by their IDs (efficient batch query)
 */
export async function getIdeasByIds(ids: string[]): Promise<Idea[]> {
  if (!ids || ids.length === 0) {
    return [];
  }

  // Filter out empty/invalid IDs
  const validIds = ids.filter((id) => id && id.trim().length > 0);

  if (validIds.length === 0) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select('id, owner_id, title, description, created_at, updated_at')
    .in('id', validIds);

  if (error) {
    throw new Error(`Failed to get ideas by IDs: ${error.message}`);
  }

  return data || [];
}

/**
 * Update an idea
 */
export async function updateIdea(
  id: string,
  input: {
    title?: string;
    description?: string | null;
  }
): Promise<Idea> {
  if (!id || id.trim().length === 0) {
    throw new Error('Idea ID is required');
  }

  const supabase = await createClient();

  const updateData: IdeaUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (input.title !== undefined) {
    if (input.title.trim().length === 0) {
      throw new Error('Idea title cannot be empty');
    }
    updateData.title = input.title.trim();
  }

  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }

  const { data, error } = await supabase
    .from('ideas')
    // @ts-ignore - Supabase type inference issue with generated types
    .update(updateData as any)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update idea: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to update idea: No data returned');
  }

  return data;
}

/**
 * Delete an idea
 */
export async function deleteIdea(id: string): Promise<void> {
  if (!id || id.trim().length === 0) {
    throw new Error('Idea ID is required');
  }

  const supabase = await createClient();

  const { error } = await supabase.from('ideas').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete idea: ${error.message}`);
  }
}
