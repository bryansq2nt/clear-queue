import { createClient } from '@/lib/supabase/server';
import { captureWithContext } from '@/lib/sentry';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const access_token = body?.access_token as string | undefined;
  const refresh_token = body?.refresh_token as string | undefined;

  if (!access_token || !refresh_token) {
    return NextResponse.json(
      { error: 'access_token and refresh_token required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    captureWithContext(error, {
      module: 'api',
      action: 'set-recovery-session',
      userIntent: 'Restablecer sesión tras recuperación de contraseña',
      expected: 'Sesión establecida y redirección correcta',
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
