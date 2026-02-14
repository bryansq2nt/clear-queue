/**
 * Profile validation utilities
 * - display_name: required, trimmed, reasonable length
 * - phone: optional, basic validation
 * - timezone: valid IANA string (minimal safe list)
 * - locale: 'es' | 'en'
 */

const DISPLAY_NAME_MIN = 1
const DISPLAY_NAME_MAX = 100

export const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Bogota',
  'America/Buenos_Aires',
  'America/Caracas',
  'America/Lima',
  'America/Montevideo',
  'America/Santiago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC',
] as const

const ALLOWED_TIMEZONES = new Set(TIMEZONE_OPTIONS)

const ALLOWED_LOCALES = ['es', 'en'] as const
export type AllowedLocale = (typeof ALLOWED_LOCALES)[number]

export const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'MXN', label: 'Mexican Peso (MXN)' },
] as const

const ALLOWED_CURRENCIES = new Set(CURRENCY_OPTIONS.map((c) => c.code))

export function validateCurrency(
  value: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!s) return { ok: false, error: 'Currency is required' }
  if (!ALLOWED_CURRENCIES.has(s)) {
    return { ok: false, error: 'Invalid currency. Choose USD, EUR, GBP, CAD, or MXN.' }
  }
  return { ok: true, value: s }
}

export function validateDisplayName(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return { ok: false, error: 'Display name is required' }
  if (s.length < DISPLAY_NAME_MIN || s.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Display name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters` }
  }
  return { ok: true, value: s }
}

export function validatePhone(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null }
  const s = String(value).trim()
  if (!s) return { ok: true, value: null }
  if (s.length > 30) return { ok: false, error: 'Phone number is too long' }
  return { ok: true, value: s }
}

export function validateTimezone(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return { ok: false, error: 'Timezone is required' }
  if (!ALLOWED_TIMEZONES.has(s)) {
    return { ok: false, error: 'Invalid timezone' }
  }
  return { ok: true, value: s }
}

export function validateLocale(value: unknown): { ok: true; value: AllowedLocale } | { ok: false; error: string } {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!ALLOWED_LOCALES.includes(s as AllowedLocale)) {
    return { ok: false, error: 'Locale must be es or en' }
  }
  return { ok: true, value: s as AllowedLocale }
}
