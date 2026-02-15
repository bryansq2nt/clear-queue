'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  t as tFn,
  formatCurrency as formatCurrencyFn,
  type Locale,
} from '@/lib/i18n';
import type { getProfileOptional } from '@/app/settings/profile/actions';
import type { getPreferencesOptional } from '@/app/settings/appearance/actions';

type Profile = Awaited<ReturnType<typeof getProfileOptional>>;
type UserPreferences = Awaited<ReturnType<typeof getPreferencesOptional>>;

const I18N_STORAGE_KEY = 'cq-i18n-prefs';

type I18nPrefs = {
  locale: Locale;
  currency: string;
};

const DEFAULT_PREFS: I18nPrefs = {
  locale: 'en',
  currency: 'USD',
};

function loadFromStorage(): I18nPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const s = localStorage.getItem(I18N_STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      return {
        locale: p.locale === 'es' ? 'es' : 'en',
        currency: p.currency ?? DEFAULT_PREFS.currency,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFS;
}

function saveToStorage(prefs: I18nPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(I18N_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

type I18nContextValue = {
  locale: Locale;
  currency: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: number) => string;
  setPrefs: (prefs: Partial<I18nPrefs>) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function initialPrefsFromServer(
  profile: Profile | null | undefined,
  preferences: UserPreferences | null | undefined
): I18nPrefs {
  const stored = loadFromStorage();
  return {
    locale: (profile?.locale === 'es' ? 'es' : 'en') as Locale,
    currency: preferences?.currency ?? stored.currency,
  };
}

export function I18nProvider({
  children,
  initialProfile = null,
  initialPreferences = null,
}: {
  children: ReactNode;
  initialProfile?: Profile | null;
  initialPreferences?: UserPreferences | null;
}) {
  const [prefs, setPrefsState] = useState<I18nPrefs>(() =>
    initialPrefsFromServer(initialProfile, initialPreferences)
  );
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const next = initialPrefsFromServer(initialProfile, initialPreferences);
    saveToStorage(next);
  }, [initialProfile, initialPreferences]);

  const setPrefs = useCallback((partial: Partial<I18nPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial };
      saveToStorage(next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      tFn(prefs.locale, key, params),
    [prefs.locale]
  );

  const formatCurrency = useCallback(
    (amount: number) => formatCurrencyFn(amount, prefs.currency, prefs.locale),
    [prefs.currency, prefs.locale]
  );

  const value: I18nContextValue = {
    locale: prefs.locale,
    currency: prefs.currency,
    t,
    formatCurrency,
    setPrefs,
  };

  if (!mounted) {
    return (
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    );
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export default I18nProvider;

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
