import { createClient } from './supabase/server'
import { redirect } from 'next/navigation'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL

if (!ADMIN_EMAIL) {
  throw new Error('ADMIN_EMAIL environment variable is not set')
}

export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function requireAuth() {
  const user = await getUser()
  
  if (!user) {
    redirect('/')
  }

  const userEmail = user.email
  if (userEmail !== ADMIN_EMAIL) {
    redirect('/?error=unauthorized')
  }

  return user
}

export async function checkIsAdmin() {
  const user = await getUser()
  if (!user) return false
  return user.email === ADMIN_EMAIL
}
