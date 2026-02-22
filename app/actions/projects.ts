'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, getUser } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { PROJECT_CATEGORIES, type ProjectCategory } from '@/lib/constants';
import type { Database } from '@/lib/supabase/types';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
type ProjectFavoriteInsert =
  Database['public']['Tables']['project_favorites']['Insert'];
type ProjectAccessInsert =
  Database['public']['Tables']['project_access']['Insert'];

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
  return data || [];
});

export const getProjectById = cache(
  async (projectId: string): Promise<ProjectRow | null> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
      )
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .single();
    if (error || !data) return null;
    return data;
  }
);

export async function createProject(
  formData: FormData
): Promise<ActionResult<ProjectRow>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const name = formData.get('name') as string;
  const color = formData.get('color') as string | null;
  const category = (formData.get('category') as string) || 'business';

  const validCategories = PROJECT_CATEGORIES.map((c) => c.key);
  if (!validCategories.includes(category as ProjectCategory)) {
    return { ok: false, error: 'Invalid category' };
  }

  if (!name || name.trim().length === 0) {
    return { ok: false, error: 'Project name is required' };
  }

  const client_id = (formData.get('client_id') as string)?.trim() || null;
  const business_id = (formData.get('business_id') as string)?.trim() || null;

  const insertData: ProjectInsert = {
    name: name.trim(),
    color: color || null,
    category,
    owner_id: user.id,
    client_id,
    business_id,
  };

  const { data, error } = await supabase
    .from('projects')
    .insert(insertData as never)
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    if (error) {
      captureWithContext(error, {
        module: 'projects',
        action: 'createProject',
        userIntent: 'Crear nuevo proyecto',
        expected: 'El proyecto se crea y aparece en la lista',
        extra: { category },
      });
    }
    return { ok: false, error: error?.message ?? 'Failed to create project' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/context');
  return { ok: true, data };
}

export async function updateProject(
  formData: FormData
): Promise<ActionResult<ProjectRow>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = formData.get('id') as string;
  const name = formData.get('name') as string | null;
  const color = formData.get('color') as string | null;
  const category = formData.get('category') as string | null;
  const notes = formData.get('notes') as string | null;
  const client_id = formData.get('client_id') as string | null;
  const business_id = formData.get('business_id') as string | null;

  if (!id) {
    return { ok: false, error: 'Project ID is required' };
  }

  const updates: ProjectUpdate = {};

  if (client_id !== undefined) {
    updates.client_id = client_id?.trim() || null;
  }
  if (business_id !== undefined) {
    updates.business_id = business_id?.trim() || null;
  }

  if (name !== null) {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return { ok: false, error: 'Project name cannot be empty' };
    }
    updates.name = trimmedName;
  }

  if (color !== null) {
    updates.color = color || null;
  }

  if (category !== null) {
    const validCategories = PROJECT_CATEGORIES.map((c) => c.key);
    if (!validCategories.includes(category as ProjectCategory)) {
      return { ok: false, error: 'Invalid category' };
    }
    updates.category = category;
  }

  if (notes !== null) {
    updates.notes = notes || null;
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updates as never)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    if (error) {
      captureWithContext(error, {
        module: 'projects',
        action: 'updateProject',
        userIntent: 'Actualizar nombre, color o categoría del proyecto',
        expected: 'Los cambios se guardan',
        extra: { projectId: id },
      });
    }
    return { ok: false, error: error?.message ?? 'Failed to update project' };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/context/${id}`);
  return { ok: true, data };
}

/**
 * Link a business to a project (sets project.business_id). Used after creating
 * a business from the project-owner context so the UI updates without manual DB edit.
 */
export async function linkBusinessToProject(
  projectId: string,
  businessId: string
): Promise<ActionResult<ProjectRow>> {
  const user = await requireAuth();
  if (!projectId?.trim() || !businessId?.trim()) {
    return { ok: false, error: 'Project ID and Business ID are required' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({ business_id: businessId.trim() } as never)
    .eq('id', projectId.trim())
    .eq('owner_id', user.id)
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    if (error) {
      captureWithContext(error, {
        module: 'projects',
        action: 'linkBusinessToProject',
        userIntent: 'Vincular negocio al proyecto',
        expected: 'El proyecto queda asociado al negocio',
        extra: { projectId, businessId },
      });
    }
    return {
      ok: false,
      error: error?.message ?? 'Failed to link business to project',
    };
  }
  revalidatePath('/dashboard');
  revalidatePath(`/context/${projectId}`);
  return { ok: true, data };
}

export async function archiveProject(
  id: string
): Promise<ActionResult<ProjectRow>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const updates: ProjectUpdate = { category: 'archived' };
  const { data, error } = await supabase
    .from('projects')
    .update(updates as never)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    if (error) {
      captureWithContext(error, {
        module: 'projects',
        action: 'archiveProject',
        userIntent: 'Archivar proyecto',
        expected: 'El proyecto pasa a estado archivado',
        extra: { projectId: id },
      });
    }
    return { ok: false, error: error?.message ?? 'Failed to archive project' };
  }

  revalidatePath('/dashboard');
  return { ok: true, data };
}

export async function unarchiveProject(
  id: string,
  previousCategory?: string
): Promise<ActionResult<ProjectRow>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const category = previousCategory || 'business';

  const validCategories = PROJECT_CATEGORIES.map((c) => c.key);
  if (!validCategories.includes(category as ProjectCategory)) {
    return { ok: false, error: 'Invalid category' };
  }

  const updates: ProjectUpdate = { category };
  const { data, error } = await supabase
    .from('projects')
    .update(updates as never)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select(
      'id, name, color, category, notes, owner_id, client_id, business_id, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    if (error) {
      captureWithContext(error, {
        module: 'projects',
        action: 'unarchiveProject',
        userIntent: 'Desarchivar proyecto',
        expected: 'El proyecto vuelve a la lista activa',
        extra: { projectId: id },
      });
    }
    return {
      ok: false,
      error: error?.message ?? 'Failed to unarchive project',
    };
  }

  revalidatePath('/dashboard');
  return { ok: true, data };
}

export async function deleteProject(
  id: string
): Promise<ActionResult<{ success: true }>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'projects',
      action: 'deleteProject',
      userIntent: 'Eliminar proyecto',
      expected: 'El proyecto se elimina de la lista',
      extra: { projectId: id },
    });
    return { ok: false, error: error.message };
  }

  revalidatePath('/dashboard');
  return { ok: true, data: { success: true } };
}

export type ProjectListItem = {
  id: string;
  name: string;
  category: string;
  client_id: string | null;
  client_name: string | null;
  /** When set, project was opened before (for "recently opened" UI). */
  last_accessed_at: string | null;
};

export const getProjectsList = cache(async (): Promise<ProjectListItem[]> => {
  const user = await requireAuth();
  const supabase = await createClient();

  const [projectsResult, accessResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, category, client_id, clients(full_name)')
      .eq('owner_id', user.id),
    supabase
      .from('project_access')
      .select('project_id, last_accessed_at')
      .eq('user_id', user.id),
  ]);

  if (projectsResult.error) {
    console.error('Error fetching projects list:', projectsResult.error);
    return [];
  }

  const rows = projectsResult.data || [];
  const accessMap = new Map<string, string>(
    (accessResult.data || []).map(
      (r: { project_id: string; last_accessed_at: string }) => [
        r.project_id,
        r.last_accessed_at,
      ]
    )
  );

  const list: ProjectListItem[] = rows.map(
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
        last_accessed_at: accessMap.get(row.id) ?? null,
      };
    }
  );

  list.sort((a, b) => {
    const aAt = accessMap.get(a.id);
    const bAt = accessMap.get(b.id);
    if (aAt && bAt) return bAt.localeCompare(aAt);
    if (aAt) return -1;
    if (bAt) return 1;
    return a.name.localeCompare(b.name);
  });

  return list;
});

/** Record that the current user opened this project (for "recently opened" sorting). Call when entering a project context. */
export async function recordProjectAccess(
  projectId: string
): Promise<ActionResult<null>> {
  const user = await requireAuth();
  const project = await getProjectById(projectId);
  if (!project) return { ok: true, data: null };

  const supabase = await createClient();
  const payload: ProjectAccessInsert = {
    user_id: user.id,
    project_id: projectId,
    last_accessed_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('project_access')
    .upsert(payload as never, {
      onConflict: 'user_id,project_id',
    });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/context');
  return { ok: true, data: null };
}

export const getFavoriteProjectIds = cache(
  async (): Promise<ActionResult<string[]>> => {
    const user = await getUser();
    if (!user) return { ok: true, data: [] };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('project_favorites')
      .select('project_id')
      .eq('user_id', user.id);

    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: (data || []).map((row: { project_id: string }) => row.project_id),
    };
  }
);

export async function addProjectFavorite(
  projectId: string
): Promise<ActionResult<null>> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const supabase = await createClient();
  const payload: ProjectFavoriteInsert = {
    user_id: user.id,
    project_id: projectId,
  };
  const { error } = await supabase
    .from('project_favorites')
    .insert(payload as never);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard');
  return { ok: true, data: null };
}

export async function removeProjectFavorite(
  projectId: string
): Promise<ActionResult<null>> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('project_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', projectId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard');
  return { ok: true, data: null };
}
