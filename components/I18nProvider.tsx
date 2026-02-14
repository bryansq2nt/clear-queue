'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { t as tFn, formatCurrency as formatCurrencyFn, type Locale } from '@/lib/i18n'
import { getProfile } from '@/app/settings/profile/actions'
import { getPreferencesOptional } from '@/app/settings/appearance/actions'

const I18N_STORAGE_KEY = 'cq-i18n-prefs'

type I18nPrefs = {
  locale: Locale
  currency: string
}

const DEFAULT_PREFS: I18nPrefs = {
  locale: 'en',
  currency: 'USD',
}

function loadFromStorage(): I18nPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const s = localStorage.getItem(I18N_STORAGE_KEY)
    if (s) {
      const p = JSON.parse(s)
      return {
        locale: p.locale === 'es' ? 'es' : 'en',
        currency: p.currency ?? DEFAULT_PREFS.currency,
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFS
}

function saveToStorage(prefs: I18nPrefs) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(I18N_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

type I18nContextValue = {
  locale: Locale
  currency: string
  t: (key: string, params?: Record<string, string | number>) => string
  formatCurrency: (amount: number) => string
  setPrefs: (prefs: Partial<I18nPrefs>) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<I18nPrefs>(DEFAULT_PREFS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = loadFromStorage()
    setPrefsState(stored)

    Promise.all([getProfile(), getPreferencesOptional()])
      .then(([profile, preferences]) => {
        const next: I18nPrefs = {
          locale: (profile?.locale === 'es' ? 'es' : 'en') as Locale,
          currency: preferences?.currency ?? stored.currency,
        }
        setPrefsState(next)
        saveToStorage(next)
      })
      .catch(() => {
        setPrefsState(stored)
      })
    setMounted(true)
  }, [])

  const setPrefs = useCallback((partial: Partial<I18nPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial }
      saveToStorage(next)
      return next
    })
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => tFn(prefs.locale, key, params),
    [prefs.locale]
  )

  const formatCurrency = useCallback(
    (amount: number) => formatCurrencyFn(amount, prefs.currency, prefs.locale),
    [prefs.currency, prefs.locale]
  )

  const value: I18nContextValue = {
    locale: prefs.locale,
    currency: prefs.currency,
    t,
    formatCurrency,
    setPrefs,
  }

  if (!mounted) {
    return (
      <I18nContext.Provider value={value}>
        {children}
      </I18nContext.Provider>
    )
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export default I18nProvider

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
