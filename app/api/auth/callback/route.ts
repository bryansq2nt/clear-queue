import { createClient } from '@/lib/supabase/server';
import { captureWithContext } from '@/lib/sentry';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Exchanges auth code for session (e.g. from password reset link).
 * Sets session cookies and redirects to /reset-password.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    captureWithContext(error, {
      module: 'api',
      action: 'auth-callback',
      userIntent: 'Canjear código de auth (ej. link de restablecer contraseña)',
      expected: 'Sesión creada y redirección a /reset-password',
    });
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL('/reset-password', request.url));
}
