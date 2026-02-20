'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';
import { billingSchema } from '@/lib/server/action-schemas';
import { parseWithSchema } from '@/lib/server/validation';

type Billing = Database['public']['Tables']['billings']['Row'];

export const getBillings = cache(
  async (): Promise<
    (Billing & {
      projects: { id: string; name: string } | null;
      clients: { id: string; full_name: string } | null;
    })[]
  > => {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('billings')
      .select(
        'id, owner_id, client_id, project_id, title, client_name, amount, currency, status, due_date, paid_at, notes, created_at, updated_at'
      )
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data?.length) return [];

    const billings = data as Billing[];
    const projectIds = [
      ...new Set(
        billings.map((b) => b.project_id).filter((id): id is string => !!id)
      ),
    ];
    const clientIds = [
      ...new Set(
        billings.map((b) => b.client_id).filter((id): id is string => !!id)
      ),
    ];

    let projectsMap: Record<string, { id: string; name: string }> = {};
    if (projectIds.length) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      projectsMap = ((projects || []) as { id: string; name: string }[]).reduce(
        (acc, p) => {
          acc[p.id] = p;
          return acc;
        },
        {} as Record<string, { id: string; name: string }>
      );
    }

    let clientsMap: Record<string, { id: string; full_name: string }> = {};
    if (clientIds.length) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name')
        .in('id', clientIds);
      clientsMap = (
        (clients || []) as { id: string; full_name: string }[]
      ).reduce(
        (acc, c) => {
          acc[c.id] = c;
          return acc;
        },
        {} as Record<string, { id: string; full_name: string }>
      );
    }

    return billings.map((billing) => ({
      ...billing,
      projects: billing.project_id
        ? projectsMap[billing.project_id] || null
        : null,
      clients: billing.client_id ? clientsMap[billing.client_id] || null : null,
    }));
  }
);

export async function createBilling(formData: {
  title: string;
  client_id?: string | null;
  client_name?: string;
  amount: number;
  currency?: string;
  project_id?: string | null;
  due_date?: string;
  notes?: string;
}) {
  const user = await requireAuth();
  const supabase = await createClient();

  const parsed = parseWithSchema(billingSchema, formData);
  if (!parsed.data) {
    throw new Error(parsed.error ?? 'Invalid payload');
  }

  const { data, error } = await supabase
    .from('billings')
    .insert({
      owner_id: user.id,
      title: parsed.data.title,
      client_id: parsed.data.client_id,
      client_name: parsed.data.client_id ? null : parsed.data.client_name,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      project_id: parsed.data.project_id,
      due_date: parsed.data.due_date,
      notes: parsed.data.notes,
    } as never)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/billings');
  return data;
}

export async function updateBillingStatus(
  id: string,
  status: Billing['status']
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const payload: Database['public']['Tables']['billings']['Update'] = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from('billings')
    .update(payload as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/billings');
  return { success: true };
}

export async function updateBilling(
  id: string,
  formData: {
    title: string;
    client_id?: string | null;
    client_name?: string | null;
    amount: number;
    project_id?: string | null;
    due_date?: string | null;
    notes?: string | null;
  }
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const parsed = parseWithSchema(billingSchema, formData);
  if (!parsed.data) throw new Error(parsed.error ?? 'Invalid payload');

  const payload: Database['public']['Tables']['billings']['Update'] = {
    title: parsed.data.title,
    client_id: parsed.data.client_id,
    client_name: parsed.data.client_id ? null : parsed.data.client_name,
    amount: parsed.data.amount,
    project_id: parsed.data.project_id,
    due_date: parsed.data.due_date,
    notes: parsed.data.notes,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('billings')
    .update(payload as never)
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/billings');
  return { success: true };
}
