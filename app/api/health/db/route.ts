import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/data-provider/health';
import { captureWithContext } from '@/lib/sentry';

/**
 * GET /api/health/db
 *
 * Checks whether Supabase is reachable (independent of DATA_PROVIDER).
 * Use this before switching from local JSON back to Supabase.
 */
export async function GET() {
  try {
    const health = await checkDatabaseHealth();

    return NextResponse.json(health, {
      status: health.supabase.online ? 200 : 503,
    });
  } catch (error) {
    captureWithContext(error, {
      module: 'health',
      action: 'GET /api/health/db',
      userIntent: 'Comprobar si Supabase está en línea',
      expected: 'JSON con estado online/offline de la base de datos',
    });

    return NextResponse.json(
      {
        activeProvider: process.env.DATA_PROVIDER ?? 'supabase',
        supabase: {
          configured: false,
          online: false,
          latencyMs: null,
          error: error instanceof Error ? error.message : 'Health check failed',
        },
        canSwitchToSupabase: false,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
