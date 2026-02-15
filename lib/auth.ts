import { createClient } from './supabase/server';
import { redirect } from 'next/navigation';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireAuth() {
  const user = await getUser();

  if (!user) {
    redirect('/');
  }

  return user;
}

export async function checkIsAdmin() {
  if (!ADMIN_EMAIL) return false;
  const user = await getUser();
  if (!user) return false;
  return user.email === ADMIN_EMAIL;
}
