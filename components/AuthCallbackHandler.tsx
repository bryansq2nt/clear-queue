'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Handles Supabase auth redirect when user lands with ?code=... (e.g. password reset link).
 * Exchanges the code for a session and redirects to /reset-password so they can set a new password.
 */
export default function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<
    'idle' | 'exchanging' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code || status !== 'idle') return;

    setStatus('exchanging');
    const supabase = createClient();

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          setError(exchangeError.message);
          setStatus('error');
          supabase.auth.signOut();
          return;
        }
        setStatus('done');
        router.replace('/reset-password');
        router.refresh();
      })
      .catch((err) => {
        setError(err?.message || 'Invalid or expired link');
        setStatus('error');
        supabase.auth.signOut();
      });
  }, [searchParams, router, status]);

  if (status === 'idle') return null;

  if (status === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
          <p className="text-destructive text-sm">{error}</p>
          <p className="text-slate-600 text-sm">
            Request a new link below and open it in the{' '}
            <strong>same browser</strong> where you requested it.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="/forgot-password"
              className="w-full text-center py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-slate-50"
            >
              Request a new link
            </a>
            <a
              href="/"
              className="w-full text-center py-2 text-sm font-medium text-primary hover:underline"
            >
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'exchanging' || status === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80">
        <div className="bg-white rounded-lg shadow-lg px-6 py-4 text-slate-700">
          Completing sign in...
        </div>
      </div>
    );
  }

  return null;
}
