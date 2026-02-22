'use client';

import { useEffect } from 'react';
import type { getPreferencesOptional } from '@/app/settings/appearance/actions';
import { applyTheme, loadFromStorage, saveToStorage } from '@/lib/theme';

type UserPreferences = Awaited<ReturnType<typeof getPreferencesOptional>>;

export default function ThemeProvider({
  children,
  initialPreferences = null,
}: {
  children: React.ReactNode;
  initialPreferences?: UserPreferences | null;
}) {
  useEffect(() => {
    const stored = loadFromStorage();
    if (initialPreferences) {
      const next = {
        theme_mode: initialPreferences.theme_mode,
        primary_color: initialPreferences.primary_color,
        secondary_color: initialPreferences.secondary_color,
        third_color: initialPreferences.third_color,
      };
      saveToStorage(next);
      applyTheme(next);
    } else {
      applyTheme(stored);
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const stored = loadFromStorage();
      if (stored.theme_mode === 'system') {
        applyTheme(stored);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [initialPreferences]);

  return <>{children}</>;
}
