import { captureWithContext } from '@/lib/sentry';
import type { BudgetProposalPayload } from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

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

  // 2. Fetch categories for those budgets
  const { data: categoriesData } = await supabase
    .from('budget_categories')
    .select('id, budget_id')
    .in('budget_id', budgetIds);

  const categories = (categoriesData ?? []) as {
    id: string;
    budget_id: string;
  }[];
  const categoryIds = categories.map((c) => c.id);

  // 3. Fetch items for those categories
  let items: {
    category_id: string;
    quantity: number;
    unit_price: number;
    status: string;
  }[] = [];
  if (categoryIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('budget_items')
      .select('category_id, quantity, unit_price, status')
      .in('category_id', categoryIds);
    items = (itemsData ?? []) as typeof items;
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

  // Format — same for standard and full (no IDs needed, read-only)
  const fmt = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

  const lines = budgets.map((b) => {
    const { total, acquired } = totals.get(b.id) ?? { total: 0, acquired: 0 };
    const pending = total - acquired;
    if (total === 0) return `- ${b.name}: no items yet`;
    return `- ${b.name}: ${fmt(total)} total · ${fmt(acquired)} acquired · ${fmt(pending)} pending`;
  });

  const idLines =
    scope === 'full'
      ? budgets.map((b) => {
          const { total, acquired } = totals.get(b.id) ?? {
            total: 0,
            acquired: 0,
          };
          const pending = total - acquired;
          if (total === 0) return `- [${b.id}] ${b.name}: no items yet`;
          return `- [${b.id}] ${b.name}: ${fmt(total)} total · ${fmt(acquired)} acquired · ${fmt(pending)} pending`;
        })
      : lines;

  return `## Budgets (${budgets.length} total)\n${idLines.join('\n')}`;
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

// ─── Capabilities ─────────────────────────────────────────────────────────────

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
    revalidatePaths: (projectId) => [
      '/budgets',
      '/context',
      `/context/${projectId}/budgets`,
    ],
  },
];
