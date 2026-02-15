import { createClient } from '@/lib/supabase/server';
import { Database } from '@/lib/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];

/**
 * List all projects for picker/selection (returns id and display name)
 */
export async function listProjectsForPicker(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }

  // @ts-ignore - Supabase type inference issue with generated types
  return (data || []).map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name || 'Unnamed Project',
  }));
}

/**
 * Get multiple projects by their IDs (efficient batch query)
 */
export async function getProjectsByIds(ids: string[]): Promise<Project[]> {
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
    .from('projects')
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .in('id', validIds);

  if (error) {
    throw new Error(`Failed to get projects by IDs: ${error.message}`);
  }

  return data || [];
}
