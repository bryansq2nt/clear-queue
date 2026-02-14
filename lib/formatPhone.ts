import { formatPhoneNumber, parsePhoneNumber } from 'react-phone-number-input'

/**
 * Format a phone number for display (international style, e.g. +1 443 535 7785).
 * Falls back to raw value if parsing fails (legacy or invalid numbers).
 * Tries default country US when number has no leading + for legacy data.
 */
export function formatPhoneDisplay(phone: string | null | undefined, defaultCountry: string = 'US'): string {
  if (!phone?.trim()) return ''
  const raw = phone.trim()
  let parsed = parsePhoneNumber(raw)
  if (!parsed && !raw.startsWith('+') && raw.replace(/\D/g, '').length >= 10) {
    parsed = parsePhoneNumber(raw, defaultCountry as 'US')
  }
  if (parsed) return formatPhoneNumber(parsed.number)
  return raw
}
