'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { PROJECT_CATEGORIES, type ProjectCategory } from '@/lib/constants';
import type { Database } from '@/lib/supabase/types';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

export const getProjectsForSidebar = cache(async (): Promise<ProjectRow[]> => {
  const user = await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data || []) as ProjectRow[];
});

export async function getProjectById(
  projectId: string
): Promise<ProjectRow | null> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .eq('id', projectId)
    .single();
  if (error || !data) return null;
  return data as ProjectRow;
}

export async function createProject(formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const name = formData.get('name') as string;
  const color = formData.get('color') as string | null;
  const category = (formData.get('category') as string) || 'business';

  // Validate category
  const validCategories = PROJECT_CATEGORIES.map((c) => c.key);
  if (!validCategories.includes(category as ProjectCategory)) {
    return { error: 'Invalid category' };
  }

  if (!name || name.trim().length === 0) {
    return { error: 'Project name is required' };
  }

  const client_id = (formData.get('client_id') as string)?.trim() || null;
  const business_id = (formData.get('business_id') as string)?.trim() || null;

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: name.trim(),
      color: color || null,
      category,
      owner_id: user.id,
      client_id: client_id || null,
      business_id: business_id || null,
    } as any)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { data };
}

export async function updateProject(formData: FormData) {
  await requireAuth();
  const supabase = await createClient();

  const id = formData.get('id') as string;
  const name = formData.get('name') as string | null;
  const color = formData.get('color') as string | null;
  const category = formData.get('category') as string | null;
  const notes = formData.get('notes') as string | null;
  const client_id = formData.get('client_id') as string | null;
  const business_id = formData.get('business_id') as string | null;

  if (!id) {
    return { error: 'Project ID is required' };
  }

  const updates: any = {};

  if (client_id !== undefined) {
    updates.client_id = client_id?.trim() || null;
  }
  if (business_id !== undefined) {
    updates.business_id = business_id?.trim() || null;
  }

  if (name !== null) {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return { error: 'Project name cannot be empty' };
    }
    updates.name = trimmedName;
  }

  if (color !== null) {
    updates.color = color || null;
  }

  if (category !== null) {
    // Validate category
    const validCategories = PROJECT_CATEGORIES.map((c) => c.key);
    if (!validCategories.includes(category as ProjectCategory)) {
      return { error: 'Invalid category' };
    }
    updates.category = category;
  }

  if (notes !== null) {
    updates.notes = notes || null;
  }

  const query: any = (supabase.from('projects') as any).update(updates as any);

  const result: any = await query.eq('id', id).select().single();

  const { data, error } = result;

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { data };
}

export async function archiveProject(id: string) {
  await requireAuth();
  const supabase = await createClient();

  const query: any = (supabase.from('projects') as any).update({
    category: 'archived',
  } as any);

  const result: any = await query.eq('id', id).select().single();

  const { data, error } = result;

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { data };
}

export async function unarchiveProject(id: string, previousCategory?: string) {
  await requireAuth();
  const supabase = await createClient();

  // Default to 'business' if no previous category provided
  const category = previousCategory || 'business';

  // Validate category
  const validCategories = PROJECT_CATEGORIES.map((c) => c.key);
  if (!validCategories.includes(category as ProjectCategory)) {
    return { error: 'Invalid category' };
  }

  const query: any = (supabase.from('projects') as any).update({
    category,
  } as any);

  const result: any = await query.eq('id', id).select().single();

  const { data, error } = result;

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { data };
}

export async function deleteProject(id: string) {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from('projects').delete().eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}

export type ProjectListItem = {
  id: string;
  name: string;
  category: string;
  client_id: string | null;
  client_name: string | null;
};

export async function getProjectsList(): Promise<ProjectListItem[]> {
  await requireAuth();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('projects')
    .select('id, name, category, client_id, clients(full_name)')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching projects list:', error);
    return [];
  }

  return (rows || []).map(
    (row: {
      id: string;
      name: string;
      category: string;
      client_id: string | null;
      clients: { full_name: string } | { full_name: string }[] | null;
    }) => {
      const client =
        row.clients == null
          ? null
          : Array.isArray(row.clients)
            ? row.clients[0]
            : row.clients;
      return {
        id: row.id,
        name: row.name,
        category: row.category,
        client_id: row.client_id,
        client_name: client?.full_name ?? null,
      };
    }
  );
}

export async function getFavoriteProjectIds(): Promise<{
  data?: string[];
  error?: string;
}> {
  const user = await getUser();
  if (!user) return { data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_favorites')
    .select('project_id')
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return {
    data: (data || []).map((row: { project_id: string }) => row.project_id),
  };
}

export async function addProjectFavorite(
  projectId: string
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('project_favorites')
    .insert({ user_id: user.id, project_id: projectId } as any);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/project');
  return {};
}

export async function removeProjectFavorite(
  projectId: string
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('project_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', projectId);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/project');
  return {};
}
