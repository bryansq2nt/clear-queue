/**
 * Brand color validation
 * Strict HEX #RRGGBB only
 */

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function validateHexColor(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return { ok: false, error: 'Color is required' };
  if (!HEX_REGEX.test(s))
    return { ok: false, error: 'Color must be a valid HEX (#RRGGBB)' };
  return { ok: true, value: s };
}

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export function validateThemeMode(
  value: unknown
): { ok: true; value: ThemeMode } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!THEME_MODES.includes(s as ThemeMode)) {
    return { ok: false, error: 'Theme mode must be light, dark, or system' };
  }
  return { ok: true, value: s as ThemeMode };
}
