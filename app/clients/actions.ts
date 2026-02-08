'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Database } from '@/lib/supabase/types'

type Client = Database['public']['Tables']['clients']['Row']

export async function getClients(search?: string): Promise<Client[]> {
  await requireAuth()
  const supabase = await createClient()

  let query = supabase
    .from('clients')
    .select('*')
    .order('full_name', { ascending: true })

  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.ilike('full_name', term)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return (data as Client[]) || []
}

export async function getClientById(id: string): Promise<Client | null> {
  await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data as Client
}

export async function getProjectsByClientId(clientId: string) {
  await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, color, category')
    .eq('client_id', clientId)
    .order('name', { ascending: true })
  if (error) return []
  return (data || []) as { id: string; name: string; color: string | null; category: string }[]
}

export async function createClientAction(formData: FormData): Promise<{ error?: string; data?: Client }> {
  const user = await requireAuth()
  const supabase = await createClient()

  const full_name = (formData.get('full_name') as string)?.trim()
  if (!full_name) return { error: 'Full name is required' }

  const { data, error } = await supabase
    .from('clients')
    .insert({
      owner_id: user.id,
      full_name,
      phone: (formData.get('phone') as string)?.trim() || null,
      email: (formData.get('email') as string)?.trim() || null,
      gender: (formData.get('gender') as string)?.trim() || null,
      address_line1: (formData.get('address_line1') as string)?.trim() || null,
      address_line2: (formData.get('address_line2') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      postal_code: (formData.get('postal_code') as string)?.trim() || null,
      preferences: (formData.get('preferences') as string)?.trim() || null,
      notes: (formData.get('notes') as string)?.trim() || null,
    } as Database['public']['Tables']['clients']['Insert'])
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath('/clients/[id]')
  return { data: data as Client }
}

export async function updateClientAction(
  id: string,
  formData: FormData
): Promise<{ error?: string; data?: Client }> {
  await requireAuth()
  const supabase = await createClient()

  const full_name = (formData.get('full_name') as string)?.trim()
  if (!full_name) return { error: 'Full name is required' }

  const { data, error } = await supabase
    .from('clients')
    .update({
      full_name,
      phone: (formData.get('phone') as string)?.trim() || null,
      email: (formData.get('email') as string)?.trim() || null,
      gender: (formData.get('gender') as string)?.trim() || null,
      address_line1: (formData.get('address_line1') as string)?.trim() || null,
      address_line2: (formData.get('address_line2') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      postal_code: (formData.get('postal_code') as string)?.trim() || null,
      preferences: (formData.get('preferences') as string)?.trim() || null,
      notes: (formData.get('notes') as string)?.trim() || null,
    } as Database['public']['Tables']['clients']['Update'])
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { data: data as Client }
}

export async function deleteClientAction(id: string): Promise<{ error?: string }> {
  await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase.from('clients').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath('/clients/[id]')
  return {}
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

type Business = Database['public']['Tables']['businesses']['Row']

export type SocialLinks = {
  instagram?: string
  facebook?: string
  tiktok?: string
  youtube?: string
}

export async function getBusinessesByClientId(clientId: string): Promise<Business[]> {
  await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('client_id', clientId)
    .order('name', { ascending: true })
  if (error) return []
  return (data as Business[]) || []
}

export async function getBusinessById(id: string): Promise<Business | null> {
  await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as Business
}

function parseSocialLinks(formData: FormData): Record<string, string> {
  const links: Record<string, string> = {}
  const keys = ['instagram', 'facebook', 'tiktok', 'youtube'] as const
  keys.forEach((k) => {
    const v = (formData.get(`social_${k}`) as string)?.trim()
    if (v) links[k] = v
  })
  return links
}

export async function createBusinessAction(
  clientId: string,
  formData: FormData
): Promise<{ error?: string; data?: Business }> {
  const user = await requireAuth()
  const supabase = await createClient()

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Business name is required' }

  const email = (formData.get('email') as string)?.trim()
  if (!email) return { error: 'Business email is required' }

  const social_links = parseSocialLinks(formData)

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      owner_id: user.id,
      client_id: clientId,
      name,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      description: (formData.get('description') as string)?.trim() || null,
      email: email || null,
      address_line1: (formData.get('address_line1') as string)?.trim() || null,
      address_line2: (formData.get('address_line2') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      postal_code: (formData.get('postal_code') as string)?.trim() || null,
      website: (formData.get('website') as string)?.trim() || null,
      social_links: Object.keys(social_links).length ? social_links : {},
      notes: (formData.get('notes') as string)?.trim() || null,
    } as Database['public']['Tables']['businesses']['Insert'])
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { data: data as Business }
}

export async function updateBusinessAction(
  id: string,
  formData: FormData
): Promise<{ error?: string; data?: Business }> {
  await requireAuth()
  const supabase = await createClient()

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Business name is required' }

  const email = (formData.get('email') as string)?.trim()
  if (!email) return { error: 'Business email is required' }

  const social_links = parseSocialLinks(formData)

  const { data, error } = await supabase
    .from('businesses')
    .update({
      name,
      tagline: (formData.get('tagline') as string)?.trim() || null,
      description: (formData.get('description') as string)?.trim() || null,
      email: email || null,
      address_line1: (formData.get('address_line1') as string)?.trim() || null,
      address_line2: (formData.get('address_line2') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      postal_code: (formData.get('postal_code') as string)?.trim() || null,
      website: (formData.get('website') as string)?.trim() || null,
      social_links: Object.keys(social_links).length ? social_links : {},
      notes: (formData.get('notes') as string)?.trim() || null,
    } as Database['public']['Tables']['businesses']['Update'])
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath('/clients/[id]')
  return { data: data as Business }
}

export async function deleteBusinessAction(id: string): Promise<{ error?: string }> {
  await requireAuth()
  const supabase = await createClient()
  const { error } = await supabase.from('businesses').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath('/clients/[id]')
  return {}
}

// ---------------------------------------------------------------------------
// Client links
// ---------------------------------------------------------------------------

type ClientLink = Database['public']['Tables']['client_links']['Row']

export async function getClientLinks(clientId: string): Promise<ClientLink[]> {
  await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_links')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return []
  return (data as ClientLink[]) || []
}

export async function createClientLinkAction(
  clientId: string,
  formData: FormData
): Promise<{ error?: string; data?: ClientLink }> {
  await requireAuth()
  const supabase = await createClient()

  const url = (formData.get('url') as string)?.trim()
  if (!url) return { error: 'URL is required' }

  const { data, error } = await supabase
    .from('client_links')
    .insert({
      client_id: clientId,
      url,
      label: (formData.get('label') as string)?.trim() || null,
      sort_order: 0,
    } as Database['public']['Tables']['client_links']['Insert'])
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { data: data as ClientLink }
}

export async function updateClientLinkAction(
  id: string,
  formData: FormData
): Promise<{ error?: string; data?: ClientLink }> {
  await requireAuth()
  const supabase = await createClient()

  const url = (formData.get('url') as string)?.trim()
  if (!url) return { error: 'URL is required' }

  const { data, error } = await supabase
    .from('client_links')
    .update({
      url,
      label: (formData.get('label') as string)?.trim() || null,
    } as Database['public']['Tables']['client_links']['Update'])
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath('/clients/[id]')
  return { data: data as ClientLink }
}

export async function deleteClientLinkAction(id: string): Promise<{ error?: string }> {
  await requireAuth()
  const supabase = await createClient()
  const { error } = await supabase.from('client_links').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/clients')
  revalidatePath('/clients/[id]')
  return {}
}
