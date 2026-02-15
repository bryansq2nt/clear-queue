import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import { Database } from '@/lib/supabase/types';

type IdeaConnection = Database['public']['Tables']['idea_connections']['Row'];
type IdeaConnectionInsert =
  Database['public']['Tables']['idea_connections']['Insert'];

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
 * Create a connection between two ideas
 */
export async function createConnection(input: {
  fromIdeaId: string;
  toIdeaId: string;
  type: string;
}): Promise<IdeaConnection> {
  if (!input.fromIdeaId || input.fromIdeaId.trim().length === 0) {
    throw new Error('From idea ID is required');
  }

  if (!input.toIdeaId || input.toIdeaId.trim().length === 0) {
    throw new Error('To idea ID is required');
  }

  if (input.fromIdeaId === input.toIdeaId) {
    throw new Error('Cannot create connection from an idea to itself');
  }

  if (!input.type || input.type.trim().length === 0) {
    throw new Error('Connection type is required');
  }

  const ownerId = await getUserIdOrThrow();
  const supabase = await createClient();

  const insertData: IdeaConnectionInsert = {
    owner_id: ownerId,
    from_idea_id: input.fromIdeaId,
    to_idea_id: input.toIdeaId,
    type: input.type.trim(),
  };

  const { data, error } = await supabase
    .from('idea_connections')
    // @ts-ignore - Supabase type inference issue with generated types
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create connection: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create connection: No data returned');
  }

  return data;
}

/**
 * List all connections for the current user (RLS filters by owner_id)
 */
export async function listConnections(): Promise<IdeaConnection[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('idea_connections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list connections: ${error.message}`);
  }

  return data || [];
}

/**
 * Delete a connection
 */
export async function deleteConnection(id: string): Promise<void> {
  if (!id || id.trim().length === 0) {
    throw new Error('Connection ID is required');
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('idea_connections')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete connection: ${error.message}`);
  }
}
