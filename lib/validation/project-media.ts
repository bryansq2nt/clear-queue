export const MEDIA_PAGE_SIZE = 24;
export const MEDIA_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MEDIA_CANVAS_ACTIONBAR_HIDE_DELAY_MS = 2500;

export const MEDIA_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export type AcceptedMediaMimeType = (typeof MEDIA_ACCEPTED_MIME_TYPES)[number];

export const MEDIA_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export const MEDIA_CATEGORY_VALUES = [
  'branding',
  'content',
  'reference',
  'screenshot',
  'mockup',
  'other',
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORY_VALUES)[number];

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  branding: 'Branding',
  content: 'Content',
  reference: 'Reference',
  screenshot: 'Screenshot',
  mockup: 'Mockup',
  other: 'Other',
};

export function isValidMediaMimeType(
  mime: string
): mime is AcceptedMediaMimeType {
  return (MEDIA_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
}

export function isValidMediaCategory(value: unknown): value is MediaCategory {
  return (
    typeof value === 'string' &&
    (MEDIA_CATEGORY_VALUES as readonly string[]).includes(value)
  );
}

export function isImageMimeType(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isVideoMimeType(mime: string): boolean {
  return mime.startsWith('video/');
}
