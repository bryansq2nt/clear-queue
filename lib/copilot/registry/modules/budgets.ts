import { captureWithContext } from '@/lib/sentry';
import type {
  BudgetProposalPayload,
  UpdateBudgetPayload,
  DeleteBudgetPayload,
  BudgetCategoryProposalPayload,
  UpdateBudgetCategoryPayload,
  DeleteBudgetCategoryPayload,
  BudgetItemProposalPayload,
  UpdateBudgetItemPayload,
  DeleteBudgetItemPayload,
} from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

const BUDGET_ITEM_STATUSES = new Set(['pending', 'quoted', 'acquired']);

// ─── Context fetcher ──────────────────────────────────────────────────────────

export async function fetchBudgetsContext(
  projectId: string,
  scope: 'standard' | 'full',
  supabase: any
): Promise<string> {
  // 1. Fetch budgets for this project
  const { data: budgetsData } = await supabase
    .from('budgets')
    .select('id, name')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  const budgets = (budgetsData ?? []) as { id: string; name: string }[];
  if (budgets.length === 0) return '## Budgets\n- No budgets yet.';

  const budgetIds = budgets.map((b) => b.id);

  // 2. Fetch categories for those budgets (id, budget_id, name for full)
  const { data: categoriesData } = await supabase
    .from('budget_categories')
    .select('id, budget_id, name')
    .in('budget_id', budgetIds)
    .order('sort_order', { ascending: true });

  const categories = (categoriesData ?? []) as {
    id: string;
    budget_id: string;
    name: string;
  }[];
  const categoryIds = categories.map((c) => c.id);

  // 3. Fetch items for those categories
  type ItemRow = {
    id: string;
    category_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    status: string;
  };
  let items: ItemRow[] = [];
  if (categoryIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('budget_items')
      .select('id, category_id, name, quantity, unit_price, status')
      .in('category_id', categoryIds)
      .order('sort_order', { ascending: true });
    items = (itemsData ?? []) as ItemRow[];
  }

  // Build category_id → budget_id map
  const catToBudget = new Map<string, string>(
    categories.map((c) => [c.id, c.budget_id])
  );

  // Aggregate totals per budget
  const totals = new Map<string, { total: number; acquired: number }>();
  for (const b of budgets) totals.set(b.id, { total: 0, acquired: 0 });

  for (const item of items) {
    const budgetId = catToBudget.get(item.category_id);
    if (!budgetId) continue;
    const cur = totals.get(budgetId);
    if (!cur) continue;
    const amount =
      (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    cur.total += amount;
    if (item.status === 'acquired') cur.acquired += amount;
  }

  const fmt = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  if (scope === 'standard') {
    const lines = budgets.map((b) => {
      const { total, acquired } = totals.get(b.id) ?? { total: 0, acquired: 0 };
      const pending = total - acquired;
      if (total === 0) return `- ${b.name}: no items yet`;
      return `- ${b.name}: ${fmt(total)} total · ${fmt(acquired)} acquired · ${fmt(pending)} pending`;
    });
    return `## Budgets (${budgets.length} total)\n${lines.join('\n')}`;
  }

  // Full scope: hierarchy with IDs for budget_id, category_id, entity_id (items)
  const lines: string[] = [];
  for (const b of budgets) {
    const { total, acquired } = totals.get(b.id) ?? { total: 0, acquired: 0 };
    const pending = total - acquired;
    const budgetLine =
      total === 0
        ? `- [${b.id}] ${b.name}: no items yet`
        : `- [${b.id}] ${b.name}: ${fmt(total)} total · ${fmt(acquired)} acquired · ${fmt(pending)} pending`;
    lines.push(budgetLine);

    const budgetCats = categories.filter((c) => c.budget_id === b.id);
    if (budgetCats.length > 0) {
      lines.push(
        `  Categories: ${budgetCats.map((c) => `[${c.id}] ${c.name}`).join(', ')}`
      );
    }

    const budgetItems = items.filter(
      (i) => catToBudget.get(i.category_id) === b.id
    );
    if (budgetItems.length > 0) {
      const itemParts = budgetItems.map((i) => {
        const qty = Number(i.quantity) || 0;
        const price = Number(i.unit_price) || 0;
        const amt = qty * price;
        if (qty !== 1 || price === 0)
          return `[${i.id}] ${i.name} (${qty} × ${fmt(price)})`;
        return `[${i.id}] ${i.name} · ${fmt(amt)}`;
      });
      lines.push(`  Items: ${itemParts.join(', ')}`);
    }
  }

  return `## Budgets (${budgets.length} total)\n${lines.join('\n')}`;
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateBudgetShape(
  item: unknown
): BudgetProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  return {
    type: 'budget',
    name: obj.name.trim(),
    description:
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null,
  };
}

export function validateUpdateBudgetShape(
  item: unknown
): UpdateBudgetPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  const result: UpdateBudgetPayload = {
    type: 'update_budget',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.name === 'string' && obj.name.trim())
    result.name = obj.name.trim();
  if (obj.description !== undefined)
    result.description =
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null;
  if (obj.project_id !== undefined)
    result.project_id = isValidUuid(obj.project_id)
      ? (obj.project_id as string).trim()
      : null;
  return result;
}

export function validateDeleteBudgetShape(
  item: unknown
): DeleteBudgetPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_budget',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateBudgetCategoryShape(
  item: unknown
): BudgetCategoryProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.budget_id)) return null;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  return {
    type: 'budget_category',
    budget_id: (obj.budget_id as string).trim(),
    name: obj.name.trim(),
    description:
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null,
  };
}

export function validateUpdateBudgetCategoryShape(
  item: unknown
): UpdateBudgetCategoryPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  const result: UpdateBudgetCategoryPayload = {
    type: 'update_budget_category',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.name === 'string' && obj.name.trim())
    result.name = obj.name.trim();
  if (obj.description !== undefined)
    result.description =
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null;
  return result;
}

export function validateDeleteBudgetCategoryShape(
  item: unknown
): DeleteBudgetCategoryPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_budget_category',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateBudgetItemShape(
  item: unknown
): BudgetItemProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.category_id)) return null;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  const quantity =
    typeof obj.quantity === 'number' &&
    isFinite(obj.quantity) &&
    obj.quantity > 0
      ? obj.quantity
      : undefined;
  const unit_price =
    typeof obj.unit_price === 'number' &&
    isFinite(obj.unit_price) &&
    obj.unit_price >= 0
      ? obj.unit_price
      : undefined;
  const status =
    typeof obj.status === 'string' && BUDGET_ITEM_STATUSES.has(obj.status)
      ? (obj.status as 'pending' | 'quoted' | 'acquired')
      : undefined;
  return {
    type: 'budget_item',
    category_id: (obj.category_id as string).trim(),
    name: obj.name.trim(),
    description:
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null,
    quantity,
    unit_price,
    link:
      typeof obj.link === 'string' && obj.link.trim() ? obj.link.trim() : null,
    status,
    notes: typeof obj.notes === 'string' ? obj.notes.trim() || null : null,
  };
}

export function validateUpdateBudgetItemShape(
  item: unknown
): UpdateBudgetItemPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  const result: UpdateBudgetItemPayload = {
    type: 'update_budget_item',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.name === 'string' && obj.name.trim())
    result.name = obj.name.trim();
  if (obj.description !== undefined)
    result.description =
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null;
  if (
    typeof obj.quantity === 'number' &&
    isFinite(obj.quantity) &&
    obj.quantity > 0
  )
    result.quantity = obj.quantity;
  if (
    typeof obj.unit_price === 'number' &&
    isFinite(obj.unit_price) &&
    obj.unit_price >= 0
  )
    result.unit_price = obj.unit_price;
  if (obj.link !== undefined)
    result.link =
      typeof obj.link === 'string' && obj.link.trim() ? obj.link.trim() : null;
  if (typeof obj.status === 'string' && BUDGET_ITEM_STATUSES.has(obj.status))
    result.status = obj.status as UpdateBudgetItemPayload['status'];
  if (obj.notes !== undefined)
    result.notes =
      typeof obj.notes === 'string' ? obj.notes.trim() || null : null;
  return result;
}

export function validateDeleteBudgetItemShape(
  item: unknown
): DeleteBudgetItemPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_budget_item',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveBudget(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as BudgetProposalPayload;
  const { data, error } = await (ctx.supabase as any)
    .from('budgets')
    .insert({
      owner_id: ctx.userId,
      project_id: ctx.projectId,
      name: p.name,
      description: p.description ?? null,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveBudget',
      userIntent: 'Create a budget via copilot proposal',
      expected: 'Budget row inserted',
      extra: { projectId: ctx.projectId },
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveUpdateBudget(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateBudgetPayload;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (p.name !== undefined) updates.name = p.name.trim();
  if (p.description !== undefined) updates.description = p.description ?? null;
  if (p.project_id !== undefined) updates.project_id = p.project_id ?? null;
  if (Object.keys(updates).length <= 1) return { entityId: p.entity_id };

  const { error } = await (ctx.supabase as any)
    .from('budgets')
    .update(updates)
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveUpdateBudget',
      userIntent: 'Update budget via copilot proposal',
      expected: 'Budget row updated',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveDeleteBudget(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteBudgetPayload;
  const { error } = await (ctx.supabase as any)
    .from('budgets')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteBudget',
      userIntent: 'Delete budget via copilot proposal',
      expected: 'Budget row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveBudgetCategory(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as BudgetCategoryProposalPayload;
  const { data: budgetRow } = await (ctx.supabase as any)
    .from('budgets')
    .select('id')
    .eq('id', p.budget_id)
    .eq('owner_id', ctx.userId)
    .single();
  if (!budgetRow) {
    return { error: 'Budget not found or access denied' };
  }

  const { data: maxRow } = await (ctx.supabase as any)
    .from('budget_categories')
    .select('sort_order')
    .eq('budget_id', p.budget_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  const nextOrder =
    ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await (ctx.supabase as any)
    .from('budget_categories')
    .insert({
      budget_id: p.budget_id,
      name: p.name,
      description: p.description ?? null,
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveBudgetCategory',
      userIntent: 'Create budget category via copilot proposal',
      expected: 'Budget category row inserted',
      extra: { budgetId: p.budget_id },
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveUpdateBudgetCategory(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateBudgetCategoryPayload;
  const updates: Record<string, unknown> = {};
  if (p.name !== undefined) updates.name = p.name.trim();
  if (p.description !== undefined) updates.description = p.description ?? null;
  if (Object.keys(updates).length === 0) return { entityId: p.entity_id };

  const { error } = await (ctx.supabase as any)
    .from('budget_categories')
    .update(updates)
    .eq('id', p.entity_id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveUpdateBudgetCategory',
      userIntent: 'Update budget category via copilot proposal',
      expected: 'Budget category row updated',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveDeleteBudgetCategory(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteBudgetCategoryPayload;
  const { error } = await (ctx.supabase as any)
    .from('budget_categories')
    .delete()
    .eq('id', p.entity_id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteBudgetCategory',
      userIntent: 'Delete budget category via copilot proposal',
      expected: 'Budget category row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveBudgetItem(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as BudgetItemProposalPayload;
  const { data: catRow } = await (ctx.supabase as any)
    .from('budget_categories')
    .select('id, budget_id')
    .eq('id', p.category_id)
    .single();
  if (!catRow) {
    return { error: 'Category not found' };
  }
  const { data: budgetRow } = await (ctx.supabase as any)
    .from('budgets')
    .select('id')
    .eq('id', (catRow as { budget_id: string }).budget_id)
    .eq('owner_id', ctx.userId)
    .single();
  if (!budgetRow) {
    return { error: 'Budget not found or access denied' };
  }

  const { data: maxRow } = await (ctx.supabase as any)
    .from('budget_items')
    .select('sort_order')
    .eq('category_id', p.category_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  const nextOrder =
    ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await (ctx.supabase as any)
    .from('budget_items')
    .insert({
      category_id: p.category_id,
      name: p.name,
      description: p.description ?? null,
      quantity: p.quantity ?? 1,
      unit_price: p.unit_price ?? 0,
      link: p.link ?? null,
      status: p.status ?? 'pending',
      notes: p.notes ?? null,
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveBudgetItem',
      userIntent: 'Create budget item via copilot proposal',
      expected: 'Budget item row inserted',
      extra: { categoryId: p.category_id },
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveUpdateBudgetItem(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateBudgetItemPayload;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (p.name !== undefined) updates.name = p.name.trim();
  if (p.description !== undefined) updates.description = p.description ?? null;
  if (typeof p.quantity === 'number' && p.quantity > 0)
    updates.quantity = p.quantity;
  if (typeof p.unit_price === 'number' && p.unit_price >= 0)
    updates.unit_price = p.unit_price;
  if (p.link !== undefined) updates.link = p.link ?? null;
  if (p.status !== undefined) updates.status = p.status;
  if (p.notes !== undefined) updates.notes = p.notes ?? null;
  if (Object.keys(updates).length <= 1) return { entityId: p.entity_id };

  const { error } = await (ctx.supabase as any)
    .from('budget_items')
    .update(updates)
    .eq('id', p.entity_id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveUpdateBudgetItem',
      userIntent: 'Update budget item via copilot proposal',
      expected: 'Budget item row updated',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveDeleteBudgetItem(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteBudgetItemPayload;
  const { error } = await (ctx.supabase as any)
    .from('budget_items')
    .delete()
    .eq('id', p.entity_id);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteBudgetItem',
      userIntent: 'Delete budget item via copilot proposal',
      expected: 'Budget item row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

const revalidateBudgetPaths = (projectId: string) => [
  '/budgets',
  '/context',
  `/context/${projectId}/budgets`,
];

export const budgetsCapabilities: CopilotModuleCapability[] = [
  {
    type: 'budget',
    module: 'budgets',
    label: 'copilot.proposal_budget',
    icon: 'Wallet',
    cardVariant: 'create',
    promptDescription: 'Create a new budget for the project',
    examplePayload: {
      type: 'budget',
      name: 'Q2 Marketing',
      description: 'Budget for Q2 marketing campaigns',
    },
    validate: validateBudgetShape,
    approve: approveBudget,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'update_budget',
    module: 'budgets',
    label: 'copilot.proposal_update_budget',
    icon: 'Pencil',
    cardVariant: 'update',
    promptDescription:
      'Update name, description or project of a budget by entity_id',
    examplePayload: {
      type: 'update_budget',
      entity_id: '<uuid>',
      entity_title: 'Party $2k',
      name: 'Party - $2,000',
    },
    validate: validateUpdateBudgetShape,
    approve: approveUpdateBudget,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'delete_budget',
    module: 'budgets',
    label: 'copilot.proposal_delete_budget',
    icon: 'Trash2',
    cardVariant: 'delete',
    promptDescription: 'Delete a budget by entity_id',
    examplePayload: {
      type: 'delete_budget',
      entity_id: '<uuid>',
      entity_title: 'Old budget',
    },
    validate: validateDeleteBudgetShape,
    approve: approveDeleteBudget,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'budget_category',
    module: 'budgets',
    label: 'copilot.proposal_budget_category',
    icon: 'Folder',
    cardVariant: 'create',
    promptDescription:
      'Create a category inside a budget (budget_id from Budgets section in full scope)',
    examplePayload: {
      type: 'budget_category',
      budget_id: '<uuid>',
      name: 'Furniture',
      description: 'Tables and chairs',
    },
    validate: validateBudgetCategoryShape,
    approve: approveBudgetCategory,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'update_budget_category',
    module: 'budgets',
    label: 'copilot.proposal_update_budget_category',
    icon: 'Pencil',
    cardVariant: 'update',
    promptDescription: 'Update a budget category by entity_id',
    examplePayload: {
      type: 'update_budget_category',
      entity_id: '<uuid>',
      entity_title: 'Furniture',
      name: 'Furniture & Rentals',
    },
    validate: validateUpdateBudgetCategoryShape,
    approve: approveUpdateBudgetCategory,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'delete_budget_category',
    module: 'budgets',
    label: 'copilot.proposal_delete_budget_category',
    icon: 'Trash2',
    cardVariant: 'delete',
    promptDescription: 'Delete a budget category by entity_id',
    examplePayload: {
      type: 'delete_budget_category',
      entity_id: '<uuid>',
      entity_title: 'Legacy category',
    },
    validate: validateDeleteBudgetCategoryShape,
    approve: approveDeleteBudgetCategory,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'budget_item',
    module: 'budgets',
    label: 'copilot.proposal_budget_item',
    icon: 'ListTodo',
    cardVariant: 'create',
    promptDescription:
      'Create an item inside a budget category (category_id from Budgets section in full scope)',
    examplePayload: {
      type: 'budget_item',
      category_id: '<uuid>',
      name: 'Tables (10 units)',
      quantity: 10,
      unit_price: 20,
      status: 'pending',
    },
    validate: validateBudgetItemShape,
    approve: approveBudgetItem,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'update_budget_item',
    module: 'budgets',
    label: 'copilot.proposal_update_budget_item',
    icon: 'Pencil',
    cardVariant: 'update',
    promptDescription: 'Update a budget item by entity_id',
    examplePayload: {
      type: 'update_budget_item',
      entity_id: '<uuid>',
      entity_title: 'Tables',
      unit_price: 25,
    },
    validate: validateUpdateBudgetItemShape,
    approve: approveUpdateBudgetItem,
    revalidatePaths: revalidateBudgetPaths,
  },
  {
    type: 'delete_budget_item',
    module: 'budgets',
    label: 'copilot.proposal_delete_budget_item',
    icon: 'Trash2',
    cardVariant: 'delete',
    promptDescription: 'Delete a budget item by entity_id',
    examplePayload: {
      type: 'delete_budget_item',
      entity_id: '<uuid>',
      entity_title: 'Obsolete item',
    },
    validate: validateDeleteBudgetItemShape,
    approve: approveDeleteBudgetItem,
    revalidatePaths: revalidateBudgetPaths,
  },
];
