'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { getProjectById } from '@/app/actions/projects';
import {
  MEDIA_MAX_SIZE_BYTES,
  MEDIA_EXT_MAP,
  MEDIA_PAGE_SIZE,
  isValidMediaMimeType,
  isValidMediaCategory,
} from '@/lib/validation/project-media';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];
type ProjectFileInsert =
  Database['public']['Tables']['project_files']['Insert'];

const MEDIA_FILE_COLS =
  'id, project_id, owner_id, kind, media_category, title, description, bucket, path, mime_type, file_ext, size_bytes, tags, is_final, last_opened_at, archived_at, deleted_at, folder_id, created_at, updated_at';

const BUCKET = 'project-media';

function revalidateMediaPaths(projectId: string) {
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/media`);
}

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

export type GetMediaOptions = {
  offset?: number;
  limit?: number;
  category?: string | null;
  favoritesOnly?: boolean;
  sortOrder?: 'asc' | 'desc';
  includeArchived?: boolean;
};

export async function getMedia(
  projectId: string,
  options: GetMediaOptions = {}
): Promise<{ items: ProjectFile[]; hasMore: boolean }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid) return { items: [], hasMore: false };

  const offset = options.offset ?? 0;
  const limit = options.limit ?? MEDIA_PAGE_SIZE;
  const ascending = options.sortOrder === 'asc';

  let query = supabase
    .from('project_files')
    .select(MEDIA_FILE_COLS)
    .eq('project_id', pid)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .is('deleted_at', null)
    .order('created_at', { ascending })
    .range(offset, offset + limit);

  if (!options.includeArchived) {
    query = query.is('archived_at', null);
  }
  if (options.category?.trim()) {
    query = query.eq('media_category', options.category.trim());
  }
  if (options.favoritesOnly) {
    query = query.eq('is_final', true);
  }

  const { data, error } = await query;

  if (error) {
    captureWithContext(error, {
      module: 'media',
      action: 'getMedia',
      userIntent: 'Cargar lista de medios del proyecto',
      expected: 'Lista de archivos de media activos',
      extra: { projectId: pid, offset, limit },
    });
    return { items: [], hasMore: false };
  }

  const list = (data as ProjectFile[]) ?? [];
  const hasMore = list.length > limit;
  return {
    items: hasMore ? list.slice(0, limit) : list,
    hasMore,
  };
}

// ------------------------------------------------------------
// Mutations
// ------------------------------------------------------------

export async function uploadMedia(
  projectId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; data?: ProjectFile }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid) return { success: false, error: 'Project ID is required' };

  // Verify project ownership
  const project = await getProjectById(pid);
  if (!project)
    return { success: false, error: 'Project not found or access denied' };

  // Extract and validate file
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'A valid file is required' };
  }
  if (!isValidMediaMimeType(file.type)) {
    return { success: false, error: 'File type not supported' };
  }
  if (file.size > MEDIA_MAX_SIZE_BYTES) {
    return { success: false, error: 'File exceeds 100 MB limit' };
  }

  // Extract and validate metadata
  const rawTitle = formData.get('title');
  const title =
    typeof rawTitle === 'string' && rawTitle.trim()
      ? rawTitle.trim()
      : file.name.replace(/\.[^.]+$/, '').trim();
  if (!title) return { success: false, error: 'Title is required' };

  const rawCategory = formData.get('media_category');
  const category = typeof rawCategory === 'string' ? rawCategory.trim() : '';
  if (!isValidMediaCategory(category)) {
    return { success: false, error: 'A valid category is required' };
  }

  const rawDescription = formData.get('description');
  const description =
    typeof rawDescription === 'string' && rawDescription.trim()
      ? rawDescription.trim()
      : null;

  const rawTags = formData.get('tags');
  const tags =
    typeof rawTags === 'string' && rawTags.trim()
      ? rawTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

  // Build server-side storage path: {owner_id}/{project_id}/{yyyy}/{mm}/{uuid}.{ext}
  const ext = MEDIA_EXT_MAP[file.type] ?? 'bin';
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const storagePath = `${user.id}/${pid}/${yyyy}/${mm}/${uuid}.${ext}`;

  // Upload to storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError || !uploadData?.path) {
    captureWithContext(uploadError ?? new Error('Upload failed'), {
      module: 'media',
      action: 'uploadMedia',
      userIntent: 'Subir archivo de media al proyecto',
      expected: 'Archivo guardado en bucket',
      extra: { projectId: pid },
    });
    return { success: false, error: uploadError?.message ?? 'Upload failed' };
  }

  // Insert DB row
  const insertPayload: ProjectFileInsert = {
    project_id: pid,
    owner_id: user.id,
    kind: 'media',
    media_category: category,
    title,
    description,
    bucket: BUCKET,
    path: uploadData.path,
    mime_type: file.type,
    file_ext: ext,
    size_bytes: file.size,
    tags,
  };

  const { data, error: insertError } = await supabase
    .from('project_files')
    .insert(insertPayload as never)
    .select(MEDIA_FILE_COLS)
    .single();

  if (insertError) {
    // Cleanup: remove orphaned file from storage
    await supabase.storage.from(BUCKET).remove([uploadData.path]);
    captureWithContext(insertError, {
      module: 'media',
      action: 'uploadMedia',
      userIntent: 'Guardar registro de media en BD',
      expected: 'Fila insertada en project_files',
      extra: { projectId: pid },
    });
    return { success: false, error: insertError.message };
  }

  revalidateMediaPaths(pid);
  return { success: true, data: data as ProjectFile };
}

export async function updateMedia(
  fileId: string,
  input: {
    title?: string;
    description?: string | null;
    media_category?: string;
    tags?: string[];
  }
): Promise<{ success: boolean; error?: string; data?: ProjectFile }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { success: false, error: 'File ID is required' };

  // Fetch row to verify ownership and kind
  const { data: existing, error: fetchError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id, kind')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Media not found or access denied' };
  }

  const projectId = (existing as { project_id: string }).project_id;

  const updates: Database['public']['Tables']['project_files']['Update'] = {};

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { success: false, error: 'Title is required' };
    updates.title = t;
  }
  if (input.description !== undefined) {
    updates.description =
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim()
        : null;
  }
  if (input.media_category !== undefined) {
    if (!isValidMediaCategory(input.media_category)) {
      return { success: false, error: 'Invalid category' };
    }
    updates.media_category = input.media_category;
  }
  if (input.tags !== undefined) {
    updates.tags = input.tags.map((t) => t.trim()).filter(Boolean);
  }

  if (Object.keys(updates).length === 0) {
    const { data: row } = await supabase
      .from('project_files')
      .select(MEDIA_FILE_COLS)
      .eq('id', id)
      .single();
    return {
      success: true,
      data: (row ?? undefined) as ProjectFile | undefined,
    };
  }

  const { data, error } = await supabase
    .from('project_files')
    .update(updates as never)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select(MEDIA_FILE_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'media',
      action: 'updateMedia',
      userIntent: 'Actualizar metadatos del archivo de media',
      expected: 'Cambios guardados',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  const row = data as ProjectFile;
  revalidateMediaPaths(projectId);
  return { success: true, data: row };
}

export async function archiveMedia(
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { success: false, error: 'File ID is required' };

  const { data: existing, error: fetchError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Media not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'media',
      action: 'archiveMedia',
      userIntent: 'Archivar archivo de media',
      expected: 'archived_at actualizado',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  revalidateMediaPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function unarchiveMedia(
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { success: false, error: 'File ID is required' };

  const { data: existing, error: fetchError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Media not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ archived_at: null } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'media',
      action: 'unarchiveMedia',
      userIntent: 'Desarchivar archivo de media',
      expected: 'archived_at en null',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  revalidateMediaPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function deleteMedia(
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { success: false, error: 'File ID is required' };

  const { data: existing, error: fetchError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id, path')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Media not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'media',
      action: 'deleteMedia',
      userIntent: 'Eliminar archivo de media',
      expected: 'deleted_at actualizado',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  // Best-effort storage delete — failure is logged but does not block soft-delete
  const storagePath = (existing as { path: string }).path;
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (storageError) {
    captureWithContext(storageError, {
      module: 'media',
      action: 'deleteMedia',
      userIntent: 'Eliminar archivo de media del bucket',
      expected: 'Archivo eliminado del bucket',
      extra: { fileId: id, path: storagePath },
    });
  }

  revalidateMediaPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function markMediaFinal(
  fileId: string,
  isFinal: boolean
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { success: false, error: 'File ID is required' };

  const { data: existing, error: fetchError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Media not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ is_final: isFinal } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'media',
      action: 'markMediaFinal',
      userIntent: 'Marcar archivo de media como final',
      expected: 'is_final actualizado',
      extra: { fileId: id, isFinal },
    });
    return { success: false, error: error.message };
  }

  revalidateMediaPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function getMediaSignedUrl(
  fileId: string
): Promise<{ url?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { error: 'File ID is required' };

  const { data: row, error: fetchError } = await supabase
    .from('project_files')
    .select('id, owner_id, bucket, path')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .single();

  if (fetchError || !row) {
    return { error: 'Media not found or access denied' };
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl((row as { path: string }).path, 3600);

  if (signedError || !signedData?.signedUrl) {
    captureWithContext(
      signedError ?? new Error('Signed URL generation failed'),
      {
        module: 'media',
        action: 'getMediaSignedUrl',
        userIntent: 'Abrir archivo de media',
        expected: 'URL firmada generada',
        extra: { fileId: id },
      }
    );
    return {
      error: signedError?.message ?? 'Could not generate media URL',
    };
  }

  return { url: signedData.signedUrl };
}

export async function touchMedia(fileId: string): Promise<void> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const id = fileId?.trim();
    if (!id) return;

    await supabase
      .from('project_files')
      .update({ last_opened_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('owner_id', user.id);
  } catch {
    // fire-and-forget: never throw
  }
}

const SHARE_LINK_EXPIRY_SEC = 7 * 24 * 3600; // 7 days

export async function createMediaShareLink(
  fileId: string
): Promise<{ url?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { error: 'File ID is required' };

  const { data: row, error: fetchError } = await supabase
    .from('project_files')
    .select('id, owner_id, path, title, description, mime_type')
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .is('deleted_at', null)
    .single();

  if (fetchError || !row) {
    return { error: 'Media not found or access denied' };
  }

  const file = row as {
    id: string;
    path: string;
    title: string;
    description: string | null;
    mime_type: string;
  };

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.path, SHARE_LINK_EXPIRY_SEC);

  if (signedError || !signedData?.signedUrl) {
    captureWithContext(
      signedError ?? new Error('Signed URL generation failed'),
      {
        module: 'media',
        action: 'createMediaShareLink',
        userIntent: 'Crear enlace de compartir',
        expected: 'URL firmada generada',
        extra: { fileId: id },
      }
    );
    return {
      error: signedError?.message ?? 'Could not generate share URL',
    };
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(
    Date.now() + SHARE_LINK_EXPIRY_SEC * 1000
  ).toISOString();

  const { error: insertError } = await supabase
    .from('media_share_tokens')
    .insert({
      file_id: file.id,
      token,
      signed_url: signedData.signedUrl,
      title: file.title || 'Media',
      description: file.description,
      mime_type: file.mime_type,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    } as never);

  if (insertError) {
    captureWithContext(insertError, {
      module: 'media',
      action: 'createMediaShareLink',
      userIntent: 'Crear enlace de compartir',
      expected: 'Token insertado',
      extra: { fileId: id },
    });
    return { error: insertError.message };
  }

  return { url: `/share/media/${token}` };
}

export async function getMediaShareByToken(token: string): Promise<{
  signed_url?: string;
  title?: string;
  description?: string | null;
  mime_type?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const t = token?.trim();
  if (!t) return { error: 'Token required' };

  // RPC get_media_share_by_token not yet in generated types (media_share_tokens migration)
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        n: string,
        p: { p_token: string }
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('get_media_share_by_token', { p_token: t });

  if (error) {
    return { error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.signed_url) {
    return { error: 'Not found or expired' };
  }

  return {
    signed_url: row.signed_url as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    mime_type: row.mime_type as string,
  };
}
