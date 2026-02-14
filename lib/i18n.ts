/**
 * Centralized i18n utilities
 * - t(): translate by nested key (common.save, dashboard.title)
 * - formatCurrency(): locale-aware currency formatting
 * - Fallback to English when key or locale missing
 */

import en from '@/locales/en.json'
import es from '@/locales/es.json'

export type Locale = 'en' | 'es'

const translations: Record<Locale, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
}

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Translate a key. Supports nested keys (common.save).
 * Replaces {param} placeholders with values from params.
 */
export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const loc = locale === 'es' || locale === 'en' ? locale : 'en'
  const dict = translations[loc] ?? translations.en
  let value = getNested(dict as Record<string, unknown>, key)
  if (value === undefined) {
    value = getNested(translations.en as Record<string, unknown>, key)
  }
  if (value === undefined) return key
  let result = String(value)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return result
}

/**
 * Format amount as currency using Intl.NumberFormat.
 * Respects locale (decimal format, symbol position).
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string
): string {
  try {
    const localeTag = locale === 'es' ? 'es-MX' : locale === 'en' ? 'en-US' : locale
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount)
  }
}

export const DEFAULT_LOCALE: Locale = 'en'
export const DEFAULT_CURRENCY = 'USD'
