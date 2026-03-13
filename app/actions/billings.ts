'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { revalidatePath } from 'next/cache';
import { captureWithContext } from '@/lib/sentry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillingCategory {
  id: string;
  owner_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Billing {
  id: string;
  owner_id: string;
  client_id: string | null;
  project_id: string | null;
  title: string;
  client_name: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  category_id: string | null;
  type: 'charge' | 'payment' | 'spending';
  issued_at: string | null;
  payment_method: string | null;
  paid_by: string | null;
  expect_reimbursement: boolean;
  reimburse_to_client_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingWithRelations extends Billing {
  client: { id: string; full_name: string } | null;
  billing_categories: { id: string; name: string; color: string | null } | null;
}

const BILLING_COLS =
  'id, owner_id, client_id, project_id, title, client_name, amount, currency, status, due_date, paid_at, notes, category_id, type, issued_at, payment_method, paid_by, expect_reimbursement, reimburse_to_client_id, created_at, updated_at';

function revalidateBillingPaths(projectId?: string | null) {
  revalidatePath('/billings');
  if (projectId) {
    revalidatePath(`/context/${projectId}/billings`);
  }
}

// ─── Billing categories ───────────────────────────────────────────────────────

export const getBillingCategories = cache(
  async (): Promise<BillingCategory[]> => {
    const user = await requireAuth();
    const supabase = await createClient();
    const { data } = await supabase
      .from('billing_categories')
      .select('id, owner_id, name, color, sort_order, created_at, updated_at')
      .eq('owner_id', user.id)
      .order('sort_order', { ascending: true });
    return (data as BillingCategory[] | null) ?? [];
  }
);

const DEFAULT_CATEGORIES = [
  'Services',
  'Materials',
  'Fees',
  'Subscriptions',
  'Other',
];

export async function seedDefaultBillingCategories(): Promise<void> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('billing_categories')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  if (existing && existing.length > 0) return;

  await (supabase as any).from('billing_categories').insert(
    DEFAULT_CATEGORIES.map((name, i) => ({
      owner_id: user.id,
      name,
      sort_order: i,
    }))
  );
}

export async function createBillingCategory(
  name: string
): Promise<{ data?: BillingCategory; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Category name is required' };

  const { data: maxRow } = await supabase
    .from('billing_categories')
    .select('sort_order')
    .eq('owner_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  const nextOrder =
    ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await (supabase as any)
    .from('billing_categories')
    .insert({ owner_id: user.id, name: trimmed, sort_order: nextOrder })
    .select('id, owner_id, name, color, sort_order, created_at, updated_at')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'billings',
      action: 'createBillingCategory',
      userIntent: 'Create a billing category',
      expected: 'New category row inserted',
    });
    return { error: error.message };
  }
  return { data: data as BillingCategory };
}

export async function deleteBillingCategory(
  categoryId: string
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from('billing_categories')
    .delete()
    .eq('id', categoryId)
    .eq('owner_id', user.id);
  if (error) {
    captureWithContext(error, {
      module: 'billings',
      action: 'deleteBillingCategory',
      userIntent: 'Delete a billing category',
      expected: 'Category row deleted; billings category_id set to NULL by FK',
    });
    return { error: error.message };
  }
  return {};
}

// ─── Billings reads ───────────────────────────────────────────────────────────

export const getBillingsByProjectId = cache(
  async (projectId: string): Promise<BillingWithRelations[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await (supabase as any)
      .from('billings')
      .select(
        `${BILLING_COLS}, client:clients!billings_client_id_fkey(id, full_name), billing_categories(id, name, color)`
      )
      .eq('project_id', projectId)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data?.length) return [];
    return data as BillingWithRelations[];
  }
);

// ─── Billings writes ──────────────────────────────────────────────────────────

export async function createBilling(formData: {
  title: string;
  client_id?: string | null;
  client_name?: string | null;
  amount: number;
  currency?: string;
  project_id?: string | null;
  due_date?: string | null;
  notes?: string | null;
  category_id?: string | null;
  type?: 'charge' | 'payment' | 'spending';
  issued_at?: string | null;
  payment_method?: string | null;
  paid_by?: string | null;
  expect_reimbursement?: boolean;
  reimburse_to_client_id?: string | null;
}): Promise<{ data?: BillingWithRelations; error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const title = formData.title.trim();
  if (!title) return { error: 'Title is required' };
  if (formData.amount < 0) return { error: 'Amount must be 0 or greater' };
  if (
    formData.due_date &&
    formData.issued_at &&
    formData.due_date < formData.issued_at
  ) {
    return { error: 'Due date cannot be earlier than the issue date' };
  }

  if (formData.project_id) {
    await requireCan(user.id, 'billings.create', { type: 'billing', projectId: formData.project_id });
  }

  const { data, error } = await (supabase as any)
    .from('billings')
    .insert({
      owner_id: user.id,
      title,
      client_id: formData.client_id || null,
      client_name: formData.client_id
        ? null
        : formData.client_name?.trim() || null,
      amount: formData.amount,
      currency: formData.currency || 'USD',
      project_id: formData.project_id || null,
      due_date: formData.due_date || null,
      notes: formData.notes?.trim() || null,
      category_id: formData.category_id || null,
      type: formData.type || 'charge',
      issued_at: formData.issued_at || null,
      payment_method: formData.payment_method || null,
      paid_by: formData.paid_by || null,
      expect_reimbursement: formData.expect_reimbursement ?? false,
      reimburse_to_client_id: formData.reimburse_to_client_id || null,
    })
    .select(
      `${BILLING_COLS}, client:clients!billings_client_id_fkey(id, full_name), billing_categories(id, name, color)`
    )
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'billings',
      action: 'createBilling',
      userIntent: 'Create a billing entry for a project',
      expected: 'New billing row inserted and returned',
    });
    return { error: error.message };
  }

  revalidateBillingPaths(formData.project_id);
  return { data: data as BillingWithRelations };
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
    category_id?: string | null;
    type?: 'charge' | 'payment' | 'spending';
    issued_at?: string | null;
    payment_method?: string | null;
    paid_by?: string | null;
    expect_reimbursement?: boolean;
    reimburse_to_client_id?: string | null;
  }
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const title = formData.title.trim();
  if (!title) return { error: 'Title is required' };
  if (
    formData.due_date &&
    formData.issued_at &&
    formData.due_date < formData.issued_at
  ) {
    return { error: 'Due date cannot be earlier than the issue date' };
  }

  if (formData.project_id) {
    await requireCan(user.id, 'billings.update_description', { type: 'billing', projectId: formData.project_id });
  }

  const { error } = await (supabase as any)
    .from('billings')
    .update({
      title,
      client_id: formData.client_id ?? null,
      client_name: formData.client_id
        ? null
        : (formData.client_name?.trim() ?? null),
      amount: formData.amount,
      project_id: formData.project_id ?? null,
      due_date: formData.due_date || null,
      notes: formData.notes?.trim() || null,
      category_id: formData.category_id ?? null,
      type: formData.type || 'charge',
      issued_at: formData.issued_at || null,
      payment_method: formData.payment_method || null,
      paid_by: formData.paid_by || null,
      expect_reimbursement: formData.expect_reimbursement ?? false,
      reimburse_to_client_id: formData.reimburse_to_client_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'billings',
      action: 'updateBilling',
      userIntent: 'Edit an existing billing entry',
      expected: 'Billing row updated',
    });
    return { error: error.message };
  }

  revalidateBillingPaths(formData.project_id);
  return {};
}

export async function updateBillingStatus(
  id: string,
  status: Billing['status']
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: billingRow } = await (supabase as any)
    .from('billings')
    .select('project_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();
  if ((billingRow as { project_id: string | null } | null)?.project_id) {
    await requireCan(user.id, 'billings.update_status', { type: 'billing', projectId: (billingRow as unknown as { project_id: string }).project_id });
  }

  const { error } = await (supabase as any)
    .from('billings')
    .update({
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    captureWithContext(error, {
      module: 'billings',
      action: 'updateBillingStatus',
      userIntent: 'Change billing status',
      expected: 'Status and paid_at updated on billing row',
    });
    return { error: error.message };
  }

  revalidatePath('/billings');
  // Revalidate the project context path — fetch project_id from row
  const { data: row } = await (supabase as any)
    .from('billings')
    .select('project_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();
  const projectId = (row as { project_id: string | null } | null)?.project_id;
  if (projectId) revalidatePath(`/context/${projectId}/billings`);

  return {};
}

export async function deleteBilling(
  id: string,
  projectId?: string | null
): Promise<{ error?: string }> {
  const user = await requireAuth();
  const supabase = await createClient();

  if (projectId) {
    await requireCan(user.id, 'billings.delete', { type: 'billing', projectId });
  }

  let deleteQuery = (supabase as any)
    .from('billings')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (projectId) {
    deleteQuery = deleteQuery.eq('project_id', projectId);
  }

  const { error } = await deleteQuery;

  if (error) {
    captureWithContext(error, {
      module: 'billings',
      action: 'deleteBilling',
      userIntent: 'Delete a billing entry',
      expected: 'Billing row deleted',
    });
    return { error: error.message };
  }

  revalidateBillingPaths(projectId);
  return {};
}
