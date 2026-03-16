import { captureWithContext } from '@/lib/sentry';
import type {
  BillingProposalPayload,
  UpdateBillingPayload,
  DeleteBillingPayload,
  BillingCategoryProposalPayload,
  UpdateBillingCategoryPayload,
  DeleteBillingCategoryPayload,
} from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const VALID_STATUSES = new Set(['pending', 'paid', 'overdue', 'cancelled']);
const VALID_TYPES = new Set(['charge', 'payment', 'spending']);
const VALID_METHODS = new Set([
  'cash',
  'transfer',
  'card',
  'client_card',
  'other',
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

// ─── Category name → id resolution ───────────────────────────────────────────

async function resolveCategoryId(
  categoryName: string | null | undefined,
  userId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  if (!categoryName?.trim()) return null;
  const { data } = await (supabase as any)
    .from('billing_categories')
    .select('id')
    .eq('owner_id', userId)
    .ilike('name', categoryName.trim())
    .limit(1)
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateBillingShape(
  item: unknown
): BillingProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
  const amount = Number(obj.amount);
  if (!isFinite(amount) || amount < 0) return null;

  return {
    type: 'billing',
    title: obj.title.trim(),
    amount,
    billing_type:
      typeof obj.billing_type === 'string' && VALID_TYPES.has(obj.billing_type)
        ? (obj.billing_type as 'charge' | 'payment' | 'spending')
        : 'charge',
    status:
      typeof obj.status === 'string' && VALID_STATUSES.has(obj.status)
        ? (obj.status as BillingProposalPayload['status'])
        : 'pending',
    client_name:
      typeof obj.client_name === 'string' ? obj.client_name.trim() : null,
    due_date: typeof obj.due_date === 'string' ? obj.due_date : null,
    issued_at: typeof obj.issued_at === 'string' ? obj.issued_at : null,
    category_name:
      typeof obj.category_name === 'string' ? obj.category_name : null,
    payment_method:
      typeof obj.payment_method === 'string' &&
      VALID_METHODS.has(obj.payment_method)
        ? obj.payment_method
        : null,
    notes: typeof obj.notes === 'string' ? obj.notes.trim() : null,
  };
}

export function validateUpdateBillingShape(
  item: unknown
): UpdateBillingPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;

  const result: UpdateBillingPayload = {
    type: 'update_billing',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };

  if (typeof obj.title === 'string' && obj.title.trim())
    result.title = obj.title.trim();
  if (typeof obj.amount === 'number' && isFinite(obj.amount) && obj.amount >= 0)
    result.amount = obj.amount;
  if (typeof obj.status === 'string' && VALID_STATUSES.has(obj.status))
    result.status = obj.status as UpdateBillingPayload['status'];
  if (typeof obj.billing_type === 'string' && VALID_TYPES.has(obj.billing_type))
    result.billing_type =
      obj.billing_type as UpdateBillingPayload['billing_type'];
  if (obj.due_date !== undefined)
    result.due_date = typeof obj.due_date === 'string' ? obj.due_date : null;
  if (obj.issued_at !== undefined)
    result.issued_at = typeof obj.issued_at === 'string' ? obj.issued_at : null;
  if (obj.category_name !== undefined)
    result.category_name =
      typeof obj.category_name === 'string' ? obj.category_name : null;
  if (
    typeof obj.payment_method === 'string' &&
    VALID_METHODS.has(obj.payment_method)
  )
    result.payment_method = obj.payment_method;
  if (obj.notes !== undefined)
    result.notes = typeof obj.notes === 'string' ? obj.notes.trim() : null;

  return result;
}

export function validateDeleteBillingShape(
  item: unknown
): DeleteBillingPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_billing',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateBillingCategoryShape(
  item: unknown
): BillingCategoryProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  const name = obj.name.trim();
  if (name.length > 200) return null;
  return {
    type: 'billing_category',
    name,
    color:
      typeof obj.color === 'string' && obj.color.trim()
        ? obj.color.trim()
        : null,
  };
}

export function validateUpdateBillingCategoryShape(
  item: unknown
): UpdateBillingCategoryPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  const result: UpdateBillingCategoryPayload = {
    type: 'update_billing_category',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.name === 'string' && obj.name.trim())
    result.name = obj.name.trim();
  if (obj.color !== undefined)
    result.color =
      typeof obj.color === 'string' && obj.color.trim()
        ? obj.color.trim()
        : null;
  return result;
}

export function validateDeleteBillingCategoryShape(
  item: unknown
): DeleteBillingCategoryPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_billing_category',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveBilling(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as BillingProposalPayload;
  const categoryId = await resolveCategoryId(
    p.category_name,
    ctx.userId,
    ctx.supabase
  );

  const { data, error } = await (ctx.supabase as any)
    .from('billings')
    .insert({
      owner_id: ctx.userId,
      project_id: ctx.projectId,
      title: p.title,
      amount: p.amount,
      currency: 'USD',
      type: p.billing_type ?? 'charge',
      status: p.status ?? 'pending',
      client_name: p.client_name ?? null,
      due_date: p.due_date ?? null,
      issued_at: p.issued_at ?? null,
      category_id: categoryId,
      payment_method: p.payment_method ?? null,
      notes: p.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveBilling',
      userIntent: 'Create billing entry via copilot proposal',
      expected: 'New billing row inserted',
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveUpdateBilling(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateBillingPayload;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (p.title) updates.title = p.title;
  if (p.amount !== undefined) updates.amount = p.amount;
  if (p.status) {
    updates.status = p.status;
    updates.paid_at = p.status === 'paid' ? new Date().toISOString() : null;
  }
  if (p.billing_type) updates.type = p.billing_type;
  if (p.due_date !== undefined) updates.due_date = p.due_date;
  if (p.issued_at !== undefined) updates.issued_at = p.issued_at;
  if (p.payment_method !== undefined) updates.payment_method = p.payment_method;
  if (p.notes !== undefined) updates.notes = p.notes;
  if (p.category_name !== undefined) {
    updates.category_id = await resolveCategoryId(
      p.category_name,
      ctx.userId,
      ctx.supabase
    );
  }

  const { error } = await (ctx.supabase as any)
    .from('billings')
    .update(updates)
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveUpdateBilling',
      userIntent: 'Update billing entry via copilot proposal',
      expected: 'Billing row updated',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveDeleteBilling(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteBillingPayload;
  const { error } = await (ctx.supabase as any)
    .from('billings')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteBilling',
      userIntent: 'Delete billing entry via copilot proposal',
      expected: 'Billing row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveBillingCategory(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as BillingCategoryProposalPayload;
  const { data: maxRow } = await (ctx.supabase as any)
    .from('billing_categories')
    .select('sort_order')
    .eq('owner_id', ctx.userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  const nextOrder =
    ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await (ctx.supabase as any)
    .from('billing_categories')
    .insert({
      owner_id: ctx.userId,
      name: p.name,
      color: p.color ?? null,
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveBillingCategory',
      userIntent: 'Create billing category via copilot proposal',
      expected: 'New billing category row inserted',
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveUpdateBillingCategory(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateBillingCategoryPayload;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (p.name !== undefined) updates.name = p.name.trim();
  if (p.color !== undefined) updates.color = p.color || null;

  if (Object.keys(updates).length <= 1) {
    return { entityId: p.entity_id };
  }

  const { error } = await (ctx.supabase as any)
    .from('billing_categories')
    .update(updates)
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveUpdateBillingCategory',
      userIntent: 'Update billing category via copilot proposal',
      expected: 'Billing category row updated',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveDeleteBillingCategory(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteBillingCategoryPayload;
  const { error } = await (ctx.supabase as any)
    .from('billing_categories')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteBillingCategory',
      userIntent: 'Delete billing category via copilot proposal',
      expected: 'Billing category row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

// ─── Context fetcher ──────────────────────────────────────────────────────────

/**
 * @param ownerFilter  null = project scope (no owner filter);
 *                     string[] = restrict to these owner IDs (own or team scope).
 *                     Resolved by buildProjectContext before this call.
 */
export async function fetchBillingsContext(
  projectId: string,
  scope: 'standard' | 'full',
  supabase: ReturnType<
    typeof import('@/lib/supabase/server').createClient
  > extends Promise<infer T>
    ? T
    : never,
  ownerFilter: string[] | null
): Promise<string> {
  // Fetch available billing categories (owner-scoped via RLS) so the model can use exact names in category_name and ids for update/delete
  const { data: categoryRows } = await (supabase as any)
    .from('billing_categories')
    .select('id, name')
    .order('sort_order', { ascending: true });

  const categoryRowsTyped =
    (categoryRows as Array<{ id: string; name: string }> | null) ?? [];
  const categoryNames = categoryRowsTyped.map((c) => c.name);
  let categoriesSection =
    categoryNames.length > 0
      ? `\n**Available billing categories (use exactly one of these names in category_name when creating or updating billings):** ${categoryNames.join(', ')}\n`
      : '\n**Available billing categories:** None yet. Omit category_name or the user can create categories in the Billing module.\n';
  if (scope === 'full' && categoryRowsTyped.length > 0) {
    categoriesSection += `**Category ids for update/delete:** ${categoryRowsTyped.map((c) => `[${c.id}] ${c.name}`).join(', ')}\n`;
  }

  let billingsQuery = (supabase as any)
    .from('billings')
    .select(
      'id, title, amount, status, type, due_date, category_id, billing_categories(name)'
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (ownerFilter !== null) {
    billingsQuery =
      ownerFilter.length === 1
        ? billingsQuery.eq('owner_id', ownerFilter[0])
        : billingsQuery.in('owner_id', ownerFilter);
  }

  const { data } = await billingsQuery;

  const rows =
    (data as Array<{
      id: string;
      title: string;
      amount: number;
      status: string;
      type: string;
      due_date: string | null;
      category_id: string | null;
      billing_categories: { name: string } | null;
    }>) ?? [];

  const billingsIntro = `## Billings${categoriesSection}`;
  if (rows.length === 0) return billingsIntro + '- No billing entries yet.';

  if (scope === 'standard') {
    const totals = rows.reduce(
      (acc, b) => {
        const amt = Number(b.amount) || 0;
        if (b.status === 'paid') acc.paid += amt;
        if (b.status === 'pending') acc.pending += amt;
        if (b.status === 'overdue') acc.overdue += amt;
        acc.total += amt;
        return acc;
      },
      { total: 0, paid: 0, pending: 0, overdue: 0 }
    );

    const fmt = (n: number) =>
      '$' +
      n.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

    const typeCount = rows.reduce(
      (acc, b) => {
        acc[b.type] = (acc[b.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const typeSummary = Object.entries(typeCount)
      .map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`)
      .join(', ');

    const recent = rows
      .slice(0, 5)
      .map((b) => `"${b.title}"`)
      .join(', ');

    return (
      billingsIntro +
      `${rows.length} billings — ${fmt(totals.paid)} paid · ${fmt(totals.pending)} pending · ${fmt(totals.overdue)} overdue\n` +
      `Types: ${typeSummary}\n` +
      `Recent: ${recent}`
    );
  }

  // Full mode — include IDs for proposals
  const lines = rows.map((b) => {
    const amt =
      '$' +
      Number(b.amount).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    const due = b.due_date ? ` · due ${b.due_date}` : '';
    const cat = b.billing_categories
      ? ` · category: ${b.billing_categories.name}`
      : '';
    return `- [${b.id}] ${b.title} · ${b.type} · ${amt} · ${b.status}${due}${cat}`;
  });

  return `${billingsIntro}${rows.length} total\n${lines.join('\n')}`;
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const billingsCapabilities: CopilotModuleCapability[] = [
  {
    type: 'billing',
    module: 'billings',
    label: 'copilot.proposal_billing',
    icon: 'Receipt',
    cardVariant: 'create',
    requiredAction: 'billings.create',
    promptDescription:
      'Create a new billing entry (charge, payment, or spending)',
    examplePayload: {
      type: 'billing',
      title: 'Website retainer - March',
      amount: 2000,
      billing_type: 'charge',
      status: 'pending',
      client_name: 'Acme Corp',
      due_date: '2026-03-31',
      category_name: 'Services',
    },
    validate: validateBillingShape,
    approve: approveBilling,
    revalidatePaths: (projectId) => [
      '/billings',
      `/context/${projectId}/billings`,
    ],
  },
  {
    type: 'update_billing',
    module: 'billings',
    label: 'copilot.proposal_update_billing',
    icon: 'Pencil',
    cardVariant: 'update',
    requiredAction: 'billings.update_description',
    promptDescription: 'Update fields of an existing billing by its entity_id',
    examplePayload: {
      type: 'update_billing',
      entity_id: '<uuid>',
      entity_title: 'Website retainer',
      status: 'paid',
    },
    validate: validateUpdateBillingShape,
    approve: approveUpdateBilling,
    revalidatePaths: (projectId) => [
      '/billings',
      `/context/${projectId}/billings`,
    ],
  },
  {
    type: 'delete_billing',
    module: 'billings',
    label: 'copilot.proposal_delete_billing',
    icon: 'Trash2',
    cardVariant: 'delete',
    requiredAction: 'billings.delete',
    promptDescription: 'Delete an existing billing entry by its entity_id',
    examplePayload: {
      type: 'delete_billing',
      entity_id: '<uuid>',
      entity_title: 'Website retainer',
    },
    validate: validateDeleteBillingShape,
    approve: approveDeleteBilling,
    revalidatePaths: (projectId) => [
      '/billings',
      `/context/${projectId}/billings`,
    ],
  },
  {
    type: 'billing_category',
    module: 'billings',
    label: 'copilot.proposal_billing_category',
    icon: 'Folder',
    cardVariant: 'create',
    requiredAction: 'billings.manage_categories',
    promptDescription:
      'Create a new billing category (name required, color optional)',
    examplePayload: {
      type: 'billing_category',
      name: 'Infrastructure',
      color: '#3b82f6',
    },
    validate: validateBillingCategoryShape,
    approve: approveBillingCategory,
    revalidatePaths: (projectId) => [
      '/billings',
      `/context/${projectId}/billings`,
    ],
  },
  {
    type: 'update_billing_category',
    module: 'billings',
    label: 'copilot.proposal_update_billing_category',
    icon: 'Pencil',
    cardVariant: 'update',
    requiredAction: 'billings.manage_categories',
    promptDescription:
      'Update name or color of an existing billing category by entity_id (ids listed in Billings section in full scope)',
    examplePayload: {
      type: 'update_billing_category',
      entity_id: '<uuid>',
      entity_title: 'Office',
      name: 'Office & Admin',
      color: '#10b981',
    },
    validate: validateUpdateBillingCategoryShape,
    approve: approveUpdateBillingCategory,
    revalidatePaths: (projectId) => [
      '/billings',
      `/context/${projectId}/billings`,
    ],
  },
  {
    type: 'delete_billing_category',
    module: 'billings',
    label: 'copilot.proposal_delete_billing_category',
    icon: 'Trash2',
    cardVariant: 'delete',
    requiredAction: 'billings.manage_categories',
    promptDescription:
      'Delete an existing billing category by entity_id (ids listed in Billings section in full scope)',
    examplePayload: {
      type: 'delete_billing_category',
      entity_id: '<uuid>',
      entity_title: 'Legacy',
    },
    validate: validateDeleteBillingCategoryShape,
    approve: approveDeleteBillingCategory,
    revalidatePaths: (projectId) => [
      '/billings',
      `/context/${projectId}/billings`,
    ],
  },
];
