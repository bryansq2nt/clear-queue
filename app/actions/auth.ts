'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    redirect('/dashboard');
  }

  return { error: 'Sign in failed' };
}

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email?.trim() || !password) {
    return { error: 'Email and password are required' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/dashboard`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user && !data.user.identities?.length) {
    return {
      error: 'An account with this email already exists. Sign in instead.',
    };
  }

  if (data.session) {
    redirect('/dashboard');
  }

  return {
    success: true,
    message: 'Check your email to confirm your account.',
  };
}

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email?.trim()) {
    return { error: 'Email is required' };
  }

  const supabase = await createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: 'Check your email for a link to reset your password.',
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function getSessionStatus(): Promise<{ hasSession: boolean }> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { hasSession: !!session };
}

export async function updatePassword(
  password: string
): Promise<{ error?: string }> {
  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return {};
}
