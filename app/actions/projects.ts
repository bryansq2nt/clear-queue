'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createProject(formData: FormData) {
  await requireAuth()
  const supabase = await createClient()

  const name = formData.get('name') as string
  const color = formData.get('color') as string | null

  const { data, error } = await supabase
    .from('projects')
    .insert({ name, color: color || null } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { data }
}

export async function deleteProject(id: string) {
  await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}
