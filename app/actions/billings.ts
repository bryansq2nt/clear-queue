'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type Billing = Database['public']['Tables']['billings']['Row'];

export const getBillings = cache(
  async (): Promise<
    (Billing & {
      projects: { id: string; name: string } | null;
      clients: { id: string; full_name: string } | null;
    })[]
  > => {
    await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('billings')
      .select(
        'id, owner_id, client_id, project_id, title, client_name, amount, currency, status, due_date, paid_at, notes, created_at, updated_at'
      )
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

export const getBillingsByProjectId = cache(
  async (
    projectId: string
  ): Promise<
    (Billing & {
      projects: { id: string; name: string } | null;
      clients: { id: string; full_name: string } | null;
    })[]
  > => {
    await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('billings')
      .select(
        'id, owner_id, client_id, project_id, title, client_name, amount, currency, status, due_date, paid_at, notes, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error || !data?.length) return [];

    const billings = data as Billing[];
    const clientIds = [
      ...new Set(
        billings.map((b) => b.client_id).filter((id): id is string => !!id)
      ),
    ];

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

    const { data: projectRow } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();
    const projectInfo = projectRow as { id: string; name: string } | null;

    return billings.map((billing) => ({
      ...billing,
      projects: projectInfo,
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

  const { data, error } = await supabase
    .from('billings')
    .insert({
      owner_id: user.id,
      title: formData.title,
      client_id: formData.client_id || null,
      client_name: formData.client_id ? null : formData.client_name || null,
      amount: formData.amount,
      currency: formData.currency || 'USD',
      project_id: formData.project_id || null,
      due_date: formData.due_date || null,
      notes: formData.notes || null,
    } as never)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/billings');
  if (formData.project_id) {
    revalidatePath(`/context/${formData.project_id}/billings`);
  }
  return data;
}

export async function updateBillingStatus(
  id: string,
  status: Billing['status']
) {
  await requireAuth();
  const supabase = await createClient();

  const payload: Database['public']['Tables']['billings']['Update'] = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from('billings')
    .update(payload as never)
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/billings');
  const { data } = await supabase
    .from('billings')
    .select('project_id')
    .eq('id', id)
    .single();
  const row = data as { project_id: string | null } | null;
  if (row?.project_id) {
    revalidatePath(`/context/${row.project_id}/billings`);
  }
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
  await requireAuth();
  const supabase = await createClient();

  const payload: Database['public']['Tables']['billings']['Update'] = {
    title: formData.title,
    client_id: formData.client_id ?? null,
    client_name: formData.client_id ? null : (formData.client_name ?? null),
    amount: formData.amount,
    project_id: formData.project_id ?? null,
    due_date: formData.due_date || null,
    notes: formData.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('billings')
    .update(payload as never)
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/billings');
  if (formData.project_id) {
    revalidatePath(`/context/${formData.project_id}/billings`);
  }
  const { data: rowData } = await supabase
    .from('billings')
    .select('project_id')
    .eq('id', id)
    .single();
  const prevRow = rowData as { project_id: string | null } | null;
  if (prevRow?.project_id && prevRow.project_id !== formData.project_id) {
    revalidatePath(`/context/${prevRow.project_id}/billings`);
  }
  return { success: true };
}
