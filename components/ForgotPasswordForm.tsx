'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const form = e.currentTarget;
    const email = (
      form.elements.namedItem('email') as HTMLInputElement
    ).value?.trim();
    if (!email) {
      setError('Email is required');
      setIsLoading(false);
      return;
    }

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : `${process.env.NEXT_PUBLIC_SITE_URL || ''}/reset-password`;

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo,
      }
    );

    if (resetError) {
      const message = resetError.message?.toLowerCase().includes('rate limit')
        ? 'Too many reset emails sent. Please try again in about an hour.'
        : resetError.message;
      setError(message);
      setIsLoading(false);
      return;
    }

    setSuccess(
      'Check your email for a link to reset your password. Open the link in this same browser.'
    );
    setIsLoading(false);
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
      {success && (
        <div className="bg-green-50 text-green-800 text-sm p-3 rounded-md">
          {success}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send reset link'}
      </Button>
      <p className="text-center text-sm text-slate-600">
        <Link href="/" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
