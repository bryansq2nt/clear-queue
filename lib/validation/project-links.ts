/**
 * Validation helpers for Link Vault (project_links).
 * URL must start with http:// or https://; title required; enums validated.
 */

export const LINK_TYPES = [
  'environment',
  'tool',
  'resource',
  'social',
  'reference',
  'other',
] as const;

export const SECTIONS = [
  'delivery',
  'infrastructure',
  'product',
  'marketing',
  'operations',
  'client',
  'other',
] as const;

export type ProjectLinkType = (typeof LINK_TYPES)[number];
export type ProjectLinkSection = (typeof SECTIONS)[number];

const HTTP_HTTPS_REGEX = /^https?:\/\//i;

export function isValidProjectLinkType(
  value: unknown
): value is ProjectLinkType {
  return (
    typeof value === 'string' && LINK_TYPES.includes(value as ProjectLinkType)
  );
}

export function isValidProjectLinkSection(
  value: unknown
): value is ProjectLinkSection {
  return (
    typeof value === 'string' && SECTIONS.includes(value as ProjectLinkSection)
  );
}

export function validateProjectLinkUrl(url: unknown): string | null {
  if (url == null || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!HTTP_HTTPS_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function validateProjectLinkTitle(title: unknown): string | null {
  if (title == null || typeof title !== 'string') return null;
  const trimmed = title.trim();
  return trimmed || null;
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean);
}
