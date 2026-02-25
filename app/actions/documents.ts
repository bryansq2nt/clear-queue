'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { getProjectById } from '@/app/actions/projects';
import {
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_EXT_MAP,
  isValidMimeType,
  isValidDocumentCategory,
} from '@/lib/validation/project-documents';

type ProjectFile = Database['public']['Tables']['project_files']['Row'];
type ProjectFileInsert =
  Database['public']['Tables']['project_files']['Insert'];

const PROJECT_FILE_COLS =
  'id, project_id, owner_id, kind, document_category, title, description, bucket, path, mime_type, file_ext, size_bytes, tags, is_final, last_opened_at, archived_at, deleted_at, created_at, updated_at';

const BUCKET = 'project-docs';

function revalidateDocumentPaths(projectId: string) {
  revalidatePath('/context');
  revalidatePath(`/context/${projectId}`);
  revalidatePath(`/context/${projectId}/documents`);
}

/** Max "recent" docs (opened or uploaded) shown first, like project picker. */
const MAX_RECENT_DOCUMENTS = 5;

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

export const getDocuments = cache(
  async (projectId: string): Promise<ProjectFile[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const pid = projectId?.trim();
    if (!pid) return [];

    const { data, error } = await supabase
      .from('project_files')
      .select(PROJECT_FILE_COLS)
      .eq('project_id', pid)
      .eq('owner_id', user.id)
      .eq('kind', 'document')
      .is('archived_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      captureWithContext(error, {
        module: 'documents',
        action: 'getDocuments',
        userIntent: 'Cargar lista de documentos del proyecto',
        expected: 'Lista de documentos activos',
        extra: { projectId: pid },
      });
      return [];
    }

    const list = (data as ProjectFile[]) ?? [];
    if (list.length <= MAX_RECENT_DOCUMENTS) return list;

    // Recent = max 5 by (last_opened_at ?? created_at) desc; treat newly uploaded as recent.
    const byRecent = [...list].sort((a, b) => {
      const aAt = a.last_opened_at ?? a.created_at;
      const bAt = b.last_opened_at ?? b.created_at;
      return new Date(bAt).getTime() - new Date(aAt).getTime();
    });
    const recentIds = new Set(
      byRecent.slice(0, MAX_RECENT_DOCUMENTS).map((d) => d.id)
    );
    const recent = byRecent.slice(0, MAX_RECENT_DOCUMENTS);
    const rest = list
      .filter((d) => !recentIds.has(d.id))
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    return [...recent, ...rest];
  }
);

// ------------------------------------------------------------
// Mutations
// ------------------------------------------------------------

export async function uploadDocument(
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
  if (!isValidMimeType(file.type)) {
    return { success: false, error: 'File type not supported' };
  }
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    return { success: false, error: 'File exceeds 50 MB limit' };
  }

  // Extract and validate metadata
  const rawTitle = formData.get('title');
  const title =
    typeof rawTitle === 'string' && rawTitle.trim()
      ? rawTitle.trim()
      : file.name.replace(/\.[^.]+$/, '').trim();
  if (!title) return { success: false, error: 'Title is required' };

  const rawCategory = formData.get('document_category');
  const category = typeof rawCategory === 'string' ? rawCategory.trim() : '';
  if (!isValidDocumentCategory(category)) {
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
  const ext = DOCUMENT_EXT_MAP[file.type] ?? 'bin';
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
      module: 'documents',
      action: 'uploadDocument',
      userIntent: 'Subir documento al proyecto',
      expected: 'Archivo guardado en bucket',
      extra: { projectId: pid },
    });
    return { success: false, error: uploadError?.message ?? 'Upload failed' };
  }

  // Insert DB row
  const insertPayload: ProjectFileInsert = {
    project_id: pid,
    owner_id: user.id,
    kind: 'document',
    document_category: category,
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
    .select(PROJECT_FILE_COLS)
    .single();

  if (insertError) {
    // Cleanup: remove orphaned file from storage
    await supabase.storage.from(BUCKET).remove([uploadData.path]);
    captureWithContext(insertError, {
      module: 'documents',
      action: 'uploadDocument',
      userIntent: 'Guardar registro de documento en BD',
      expected: 'Fila insertada en project_files',
      extra: { projectId: pid },
    });
    return { success: false, error: insertError.message };
  }

  revalidateDocumentPaths(pid);
  return { success: true, data: data as ProjectFile };
}

export type BulkUploadError = { index: number; name: string; error: string };

export async function uploadDocumentsBulk(
  projectId: string,
  formData: FormData
): Promise<{
  success: boolean;
  data?: ProjectFile[];
  errors?: BulkUploadError[];
}> {
  const user = await requireAuth();
  const supabase = await createClient();

  const pid = projectId?.trim();
  if (!pid)
    return {
      success: false,
      errors: [{ index: 0, name: '', error: 'Project ID is required' }],
    };

  const project = await getProjectById(pid);
  if (!project)
    return {
      success: false,
      errors: [
        { index: 0, name: '', error: 'Project not found or access denied' },
      ],
    };

  const rawCategory = formData.get('document_category');
  const category = typeof rawCategory === 'string' ? rawCategory.trim() : '';
  if (!isValidDocumentCategory(category)) {
    return {
      success: false,
      errors: [{ index: 0, name: '', error: 'A valid category is required' }],
    };
  }

  const rawFiles = formData.getAll('file');
  const files = rawFiles.filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (files.length === 0) {
    return {
      success: false,
      errors: [{ index: 0, name: '', error: 'At least one file is required' }],
    };
  }

  const created: ProjectFile[] = [];
  const errors: BulkUploadError[] = [];
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const title = file.name.replace(/\.[^.]+$/, '').trim() || file.name;

    if (!isValidMimeType(file.type)) {
      errors.push({
        index: i,
        name: file.name,
        error: 'File type not supported',
      });
      continue;
    }
    if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
      errors.push({
        index: i,
        name: file.name,
        error: 'File exceeds 50 MB limit',
      });
      continue;
    }

    const ext = DOCUMENT_EXT_MAP[file.type] ?? 'bin';
    const uuid = crypto.randomUUID();
    const storagePath = `${user.id}/${pid}/${yyyy}/${mm}/${uuid}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError || !uploadData?.path) {
      errors.push({
        index: i,
        name: file.name,
        error: uploadError?.message ?? 'Upload failed',
      });
      continue;
    }

    const insertPayload: ProjectFileInsert = {
      project_id: pid,
      owner_id: user.id,
      kind: 'document',
      document_category: category,
      title,
      description: null,
      bucket: BUCKET,
      path: uploadData.path,
      mime_type: file.type,
      file_ext: ext,
      size_bytes: file.size,
      tags: [],
    };

    const { data: row, error: insertError } = await supabase
      .from('project_files')
      .insert(insertPayload as never)
      .select(PROJECT_FILE_COLS)
      .single();

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([uploadData.path]);
      captureWithContext(insertError, {
        module: 'documents',
        action: 'uploadDocumentsBulk',
        userIntent: 'Subir documentos en lote',
        expected: 'Fila insertada en project_files',
        extra: { projectId: pid, index: i, name: file.name },
      });
      errors.push({ index: i, name: file.name, error: insertError.message });
      continue;
    }

    created.push(row as ProjectFile);
  }

  if (created.length > 0) {
    revalidateDocumentPaths(pid);
  }

  return {
    success: created.length > 0,
    data: created.length > 0 ? created : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function updateDocument(
  fileId: string,
  input: {
    title?: string;
    description?: string | null;
    document_category?: string;
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
    .eq('kind', 'document')
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Document not found or access denied' };
  }

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
  if (input.document_category !== undefined) {
    if (!isValidDocumentCategory(input.document_category)) {
      return { success: false, error: 'Invalid category' };
    }
    updates.document_category = input.document_category;
  }
  if (input.tags !== undefined) {
    updates.tags = input.tags.map((t) => t.trim()).filter(Boolean);
  }

  if (Object.keys(updates).length === 0) {
    const { data: row } = await supabase
      .from('project_files')
      .select(PROJECT_FILE_COLS)
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
    .select(PROJECT_FILE_COLS)
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'documents',
      action: 'updateDocument',
      userIntent: 'Actualizar metadatos del documento',
      expected: 'Cambios guardados',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  const row = data as ProjectFile;
  revalidateDocumentPaths(row.project_id);
  return { success: true, data: row };
}

export async function archiveDocument(
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
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Document not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'documents',
      action: 'archiveDocument',
      userIntent: 'Archivar documento',
      expected: 'archived_at actualizado',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  revalidateDocumentPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function markDocumentFinal(
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
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Document not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ is_final: isFinal } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'documents',
      action: 'markDocumentFinal',
      userIntent: 'Marcar documento como final',
      expected: 'is_final actualizado',
      extra: { fileId: id, isFinal },
    });
    return { success: false, error: error.message };
  }

  revalidateDocumentPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function getDocumentSignedUrl(
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
    .single();

  if (fetchError || !row) {
    return { error: 'Document not found or access denied' };
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl((row as { path: string }).path, 3600);

  if (signedError || !signedData?.signedUrl) {
    captureWithContext(
      signedError ?? new Error('Signed URL generation failed'),
      {
        module: 'documents',
        action: 'getDocumentSignedUrl',
        userIntent: 'Abrir documento',
        expected: 'URL firmada generada',
        extra: { fileId: id },
      }
    );
    return { error: signedError?.message ?? 'Could not generate document URL' };
  }

  return { url: signedData.signedUrl };
}

export async function deleteDocument(
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
    .single();

  if (fetchError || !existing) {
    return { success: false, error: 'Document not found or access denied' };
  }

  const { error } = await supabase
    .from('project_files')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'documents',
      action: 'deleteDocument',
      userIntent: 'Eliminar documento',
      expected: 'deleted_at actualizado',
      extra: { fileId: id },
    });
    return { success: false, error: error.message };
  }

  revalidateDocumentPaths((existing as { project_id: string }).project_id);
  return { success: true };
}

export async function getDocumentDownloadUrl(
  fileId: string
): Promise<{ url?: string; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = fileId?.trim();
  if (!id) return { error: 'File ID is required' };

  const { data: row, error: fetchError } = await supabase
    .from('project_files')
    .select('id, owner_id, path, title, file_ext')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (fetchError || !row) {
    return { error: 'Document not found or access denied' };
  }

  const { title, file_ext, path } = row as {
    title: string;
    file_ext: string | null;
    path: string;
  };
  const filename = file_ext ? `${title}.${file_ext}` : title;

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, { download: filename });

  if (signedError || !signedData?.signedUrl) {
    captureWithContext(
      signedError ?? new Error('Download URL generation failed'),
      {
        module: 'documents',
        action: 'getDocumentDownloadUrl',
        userIntent: 'Descargar documento',
        expected: 'URL de descarga generada',
        extra: { fileId: id },
      }
    );
    return {
      error: signedError?.message ?? 'Could not generate download URL',
    };
  }

  return { url: signedData.signedUrl };
}

export async function touchDocument(fileId: string): Promise<void> {
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
