/**
 * Data provider switch.
 *
 * Set DATA_PROVIDER=local in .env.local for JSON file storage (no Supabase).
 * Omit or set DATA_PROVIDER=supabase for production database.
 */
export type DataProvider = 'supabase' | 'local';

export function getDataProvider(): DataProvider {
  const value = process.env.DATA_PROVIDER?.trim().toLowerCase();
  if (value === 'local') return 'local';
  return 'supabase';
}

export function isLocalDataProvider(): boolean {
  return getDataProvider() === 'local';
}
