export const DOCUMENT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const DOCUMENT_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;

export type AcceptedMimeType = (typeof DOCUMENT_ACCEPTED_MIME_TYPES)[number];

export const DOCUMENT_EXT_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
};

export const DOCUMENT_CATEGORY_VALUES = [
  'brief',
  'contract',
  'invoice',
  'proposal',
  'report',
  'spreadsheet',
  'notes',
  'other',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORY_VALUES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  brief: 'Brief',
  contract: 'Contract',
  invoice: 'Invoice',
  proposal: 'Proposal',
  report: 'Report',
  spreadsheet: 'Spreadsheet',
  notes: 'Notes',
  other: 'Other',
};

export function isValidDocumentCategory(
  value: unknown
): value is DocumentCategory {
  return (
    typeof value === 'string' &&
    (DOCUMENT_CATEGORY_VALUES as readonly string[]).includes(value)
  );
}

export function isValidMimeType(mime: string): mime is AcceptedMimeType {
  return (DOCUMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
}
