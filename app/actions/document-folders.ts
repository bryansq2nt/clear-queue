'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { getProjectById } from '@/app/actions/projects';

type DocumentFolder =
  Database['public']['Tables']['project_document_folders']['Row'];
type DocumentFolderInsert =
  Database['public']['Tables']['project_document_folders']['Insert'];

const FOLDER_COLS =
  'id, project_id, owner_id, name, sort_order, created_at, updated_at';

function revalidateDocumentPaths(projectId: string) {
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/documents`);
}

export const listFolders = cache(
  async (projectId: string): Promise<DocumentFolder[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const pid = projectId?.trim();
    if (!pid) return [];

    const { data, error } = await supabase
      .from('project_document_folders')
      .select(FOLDER_COLS)
      .eq('project_id', pid)
      .eq('owner_id', user.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      captureWithContext(error, {
        module: 'document-folders',
        action: 'listFolders',
        userIntent: 'Listar carpetas del proyecto',
        expected: 'Lista de carpetas',
        extra: { projectId: pid },
      });
      return [];
    }

    return (data as DocumentFolder[]) ?? [];
  }
);

/** Returns the folder if it exists and belongs to the project and user. */
export async function getFolderForProject(
  folderId: string,
  projectId: string
): Promise<DocumentFolder | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const fid = folderId?.trim();
  const pid = projectId?.trim();
  if (!fid || !pid) return null;

  const { data, error } = await supabase
    .from('project_document_folders')
    .select(FOLDER_COLS)
    .eq('id', fid)
    .eq('project_id', pid)
    .eq('owner_id', user.id)
    .single();

  if (error || !data) return null;
  return data as DocumentFolder;
}

export async function createFolder(
  projectId: string,
  name: string
): Promise<{ success: boolean; error?: string; data?: DocumentFolder }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid) return { success: false, error: 'Project ID is required' };

  const project = await getProjectById(pid);
  if (!project)
    return { success: false, error: 'Project not found or access denied' };

  const trimmedName = name?.trim();
  if (!trimmedName) return { success: false, error: 'Folder name is required' };

  const { data: maxOrder } = await supabase
    .from('project_document_folders')
    .select('sort_order')
    .eq('project_id', pid)
    .eq('owner_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sortOrder =
    (maxOrder as { sort_order: number } | null)?.sort_order ?? 0;
  const nextOrder = sortOrder + 1;

  const insertPayload: DocumentFolderInsert = {
    project_id: pid,
    owner_id: user.id,
    name: trimmedName,
    sort_order: nextOrder,
  };

  const { data, error } = await supabase
    .from('project_document_folders')
    .insert(insertPayload as never)
    .select(FOLDER_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'document-folders',
      action: 'createFolder',
      userIntent: 'Crear carpeta',
      expected: 'Carpeta creada',
      extra: { projectId: pid },
    });
    return { success: false, error: error.message };
  }

  revalidateDocumentPaths(pid);
  return { success: true, data: data as DocumentFolder };
}

export async function updateFolder(
  folderId: string,
  input: { name?: string; sort_order?: number }
): Promise<{ success: boolean; error?: string; data?: DocumentFolder }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const fid = folderId?.trim();
  if (!fid) return { success: false, error: 'Folder ID is required' };

  const updates: Database['public']['Tables']['project_document_folders']['Update'] =
    {};

  if (input.name !== undefined) {
    const t = input.name.trim();
    if (!t) return { success: false, error: 'Folder name is required' };
    updates.name = t;
  }
  if (input.sort_order !== undefined) {
    updates.sort_order = input.sort_order;
  }

  if (Object.keys(updates).length === 0) {
    const { data: row } = await supabase
      .from('project_document_folders')
      .select(FOLDER_COLS)
      .eq('id', fid)
      .eq('owner_id', user.id)
      .single();
    return {
      success: true,
      data: (row ?? undefined) as DocumentFolder | undefined,
    };
  }

  const { data, error } = await supabase
    .from('project_document_folders')
    .update(updates as never)
    .eq('id', fid)
    .eq('owner_id', user.id)
    .select(FOLDER_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'document-folders',
      action: 'updateFolder',
      userIntent: 'Actualizar carpeta',
      expected: 'Carpeta actualizada',
      extra: { folderId: fid },
    });
    return { success: false, error: error.message };
  }

  const row = data as DocumentFolder;
  revalidateDocumentPaths(row.project_id);
  return { success: true, data: row };
}

export async function deleteFolder(
  folderId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const fid = folderId?.trim();
  if (!fid) return { success: false, error: 'Folder ID is required' };

  const { data: existing, error: fetchError } = await supabase
    .from('project_document_folders')
    .select('id, project_id, owner_id')
    .eq('id', fid)
    .eq('owner_id', user.id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Folder not found or access denied' };
  }

  const { error } = await supabase
    .from('project_document_folders')
    .delete()
    .eq('id', fid)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'document-folders',
      action: 'deleteFolder',
      userIntent: 'Eliminar carpeta',
      expected: 'Carpeta eliminada (documentos quedan sin carpeta)',
      extra: { folderId: fid },
    });
    return { success: false, error: error.message };
  }

  revalidateDocumentPaths((existing as { project_id: string }).project_id);
  return { success: true };
}
