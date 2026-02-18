import type { Database } from '@/lib/supabase/types';

export const MEDIA_VAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MEDIA_VAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MEDIA_VAULT_CATEGORIES: Database['public']['Enums']['project_media_category_enum'][] =
  ['branding', 'content', 'reference', 'screenshot', 'mockup', 'other'];

export const MEDIA_VAULT_MAX_TAGS = 8;
export const MEDIA_VAULT_MAX_TAG_LENGTH = 24;
export const MEDIA_VAULT_MAX_TITLE_LENGTH = 120;

export const MEDIA_VAULT_BUCKET = 'project-media';
