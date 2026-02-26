'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { getProjectById } from '@/app/actions/projects';

type NoteFolder = Database['public']['Tables']['project_note_folders']['Row'];
type NoteFolderInsert =
  Database['public']['Tables']['project_note_folders']['Insert'];

const FOLDER_COLS =
  'id, project_id, owner_id, name, sort_order, created_at, updated_at';

function revalidateNotePaths(projectId: string) {
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/notes`);
}

export const listFolders = cache(
  async (projectId: string): Promise<NoteFolder[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const pid = projectId?.trim();
    if (!pid) return [];

    const { data, error } = await supabase
      .from('project_note_folders')
      .select(FOLDER_COLS)
      .eq('project_id', pid)
      .eq('owner_id', user.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      captureWithContext(error, {
        module: 'note-folders',
        action: 'listFolders',
        userIntent: 'List note folders',
        expected: 'List of folders',
        extra: { projectId: pid },
      });
      return [];
    }

    return (data as NoteFolder[]) ?? [];
  }
);

/** Returns the folder if it exists and belongs to the project and user. */
export async function getFolderForProject(
  folderId: string,
  projectId: string
): Promise<NoteFolder | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const fid = folderId?.trim();
  const pid = projectId?.trim();
  if (!fid || !pid) return null;

  const { data, error } = await supabase
    .from('project_note_folders')
    .select(FOLDER_COLS)
    .eq('id', fid)
    .eq('project_id', pid)
    .eq('owner_id', user.id)
    .single();

  if (error || !data) return null;
  return data as NoteFolder;
}

export async function createFolder(
  projectId: string,
  name: string
): Promise<{ success: boolean; error?: string; data?: NoteFolder }> {
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
    .from('project_note_folders')
    .select('sort_order')
    .eq('project_id', pid)
    .eq('owner_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sortOrder =
    (maxOrder as { sort_order: number } | null)?.sort_order ?? 0;
  const nextOrder = sortOrder + 1;

  const insertPayload: NoteFolderInsert = {
    project_id: pid,
    owner_id: user.id,
    name: trimmedName,
    sort_order: nextOrder,
  };

  const { data, error } = await supabase
    .from('project_note_folders')
    .insert(insertPayload as never)
    .select(FOLDER_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'note-folders',
      action: 'createFolder',
      userIntent: 'Create folder',
      expected: 'Folder created',
      extra: { projectId: pid },
    });
    return { success: false, error: error.message };
  }

  revalidateNotePaths(pid);
  return { success: true, data: data as NoteFolder };
}

export async function updateFolder(
  folderId: string,
  input: { name?: string; sort_order?: number }
): Promise<{ success: boolean; error?: string; data?: NoteFolder }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const fid = folderId?.trim();
  if (!fid) return { success: false, error: 'Folder ID is required' };

  const updates: Database['public']['Tables']['project_note_folders']['Update'] =
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
      .from('project_note_folders')
      .select(FOLDER_COLS)
      .eq('id', fid)
      .eq('owner_id', user.id)
      .single();
    return {
      success: true,
      data: (row ?? undefined) as NoteFolder | undefined,
    };
  }

  const { data, error } = await supabase
    .from('project_note_folders')
    .update(updates as never)
    .eq('id', fid)
    .eq('owner_id', user.id)
    .select(FOLDER_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'note-folders',
      action: 'updateFolder',
      userIntent: 'Update folder',
      expected: 'Folder updated',
      extra: { folderId: fid },
    });
    return { success: false, error: error.message };
  }

  const row = data as NoteFolder;
  revalidateNotePaths(row.project_id);
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
    .from('project_note_folders')
    .select('id, project_id, owner_id')
    .eq('id', fid)
    .eq('owner_id', user.id)
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Folder not found or access denied' };
  }

  const { error } = await supabase
    .from('project_note_folders')
    .delete()
    .eq('id', fid)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'note-folders',
      action: 'deleteFolder',
      userIntent: 'Delete folder',
      expected: 'Folder deleted (notes remain without folder)',
      extra: { folderId: fid },
    });
    return { success: false, error: error.message };
  }

  revalidateNotePaths((existing as { project_id: string }).project_id);
  return { success: true };
}

/**
 * Bulk-delete multiple folders owned by the authenticated user in a single
 * query.  Notes inside the deleted folders are NOT deleted — the DB sets their
 * folder_id to NULL (ON DELETE SET NULL).
 */
export async function deleteFolders(
  projectId: string,
  folderIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid) return { success: false, error: 'Project ID is required' };

  const validIds = folderIds.map((id) => id.trim()).filter(Boolean);
  if (validIds.length === 0) return { success: true };

  const { error } = await supabase
    .from('project_note_folders')
    .delete()
    .in('id', validIds)
    .eq('project_id', pid)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'note-folders',
      action: 'deleteFolders',
      userIntent: 'Delete multiple folders',
      expected: 'Folders deleted, notes unassigned (folder_id set to null)',
      extra: { projectId: pid, count: validIds.length },
    });
    return { success: false, error: error.message };
  }

  revalidateNotePaths(pid);
  return { success: true };
}
