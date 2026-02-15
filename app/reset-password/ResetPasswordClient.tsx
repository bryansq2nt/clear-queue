'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionStatus, updatePassword } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || hash.charAt(0) !== '#') return params;
  const query = hash.slice(1);
  query.split('&').forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) params[key] = decodeURIComponent(value);
  });
  return params;
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = parseHashParams(
      typeof window !== 'undefined' ? window.location.hash : ''
    );
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;
    const type = params.type;

    if (type === 'recovery' && access_token && refresh_token) {
      fetch('/api/auth/set-recovery-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, refresh_token }),
      })
        .then((res) => {
          if (!res.ok) return res.json().then((b) => Promise.reject(b));
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          setReady(true);
        })
        .catch((err) => {
          setError(
            err?.error || err?.message || 'Invalid or expired reset link.'
          );
        });
    } else {
      getSessionStatus().then(({ hasSession }) => {
        if (hasSession) {
          setReady(true);
        } else {
          setError(
            'No reset link detected. Request a new password reset from the sign-in page.'
          );
        }
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const password = (form.elements.namedItem('password') as HTMLInputElement)
      .value;
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement)
      .value;

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const result = await updatePassword(password);
    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    setSuccess(true);
    setIsLoading(false);
    router.push('/dashboard');
    router.refresh();
  }

  if (error && !ready) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg space-y-4">
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
        <Button asChild className="w-full">
          <a href="/forgot-password">Request a new reset link</a>
        </Button>
        <p className="text-center text-sm text-slate-600">
          <a href="/" className="font-medium text-primary hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg text-center text-slate-600">
        Loading...
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 bg-white p-6 rounded-lg shadow-lg"
    >
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
        />
        <p className="text-xs text-muted-foreground">At least 6 characters</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Updating...' : 'Update password'}
      </Button>
      <p className="text-center text-sm text-slate-600">
        <a href="/" className="font-medium text-primary hover:underline">
          Back to sign in
        </a>
      </p>
    </form>
  );
}
