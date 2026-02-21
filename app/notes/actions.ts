'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type Note = Database['public']['Tables']['notes']['Row'];
type NoteLink = Database['public']['Tables']['note_links']['Row'];

export const getNotes = cache(
  async (options?: { projectId?: string }): Promise<Note[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const noteCols =
      'id, owner_id, project_id, title, content, created_at, updated_at';
    let query = supabase
      .from('notes')
      .select(noteCols)
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });

    if (options?.projectId?.trim()) {
      query = query.eq('project_id', options.projectId.trim());
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
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notes')
    .select('id, owner_id, project_id, title, content, created_at, updated_at')
    .eq('id', noteId)
    .single();

  if (error || !data) return null;
  return data as Note;
}

export async function createNote(params: {
  project_id: string;
  title: string;
  content: string;
}): Promise<{ error?: string; data?: Note }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const project_id = params.project_id?.trim();
  const title = params.title?.trim();
  const content = params.content?.trim();

  if (!project_id) return { error: 'Project is required' };
  if (!title) return { error: 'Title is required' };
  if (content === undefined || content === null)
    return { error: 'Content is required' };

  const insertPayload: Database['public']['Tables']['notes']['Insert'] = {
    owner_id: user.id,
    project_id,
    title,
    content: content ?? '',
  };

  const { data, error } = await supabase
    .from('notes')
    .insert(insertPayload as never)
    .select('id, owner_id, project_id, title, content, created_at, updated_at')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return { data: data as Note };
}

export async function updateNote(
  noteId: string,
  params: { title?: string; content?: string; project_id?: string }
): Promise<{ error?: string; data?: Note }> {
  await requireAuth();
  const supabase = await createClient();

  const updates: Database['public']['Tables']['notes']['Update'] = {};
  if (params.title !== undefined) updates.title = params.title.trim();
  if (params.content !== undefined) updates.content = params.content;
  if (params.project_id !== undefined)
    updates.project_id = params.project_id.trim() || undefined;

  if (Object.keys(updates).length === 0) {
    const existing = await getNoteById(noteId);
    return existing ? { data: existing } : { error: 'Note not found' };
  }

  const { data, error } = await supabase
    .from('notes')
    .update(updates as never)
    .eq('id', noteId)
    .select('id, owner_id, project_id, title, content, created_at, updated_at')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return { data: data as Note };
}

export async function deleteNote(noteId: string): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from('notes').delete().eq('id', noteId);
  if (error) return { error: error.message };
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return {};
}

// ---------------------------------------------------------------------------
// Note links
// ---------------------------------------------------------------------------

export async function getNoteLinks(noteId: string): Promise<NoteLink[]> {
  await requireAuth();
  const supabase = await createClient();

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
  await requireAuth();
  const supabase = await createClient();

  const url = params.url?.trim();
  if (!url) return { error: 'URL is required' };

  const insertPayload: Database['public']['Tables']['note_links']['Insert'] = {
    note_id: noteId,
    title: params.title?.trim() || null,
    url,
  };

  const { data, error } = await supabase
    .from('note_links')
    .insert(insertPayload as never)
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath('/notes');
  revalidatePath(`/notes/${noteId}`);
  revalidatePath('/context');
  return { data: data as NoteLink };
}

export async function deleteNoteLink(
  linkId: string
): Promise<{ error?: string }> {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase.from('note_links').delete().eq('id', linkId);
  if (error) return { error: error.message };
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return {};
}
