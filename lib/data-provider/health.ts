import { createClient } from '@supabase/supabase-js';
import { getDataProvider, type DataProvider } from './config';

export type SupabaseHealthStatus = {
  configured: boolean;
  online: boolean;
  latencyMs: number | null;
  error: string | null;
};

export type DatabaseHealthResult = {
  activeProvider: DataProvider;
  supabase: SupabaseHealthStatus;
  /** True when app uses local JSON but Supabase responds — safe to switch DATA_PROVIDER. */
  canSwitchToSupabase: boolean;
  checkedAt: string;
};

const PAUSED_PATTERNS = [
  'paused',
  'inactive',
  'project is not active',
  'service unavailable',
  'failed to fetch',
  'fetch failed',
  'network',
  'econnrefused',
  'etimedout',
  'timeout',
  '502',
  '503',
  '540',
];

function isPausedOrUnreachable(message: string): boolean {
  const lower = message.toLowerCase();
  return PAUSED_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Pings Supabase PostgREST directly — does not use createClient() from server.ts,
 * so it works even when DATA_PROVIDER=local.
 */
export async function checkSupabaseDatabaseHealth(): Promise<SupabaseHealthStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return {
      configured: false,
      online: false,
      latencyMs: null,
      error:
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const started = Date.now();

  try {
    // Lightweight read: any PostgREST response (even RLS empty) means DB is up.
    const { error } = await client.from('profiles').select('user_id').limit(1);

    const latencyMs = Date.now() - started;

    if (error) {
      const msg = error.message ?? 'Unknown Supabase error';
      if (isPausedOrUnreachable(msg)) {
        return { configured: true, online: false, latencyMs, error: msg };
      }
      // RLS / auth / schema errors still mean the API is reachable.
      return { configured: true, online: true, latencyMs, error: null };
    }

    return { configured: true, online: true, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return {
      configured: true,
      online: false,
      latencyMs,
      error: msg,
    };
  }
}

export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  const activeProvider = getDataProvider();
  const supabase = await checkSupabaseDatabaseHealth();

  return {
    activeProvider,
    supabase,
    canSwitchToSupabase:
      activeProvider === 'local' && supabase.configured && supabase.online,
    checkedAt: new Date().toISOString(),
  };
}
