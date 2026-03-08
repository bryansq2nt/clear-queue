// Context-only module — no proposal types.
// Budget data is read-only; the Copilot uses it for cost-aware planning recommendations.

// ─── Context fetcher ──────────────────────────────────────────────────────────

export async function fetchBudgetsContext(
  projectId: string,
  _scope: 'standard' | 'full',
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

  return `## Budgets (${budgets.length} total)\n${lines.join('\n')}`;
}
