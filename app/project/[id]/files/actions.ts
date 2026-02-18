'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/lib/supabase/types';

import {
  DOCUMENT_HUB_ALLOWED_MIME_TYPES,
  DOCUMENT_HUB_BUCKET,
  DOCUMENT_HUB_CATEGORIES,
  DOCUMENT_HUB_MAX_SIZE_BYTES,
  FILES_VAULT_MAX_TAG_LENGTH,
  FILES_VAULT_MAX_TAGS,
  FILES_VAULT_MAX_TITLE_LENGTH,
  MEDIA_VAULT_ALLOWED_MIME_TYPES,
  MEDIA_VAULT_BUCKET,
  MEDIA_VAULT_CATEGORIES,
  MEDIA_VAULT_MAX_SIZE_BYTES,
  TEMP_LINK_TTL_SECONDS,
} from './config';

type ProjectFileRow = Database['public']['Tables']['project_files']['Row'];
type ProjectFileInsert =
  Database['public']['Tables']['project_files']['Insert'];
type MediaCategory = Database['public']['Enums']['project_media_category_enum'];
type DocumentCategory =
  Database['public']['Enums']['project_document_category_enum'];

const MEDIA_ALLOWED_MIME: Set<string> = new Set(MEDIA_VAULT_ALLOWED_MIME_TYPES);
const DOC_ALLOWED_MIME: Set<string> = new Set(DOCUMENT_HUB_ALLOWED_MIME_TYPES);
const MEDIA_CATEGORY_VALUES: MediaCategory[] = MEDIA_VAULT_CATEGORIES;
const DOCUMENT_CATEGORY_VALUES: DocumentCategory[] = DOCUMENT_HUB_CATEGORIES;

const FILES_COLS =
  'id, project_id, owner_id, linked_task_id, kind, media_category, document_category, title, description, bucket, path, mime_type, file_ext, size_bytes, checksum_sha256, width, height, duration_seconds, page_count, source_label, source_url, tags, sort_order, is_final, archived_at, created_at, updated_at';

export type MediaListItem = {
  id: string;
  project_id: string;
  title: string;
  media_category: MediaCategory;
  tags: string[];
  mime_type: string;
  size_bytes: number;
  created_at: string;
  archived_at: string | null;
  signed_url: string | null;
  is_final: boolean;
};

export type DocumentListItem = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  document_category: DocumentCategory;
  tags: string[];
  mime_type: string;
  size_bytes: number;
  created_at: string;
  archived_at: string | null;
  signed_url: string | null;
  is_final: boolean;
};

function normalizeTitle(input: string, fallback: string): string {
  const cleaned = (input || '').trim().replace(/\s+/g, ' ');
  const value = cleaned.length > 0 ? cleaned : fallback;
  return value.slice(0, FILES_VAULT_MAX_TITLE_LENGTH);
}

function filenameToTitle(filename: string, fallback = 'Untitled file'): string {
  const noExt = filename.replace(/\.[^.]+$/, '');
  const cleaned = noExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalizeTitle(cleaned, fallback);
}

function normalizeTags(input: string[] | string | null | undefined): string[] {
  const list = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];

  const normalized = Array.from(
    new Set(
      list
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .map((tag) => tag.slice(0, FILES_VAULT_MAX_TAG_LENGTH))
    )
  );

  return normalized.slice(0, FILES_VAULT_MAX_TAGS);
}

function getFileExt(file: File): string | null {
  const byName = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase() || null
    : null;

  if (byName) return byName;

  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };

  return byMime[file.type] || null;
}

async function ensureOwnedProject(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false as const, error: 'Project not found or unauthorized' };
  }

  return { ok: true as const };
}

async function signRows(
  bucket: string,
  rows: ProjectFileRow[]
): Promise<Map<string, string | null>> {
  const signedUrlMap = new Map<string, string | null>();
  if (rows.length === 0) return signedUrlMap;

  const supabase = await createClient();
  const { data: signed, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(
      rows.map((row) => row.path),
      TEMP_LINK_TTL_SECONDS
    );

  if (error || !signed) return signedUrlMap;

  signed
    .filter((entry) => typeof entry.path === 'string' && entry.path.length > 0)
    .forEach((entry) => {
      signedUrlMap.set(entry.path as string, entry.signedUrl ?? null);
    });

  return signedUrlMap;
}

function pathForUpload(userId: string, projectId: string, ext: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${userId}/${projectId}/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;
}

function toMediaListItem(
  row: ProjectFileRow,
  signedUrlMap: Map<string, string | null>
): MediaListItem {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    media_category: (row.media_category || 'other') as MediaCategory,
    tags: row.tags || [],
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    archived_at: row.archived_at,
    signed_url: signedUrlMap.get(row.path) ?? null,
    is_final: row.is_final,
  };
}

function toDocumentListItem(
  row: ProjectFileRow,
  signedUrlMap: Map<string, string | null>
): DocumentListItem {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    document_category: (row.document_category || 'other') as DocumentCategory,
    tags: row.tags || [],
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
    archived_at: row.archived_at,
    signed_url: signedUrlMap.get(row.path) ?? null,
    is_final: row.is_final,
  };
}

export async function listProjectMediaAction(input: {
  projectId: string;
  search?: string;
  category?: MediaCategory | 'all';
  tag?: string;
  includeArchived?: boolean;
}): Promise<
  { ok: true; data: MediaListItem[] } | { ok: false; error: string }
> {
  const user = await requireAuth();
  const projectId = input.projectId?.trim();

  if (!projectId) return { ok: false, error: 'Project ID is required' };
  const ownership = await ensureOwnedProject(projectId, user.id);
  if (!ownership.ok) return ownership;

  const supabase = await createClient();

  let query = supabase
    .from('project_files')
    .select(FILES_COLS)
    .eq('project_id', projectId)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!input.includeArchived) query = query.is('archived_at', null);

  const search = input.search?.trim();
  if (search) query = query.ilike('title', `%${search}%`);

  if (input.category && input.category !== 'all') {
    query = query.eq('media_category', input.category);
  }

  const tag = input.tag?.trim().toLowerCase();
  if (tag) query = query.contains('tags', [tag]);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data || []) as ProjectFileRow[];
  const signedUrlMap = await signRows(MEDIA_VAULT_BUCKET, rows);

  return {
    ok: true,
    data: rows.map((row) => toMediaListItem(row, signedUrlMap)),
  };
}

export async function listProjectDocumentsAction(input: {
  projectId: string;
  search?: string;
  category?: DocumentCategory | 'all';
  tag?: string;
  includeArchived?: boolean;
}): Promise<
  { ok: true; data: DocumentListItem[] } | { ok: false; error: string }
> {
  const user = await requireAuth();
  const projectId = input.projectId?.trim();

  if (!projectId) return { ok: false, error: 'Project ID is required' };
  const ownership = await ensureOwnedProject(projectId, user.id);
  if (!ownership.ok) return ownership;

  const supabase = await createClient();

  let query = supabase
    .from('project_files')
    .select(FILES_COLS)
    .eq('project_id', projectId)
    .eq('owner_id', user.id)
    .eq('kind', 'document')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!input.includeArchived) query = query.is('archived_at', null);

  const search = input.search?.trim();
  if (search) query = query.ilike('title', `%${search}%`);

  if (input.category && input.category !== 'all') {
    query = query.eq('document_category', input.category);
  }

  const tag = input.tag?.trim().toLowerCase();
  if (tag) query = query.contains('tags', [tag]);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data || []) as ProjectFileRow[];
  const signedUrlMap = await signRows(DOCUMENT_HUB_BUCKET, rows);

  return {
    ok: true,
    data: rows.map((row) => toDocumentListItem(row, signedUrlMap)),
  };
}

export async function uploadProjectMediaAction(input: {
  projectId: string;
  file: File;
  category: MediaCategory;
  title?: string;
  tags?: string[] | string;
  description?: string;
}): Promise<{ ok: true; data: MediaListItem } | { ok: false; error: string }> {
  const user = await requireAuth();
  const projectId = input.projectId?.trim();

  if (!projectId) return { ok: false, error: 'Project ID is required' };
  const ownership = await ensureOwnedProject(projectId, user.id);
  if (!ownership.ok) return ownership;

  if (!input.file) return { ok: false, error: 'File is required' };
  if (!MEDIA_ALLOWED_MIME.has(input.file.type)) {
    return { ok: false, error: 'Only JPEG, PNG, and WEBP are allowed' };
  }
  if (input.file.size > MEDIA_VAULT_MAX_SIZE_BYTES) {
    return { ok: false, error: 'File exceeds 10MB limit' };
  }
  if (input.file.size <= 0) return { ok: false, error: 'Invalid file size' };

  if (!MEDIA_CATEGORY_VALUES.includes(input.category)) {
    return { ok: false, error: 'Invalid media category' };
  }

  const tags = normalizeTags(input.tags);
  const fallbackTitle = filenameToTitle(input.file.name || 'untitled-media');
  const title = normalizeTitle(input.title || '', fallbackTitle);
  const ext = getFileExt(input.file) || 'bin';
  const path = pathForUpload(user.id, projectId, ext);

  const supabase = await createClient();
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(MEDIA_VAULT_BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

  if (uploadError || !uploadData?.path) {
    return { ok: false, error: uploadError?.message ?? 'Upload failed' };
  }

  const payload: ProjectFileInsert = {
    project_id: projectId,
    owner_id: user.id,
    kind: 'media',
    media_category: input.category,
    document_category: null,
    title,
    description: input.description?.trim() || null,
    bucket: MEDIA_VAULT_BUCKET,
    path: uploadData.path,
    mime_type: input.file.type,
    file_ext: ext,
    size_bytes: input.file.size,
    tags,
  };

  const { data: row, error: insertError } = await supabase
    .from('project_files')
    .insert(payload as never)
    .select(FILES_COLS)
    .single();

  if (insertError || !row) {
    await supabase.storage.from(MEDIA_VAULT_BUCKET).remove([uploadData.path]);
    return { ok: false, error: insertError?.message ?? 'Failed to save media' };
  }

  const inserted = row as ProjectFileRow;
  const signedUrlMap = await signRows(MEDIA_VAULT_BUCKET, [inserted]);

  revalidatePath(`/project/${projectId}/files`);
  revalidatePath(`/project/${projectId}`);

  return { ok: true, data: toMediaListItem(inserted, signedUrlMap) };
}

export async function uploadProjectDocumentAction(input: {
  projectId: string;
  file: File;
  category: DocumentCategory;
  title?: string;
  tags?: string[] | string;
  description?: string;
}): Promise<
  { ok: true; data: DocumentListItem } | { ok: false; error: string }
> {
  const user = await requireAuth();
  const projectId = input.projectId?.trim();

  if (!projectId) return { ok: false, error: 'Project ID is required' };
  const ownership = await ensureOwnedProject(projectId, user.id);
  if (!ownership.ok) return ownership;

  if (!input.file) return { ok: false, error: 'File is required' };
  if (!DOC_ALLOWED_MIME.has(input.file.type)) {
    return { ok: false, error: 'Unsupported document type' };
  }
  if (input.file.size > DOCUMENT_HUB_MAX_SIZE_BYTES) {
    return { ok: false, error: 'File exceeds 15MB limit' };
  }
  if (input.file.size <= 0) return { ok: false, error: 'Invalid file size' };

  if (!DOCUMENT_CATEGORY_VALUES.includes(input.category)) {
    return { ok: false, error: 'Invalid document category' };
  }

  const tags = normalizeTags(input.tags);
  const fallbackTitle = filenameToTitle(input.file.name || 'untitled-document');
  const title = normalizeTitle(input.title || '', fallbackTitle);
  const ext = getFileExt(input.file) || 'bin';
  const path = pathForUpload(user.id, projectId, ext);

  const supabase = await createClient();
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(DOCUMENT_HUB_BUCKET)
    .upload(path, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

  if (uploadError || !uploadData?.path) {
    return { ok: false, error: uploadError?.message ?? 'Upload failed' };
  }

  const payload: ProjectFileInsert = {
    project_id: projectId,
    owner_id: user.id,
    kind: 'document',
    media_category: null,
    document_category: input.category,
    title,
    description: input.description?.trim() || null,
    bucket: DOCUMENT_HUB_BUCKET,
    path: uploadData.path,
    mime_type: input.file.type,
    file_ext: ext,
    size_bytes: input.file.size,
    tags,
  };

  const { data: row, error: insertError } = await supabase
    .from('project_files')
    .insert(payload as never)
    .select(FILES_COLS)
    .single();

  if (insertError || !row) {
    await supabase.storage.from(DOCUMENT_HUB_BUCKET).remove([uploadData.path]);
    return {
      ok: false,
      error: insertError?.message ?? 'Failed to save document metadata',
    };
  }

  const inserted = row as ProjectFileRow;
  const signedUrlMap = await signRows(DOCUMENT_HUB_BUCKET, [inserted]);

  revalidatePath(`/project/${projectId}/files`);
  revalidatePath(`/project/${projectId}`);

  return { ok: true, data: toDocumentListItem(inserted, signedUrlMap) };
}

export async function getProjectMediaSignedUrlAction(input: {
  fileId: string;
  download?: boolean;
}): Promise<
  { ok: true; data: { url: string } } | { ok: false; error: string }
> {
  const user = await requireAuth();
  const fileId = input.fileId?.trim();
  if (!fileId) return { ok: false, error: 'File ID is required' };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('project_files')
    .select(FILES_COLS)
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .maybeSingle();

  if (error || !row) return { ok: false, error: 'Media file not found' };

  const media = row as ProjectFileRow;
  const ownership = await ensureOwnedProject(media.project_id, user.id);
  if (!ownership.ok) return ownership;

  const { data: signedData, error: signedError } = await supabase.storage
    .from(MEDIA_VAULT_BUCKET)
    .createSignedUrl(media.path, TEMP_LINK_TTL_SECONDS, {
      download: input.download ? media.title : false,
    });

  if (signedError || !signedData?.signedUrl) {
    return { ok: false, error: signedError?.message ?? 'Could not sign URL' };
  }

  return { ok: true, data: { url: signedData.signedUrl } };
}

export async function getSignedDocUrlAction(input: {
  fileId: string;
  download?: boolean;
}): Promise<
  { ok: true; data: { url: string } } | { ok: false; error: string }
> {
  const user = await requireAuth();
  const fileId = input.fileId?.trim();
  if (!fileId) return { ok: false, error: 'File ID is required' };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('project_files')
    .select(FILES_COLS)
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'document')
    .maybeSingle();

  if (error || !row) return { ok: false, error: 'Document not found' };

  const doc = row as ProjectFileRow;
  const ownership = await ensureOwnedProject(doc.project_id, user.id);
  if (!ownership.ok) return ownership;

  const { data: signedData, error: signedError } = await supabase.storage
    .from(DOCUMENT_HUB_BUCKET)
    .createSignedUrl(doc.path, TEMP_LINK_TTL_SECONDS, {
      download: input.download ? doc.title : false,
    });

  if (signedError || !signedData?.signedUrl) {
    return { ok: false, error: signedError?.message ?? 'Could not sign URL' };
  }

  return { ok: true, data: { url: signedData.signedUrl } };
}

export async function updateProjectMediaMetadataAction(input: {
  fileId: string;
  title: string;
  category: MediaCategory;
  tags?: string[] | string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  const fileId = input.fileId?.trim();

  if (!fileId) return { ok: false, error: 'File ID is required' };
  if (!MEDIA_CATEGORY_VALUES.includes(input.category)) {
    return { ok: false, error: 'Invalid media category' };
  }

  const title = normalizeTitle(input.title || '', 'Untitled media');
  if (!title) return { ok: false, error: 'Title is required' };

  const tags = normalizeTags(input.tags);
  const supabase = await createClient();

  const { data: existingData, error: existingError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id')
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'media')
    .maybeSingle();

  const existing = existingData as {
    id: string;
    project_id: string;
    owner_id: string;
  } | null;

  if (existingError || !existing) {
    return { ok: false, error: 'Media file not found' };
  }

  const ownership = await ensureOwnedProject(existing.project_id, user.id);
  if (!ownership.ok) return ownership;

  const { error } = await supabase
    .from('project_files')
    .update({ title, media_category: input.category, tags } as never)
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'media');

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/project/${existing.project_id}/files`);
  revalidatePath(`/project/${existing.project_id}`);
  return { ok: true };
}

export async function updateDocumentMetadataAction(input: {
  fileId: string;
  title: string;
  category: DocumentCategory;
  tags?: string[] | string;
  description?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  const fileId = input.fileId?.trim();

  if (!fileId) return { ok: false, error: 'File ID is required' };
  if (!DOCUMENT_CATEGORY_VALUES.includes(input.category)) {
    return { ok: false, error: 'Invalid document category' };
  }

  const title = normalizeTitle(input.title || '', 'Untitled document');
  if (!title) return { ok: false, error: 'Title is required' };

  const tags = normalizeTags(input.tags);
  const supabase = await createClient();

  const { data: existingData, error: existingError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id')
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'document')
    .maybeSingle();

  const existing = existingData as {
    id: string;
    project_id: string;
    owner_id: string;
  } | null;

  if (existingError || !existing) {
    return { ok: false, error: 'Document not found' };
  }

  const ownership = await ensureOwnedProject(existing.project_id, user.id);
  if (!ownership.ok) return ownership;

  const { error } = await supabase
    .from('project_files')
    .update({
      title,
      document_category: input.category,
      tags,
      description: input.description?.trim() || null,
    } as never)
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', 'document');

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/project/${existing.project_id}/files`);
  revalidatePath(`/project/${existing.project_id}`);
  return { ok: true };
}

export async function archiveProjectMediaAction(input: {
  fileId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return toggleArchiveFile(input.fileId, 'media');
}

export async function archiveProjectDocumentAction(input: {
  fileId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return toggleArchiveFile(input.fileId, 'document');
}

async function toggleArchiveFile(
  fileIdRaw: string,
  kind: 'media' | 'document'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  const fileId = fileIdRaw?.trim();
  if (!fileId) return { ok: false, error: 'File ID is required' };

  const supabase = await createClient();
  const { data: existingData, error: existingError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id, archived_at')
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', kind)
    .maybeSingle();

  const existing = existingData as {
    id: string;
    project_id: string;
    owner_id: string;
    archived_at: string | null;
  } | null;

  if (existingError || !existing) {
    return {
      ok: false,
      error: kind === 'media' ? 'Media file not found' : 'Document not found',
    };
  }

  const ownership = await ensureOwnedProject(existing.project_id, user.id);
  if (!ownership.ok) return ownership;

  const archived_at = existing.archived_at ? null : new Date().toISOString();

  const { error } = await supabase
    .from('project_files')
    .update({ archived_at } as never)
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', kind);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/project/${existing.project_id}/files`);
  revalidatePath(`/project/${existing.project_id}`);
  return { ok: true };
}

export async function deleteProjectMediaAction(input: {
  fileId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteFileByKind(input.fileId, 'media', MEDIA_VAULT_BUCKET);
}

export async function deleteProjectDocumentAction(input: {
  fileId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteFileByKind(input.fileId, 'document', DOCUMENT_HUB_BUCKET);
}

async function deleteFileByKind(
  fileIdRaw: string,
  kind: 'media' | 'document',
  bucket: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  const fileId = fileIdRaw?.trim();
  if (!fileId) return { ok: false, error: 'File ID is required' };

  const supabase = await createClient();
  const { data: existingData, error: existingError } = await supabase
    .from('project_files')
    .select('id, project_id, owner_id, path')
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', kind)
    .maybeSingle();

  const existing = existingData as {
    id: string;
    project_id: string;
    owner_id: string;
    path: string;
  } | null;

  if (existingError || !existing) {
    return {
      ok: false,
      error: kind === 'media' ? 'Media file not found' : 'Document not found',
    };
  }

  const ownership = await ensureOwnedProject(existing.project_id, user.id);
  if (!ownership.ok) return ownership;

  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove([existing.path]);

  if (storageError) return { ok: false, error: storageError.message };

  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('id', fileId)
    .eq('owner_id', user.id)
    .eq('kind', kind);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/project/${existing.project_id}/files`);
  revalidatePath(`/project/${existing.project_id}`);
  return { ok: true };
}
