import type { Database } from '@/lib/supabase/types';

export const MEDIA_VAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MEDIA_VAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MEDIA_VAULT_CATEGORIES: Database['public']['Enums']['project_media_category_enum'][] =
  ['branding', 'content', 'reference', 'screenshot', 'mockup', 'other'];

export const DOCUMENT_HUB_MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
export const DOCUMENT_HUB_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const DOCUMENT_HUB_CATEGORIES: Database['public']['Enums']['project_document_category_enum'][] =
  [
    'brief',
    'contract',
    'invoice',
    'proposal',
    'report',
    'spreadsheet',
    'notes',
    'other',
  ];

export const FILES_VAULT_MAX_TAGS = 8;
export const FILES_VAULT_MAX_TAG_LENGTH = 24;
export const FILES_VAULT_MAX_TITLE_LENGTH = 120;

export const LINK_VAULT_TYPES: Database['public']['Enums']['project_link_type_enum'][] =
  ['environment', 'tool', 'resource', 'social', 'reference', 'other'];

export const LINK_VAULT_SECTIONS: Database['public']['Enums']['project_link_section_enum'][] =
  [
    'delivery',
    'infrastructure',
    'product',
    'marketing',
    'operations',
    'client',
    'other',
  ];

export const LINK_VAULT_OPEN_ALL_CONFIRM_THRESHOLD = 5;

export const MEDIA_VAULT_BUCKET = 'project-media';
export const DOCUMENT_HUB_BUCKET = 'project-docs';

export const TEMP_LINK_TTL_SECONDS = 60 * 30; // 30 minutes
