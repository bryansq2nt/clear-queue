'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Database } from '@/lib/supabase/types'

type Billing = Database['public']['Tables']['billings']['Row']

export async function getBillings(): Promise<(Billing & {
  projects: { id: string; name: string } | null
  clients: { id: string; full_name: string } | null
})[]> {
  await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('billings')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data?.length) return []

  const billings = data as Billing[]
  const projectIds = [...new Set(billings.map(b => b.project_id).filter((id): id is string => !!id))]
  const clientIds = [...new Set(billings.map(b => b.client_id).filter((id): id is string => !!id))]

  let projectsMap: Record<string, { id: string; name: string }> = {}
  if (projectIds.length) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds)
    projectsMap = ((projects || []) as { id: string; name: string }[]).reduce((acc, p) => {
      acc[p.id] = p
      return acc
    }, {} as Record<string, { id: string; name: string }>)
  }

  let clientsMap: Record<string, { id: string; full_name: string }> = {}
  if (clientIds.length) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, full_name')
      .in('id', clientIds)
    clientsMap = ((clients || []) as { id: string; full_name: string }[]).reduce((acc, c) => {
      acc[c.id] = c
      return acc
    }, {} as Record<string, { id: string; full_name: string }>)
  }

  return billings.map((billing) => ({
    ...billing,
    projects: billing.project_id ? projectsMap[billing.project_id] || null : null,
    clients: billing.client_id ? clientsMap[billing.client_id] || null : null,
  }))
}

export async function createBilling(formData: {
  title: string
  client_id?: string | null
  client_name?: string
  amount: number
  currency?: string
  project_id?: string | null
  due_date?: string
  notes?: string
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('billings')
    .insert({
      owner_id: user.id,
      title: formData.title,
      client_id: formData.client_id || null,
      client_name: formData.client_id ? null : (formData.client_name || null),
      amount: formData.amount,
      currency: formData.currency || 'USD',
      project_id: formData.project_id || null,
      due_date: formData.due_date || null,
      notes: formData.notes || null,
    } as never)
    .select()
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/billings')
  return data
}

export async function updateBillingStatus(id: string, status: Billing['status']) {
  await requireAuth()
  const supabase = await createClient()

  const payload: Database['public']['Tables']['billings']['Update'] = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  }

  const { error } = await supabase
    .from('billings')
    .update(payload as never)
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/billings')
  return { success: true }
}

export async function updateBilling(
  id: string,
  formData: {
    title: string
    client_id?: string | null
    client_name?: string | null
    amount: number
    project_id?: string | null
    due_date?: string | null
    notes?: string | null
  }
) {
  await requireAuth()
  const supabase = await createClient()

  const payload: Database['public']['Tables']['billings']['Update'] = {
    title: formData.title,
    client_id: formData.client_id ?? null,
    client_name: formData.client_id ? null : (formData.client_name ?? null),
    amount: formData.amount,
    project_id: formData.project_id ?? null,
    due_date: formData.due_date || null,
    notes: formData.notes || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('billings')
    .update(payload as never)
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/billings')
  return { success: true }
}
