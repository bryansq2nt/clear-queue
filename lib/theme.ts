/**
 * Shared theme application utilities
 * Used by ThemeProvider and Appearance settings
 */

const STORAGE_KEY = 'cq-theme-prefs';

export const DEFAULT_PREFS = {
  theme_mode: 'system' as const,
  primary_color: '#05668D',
  secondary_color: '#0B132B',
  third_color: '#F4F7FB',
};

export type ThemePrefs = {
  theme_mode: 'light' | 'dark' | 'system';
  primary_color: string;
  secondary_color: string;
  third_color: string;
};

/** Convert hex #RRGGBB to HSL "H S% L%" for Tailwind's hsl(var(--primary)) */
function hexToHsl(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '222.2 47.4% 11.2%';
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Returns "210 40% 98%" (light) or "222.2 47.4% 11.2%" (dark) for contrast on primary */
function primaryForegroundFor(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '210 40% 98%';
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? '222.2 47.4% 11.2%' : '210 40% 98%';
}

export function applyTheme(prefs: ThemePrefs) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (prefs.theme_mode === 'dark') {
    root.classList.add('dark');
  } else if (prefs.theme_mode === 'light') {
    root.classList.remove('dark');
  } else {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  root.style.setProperty('--brand-primary', prefs.primary_color);
  root.style.setProperty('--brand-secondary', prefs.secondary_color);
  root.style.setProperty('--brand-third', prefs.third_color);

  root.style.setProperty('--primary', hexToHsl(prefs.primary_color));
  root.style.setProperty(
    '--primary-foreground',
    primaryForegroundFor(prefs.primary_color)
  );
}

export function loadFromStorage(): ThemePrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      return {
        theme_mode: p.theme_mode ?? DEFAULT_PREFS.theme_mode,
        primary_color: p.primary_color ?? DEFAULT_PREFS.primary_color,
        secondary_color: p.secondary_color ?? DEFAULT_PREFS.secondary_color,
        third_color: p.third_color ?? DEFAULT_PREFS.third_color,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFS;
}

export function saveToStorage(prefs: ThemePrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
