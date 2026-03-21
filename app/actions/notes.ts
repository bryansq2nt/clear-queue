'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan, getGrantedActions } from '@/lib/rbac/resolver';
import {
  getReadScope,
  getScopedOwnerIds,
  isOwnerInScope,
} from '@/lib/rbac/read-scope';
import { getCanUseModuleMemberContent } from '@/app/actions/modules';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type Note = Database['public']['Tables']['notes']['Row'];
type NoteLink = Database['public']['Tables']['note_links']['Row'];

const NOTE_COLS =
  'id, owner_id, project_id, title, content, folder_id, last_opened_at, created_at, updated_at';

async function getAccessibleNote(noteId: string): Promise<Note | null> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = noteId?.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_COLS)
    .eq('id', id)
    .single();

  if (error || !data) return null;
  const row = data as Note;
  if (!(await isOwnerInScope(user.id, row.project_id, row.owner_id, 'notes'))) {
    return null;
  }
  return row;
}

export const getNotes = cache(
  async (options?: { projectId?: string }): Promise<Note[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    let query = supabase
      .from('notes')
      .select(NOTE_COLS)
      .order('updated_at', { ascending: false });

    if (options?.projectId?.trim()) {
      const pid = options.projectId.trim();
      query = query.eq('project_id', pid);

      const scope = await getReadScope(user.id, pid, 'notes');
      const scopedOwnerIds = await getScopedOwnerIds(user.id, pid, 'notes');
      if (scope === 'own') {
        query = query.eq('owner_id', user.id);
      } else if (scope === 'team') {
        query = query.in('owner_id', scopedOwnerIds ?? [user.id]);
      }
      // scope === 'project': no owner filter
    } else {
      // No project context — show only own notes
      query = query.eq('owner_id', user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching notes:', error);
      return [];
    }
    return (data as Note[]) || [];
  }
);

export async function getNoteById(noteId: string): Promise<Note | null> {
  return getAccessibleNote(noteId);
}

export async function touchNote(noteId: string): Promise<void> {
  await requireAuth();
  const supabase = await createClient();

  const note = await getAccessibleNote(noteId);
  if (!note) return;

  const updates: Database['public']['Tables']['notes']['Update'] = {
    last_opened_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('notes')
    .update(updates as never)
    .eq('id', noteId);

  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'touchNote',
      userIntent: 'Mark note as opened',
      expected: 'last_opened_at updated',
      extra: { noteId },
    });
  }
}

export async function createNote(params: {
  project_id: string;
  title: string;
  content: string;
  folder_id?: string | null;
}): Promise<{ error?: string; data?: Note }> {
  const user = await requireAuth();
  await requireCan(user.id, 'notes.create', {
    type: 'note',
    projectId: params.project_id,
  });
  const supabase = await createClient();

  const project_id = params.project_id?.trim();
  const title = params.title?.trim();
  const content = params.content?.trim();
  const folder_id =
    params.folder_id === undefined || params.folder_id === ''
      ? null
      : params.folder_id?.trim() || null;

  if (!project_id) return { error: 'Project is required' };
  if (!title) return { error: 'Title is required' };
  if (content === undefined || content === null)
    return { error: 'Content is required' };

  const insertPayload: Database['public']['Tables']['notes']['Insert'] = {
    owner_id: user.id,
    project_id,
    title,
    content: content ?? '',
    folder_id: folder_id ?? undefined,
  };

  const { data, error } = await supabase
    .from('notes')
    .insert(insertPayload as never)
    .select(
      'id, owner_id, project_id, title, content, folder_id, last_opened_at, created_at, updated_at'
    )
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'createNote',
      userIntent: 'Crear nueva nota',
      expected: 'La nota se crea y aparece en la lista',
      extra: { project_id },
    });
    return { error: error.message };
  }
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  revalidatePath(`/context/${project_id}/notes`);
  return { data: data as Note };
}

export async function updateNote(
  noteId: string,
  params: {
    title?: string;
    content?: string;
    project_id?: string;
    folder_id?: string | null;
  }
): Promise<{ error?: string; data?: Note }> {
  const user = await requireAuth();
  const supabase = await createClient();
  const noteRow = await getAccessibleNote(noteId);
  const noteProjectId = noteRow?.project_id;
  if (noteProjectId && noteRow) {
    await requireCan(user.id, 'notes.update', {
      type: 'note',
      projectId: noteProjectId,
    });
  }

  const updates: Database['public']['Tables']['notes']['Update'] = {};
  if (params.title !== undefined) updates.title = params.title.trim();
  if (params.content !== undefined) updates.content = params.content;
  if (params.project_id !== undefined)
    updates.project_id = params.project_id.trim() || undefined;
  if (params.folder_id !== undefined)
    updates.folder_id =
      params.folder_id === null || params.folder_id === ''
        ? null
        : params.folder_id?.trim() || null;

  if (Object.keys(updates).length === 0) {
    const existing = await getNoteById(noteId);
    return existing ? { data: existing } : { error: 'Note not found' };
  }

  const { data, error } = await supabase
    .from('notes')
    .update(updates as never)
    .eq('id', noteId)
    .select(NOTE_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'updateNote',
      userIntent: 'Actualizar título o contenido de la nota',
      expected: 'Los cambios se guardan',
      extra: { noteId },
    });
    return { error: error.message };
  }
  const note = data as Note;
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  revalidatePath(`/context/${note.project_id}/notes`);
  return { data: note };
}

export async function deleteNote(noteId: string): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();
  const noteRow = await getAccessibleNote(noteId);
  const noteProjectId = noteRow?.project_id;
  if (noteProjectId && noteRow) {
    await requireCan(user.id, 'notes.delete', {
      type: 'note',
      projectId: noteProjectId,
    });
  }

  const { error } = await supabase.from('notes').delete().eq('id', noteId);
  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'deleteNote',
      userIntent: 'Eliminar nota',
      expected: 'La nota se elimina',
      extra: { noteId },
    });
    return { error: error.message };
  }
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return {};
}

/**
 * Bulk-delete multiple notes owned by the authenticated user in a single
 * query.  Associated note_links are removed automatically via CASCADE.
 */
export async function deleteNotes(
  noteIds: string[]
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const validIds = noteIds.map((id) => id.trim()).filter(Boolean);
  if (validIds.length === 0) return {};

  const { data: noteRows } = await (supabase as any)
    .from('notes')
    .select('project_id, owner_id')
    .in('id', validIds);
  const noteRowsTyped =
    (noteRows as { project_id: string | null; owner_id: string }[] | null) ??
    [];
  const projectId = noteRowsTyped[0]?.project_id;
  if (projectId) {
    await requireCan(user.id, 'notes.delete', { type: 'note', projectId });
    if (noteRowsTyped.length !== validIds.length) {
      return { error: 'One or more notes were not found' };
    }
    for (const note of noteRowsTyped) {
      if (!(await isOwnerInScope(user.id, projectId, note.owner_id, 'notes'))) {
        return { error: 'One or more notes are out of scope' };
      }
    }
  }

  const { error } = await supabase.from('notes').delete().in('id', validIds);

  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'deleteNotes',
      userIntent: 'Delete multiple notes',
      expected: 'Notes and associated links permanently deleted',
      extra: { count: validIds.length },
    });
    return { error: error.message };
  }

  revalidatePath('/notes');
  revalidatePath('/context');
  return {};
}

// ---------------------------------------------------------------------------
// Note links
// ---------------------------------------------------------------------------

export async function getNoteLinks(noteId: string): Promise<NoteLink[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const note = await getAccessibleNote(noteId);
  if (!note) return [];

  const { data, error } = await supabase
    .from('note_links')
    .select('id, note_id, title, url, created_at')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data as NoteLink[]) || [];
}

export async function addNoteLink(
  noteId: string,
  params: { title?: string | null; url: string }
): Promise<{ error?: string; data?: NoteLink }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const url = params.url?.trim();
  if (!url) return { error: 'URL is required' };

  const note = await getAccessibleNote(noteId);
  if (!note) return { error: 'Note not found or access denied' };
  if (note.project_id) {
    await requireCan(user.id, 'notes.update', {
      type: 'note',
      projectId: note.project_id,
    });
  }

  const insertPayload: Database['public']['Tables']['note_links']['Insert'] = {
    note_id: noteId,
    title: params.title?.trim() || null,
    url,
  };

  const { data, error } = await supabase
    .from('note_links')
    .insert(insertPayload as never)
    .select('id, note_id, title, url, created_at')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'addNoteLink',
      userIntent: 'Añadir enlace a la nota',
      expected: 'El enlace se guarda en la nota',
      extra: { noteId },
    });
    return { error: error.message };
  }
  revalidatePath('/notes');
  revalidatePath(`/notes/${noteId}`);
  revalidatePath('/context');
  return { data: data as NoteLink };
}

export async function deleteNoteLink(
  linkId: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  // note_links has no owner_id; fetch the link to get note_id, then verify ownership.
  const { data: rawLink } = await supabase
    .from('note_links')
    .select('id, note_id, title, url, created_at')
    .eq('id', linkId)
    .maybeSingle();
  const link = rawLink as NoteLink | null;
  if (!link) return {};

  const note = await getAccessibleNote(link.note_id);
  if (!note) return { error: 'Link not found or access denied' };
  if (note.project_id) {
    await requireCan(user.id, 'notes.update', {
      type: 'note',
      projectId: note.project_id,
    });
  }

  const { error } = await supabase.from('note_links').delete().eq('id', linkId);
  if (error) {
    captureWithContext(error, {
      module: 'notes',
      action: 'deleteNoteLink',
      userIntent: 'Eliminar enlace de la nota',
      expected: 'El enlace se elimina',
      extra: { linkId },
    });
    return { error: error.message };
  }
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return {};
}

// ---------------------------------------------------------------------------
// Notes UI permissions
// ---------------------------------------------------------------------------

export type NotesPermissions = {
  canCreate: boolean;
  canDelete: boolean;
  canManageFolders: boolean;
};

export async function getNotesPermissions(
  projectId: string
): Promise<NotesPermissions> {
  const user = await requireAuth();
  const supabase = await createClient();

  const allFalse: NotesPermissions = {
    canCreate: false,
    canDelete: false,
    canManageFolders: false,
  };
  if (!projectId?.trim()) return allFalse;

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === user.id) {
    return { canCreate: true, canDelete: true, canManageFolders: true };
  }

  const [granted, memberUse] = await Promise.all([
    getGrantedActions(user.id, projectId, true),
    getCanUseModuleMemberContent(projectId, 'notes'),
  ]);
  return {
    canCreate: granted.has('notes.create') || memberUse,
    canDelete: granted.has('notes.delete') || memberUse,
    canManageFolders: granted.has('notes.update') || memberUse,
  };
}
