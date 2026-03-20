'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan, getGrantedActions } from '@/lib/rbac/resolver';
import { getReadScope, getTeamMemberIds } from '@/lib/rbac/read-scope';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type Budget = Database['public']['Tables']['budgets']['Row'];

// ============================================
// GET ALL BUDGETS
// ============================================
export const getBudgets = cache(async () => {
  await requireAuth();
  const supabase = await createClient();

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select(
      'id, project_id, name, description, owner_id, created_at, updated_at'
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching budgets:', error);
    return [];
  }

  if (!budgets || budgets.length === 0) {
    return [];
  }

  // Type assertion for budgets
  const budgetsData = budgets as Budget[];

  // Get unique project IDs
  const projectIds = budgetsData
    .map((b) => b.project_id)
    .filter((id): id is string => id !== null);

  // Fetch projects if there are any
  let projectsMap: Record<string, { id: string; name: string }> = {};
  if (projectIds.length > 0) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);

    if (projects) {
      // Type assertion for projects
      const projectsData = projects as { id: string; name: string }[];
      projectsMap = projectsData.reduce(
        (acc, p) => {
          acc[p.id] = { id: p.id, name: p.name };
          return acc;
        },
        {} as Record<string, { id: string; name: string }>
      );
    }
  }

  // Combine budgets with projects
  return budgetsData.map((budget) => ({
    ...budget,
    projects: budget.project_id ? projectsMap[budget.project_id] || null : null,
  })) as (Budget & { projects: { id: string; name: string } | null })[];
});

// ============================================
// GET BUDGETS BY PROJECT (for context view)
// ============================================
export const getBudgetsByProjectId = cache(
  async (
    projectId: string
  ): Promise<
    (Budget & { projects: { id: string; name: string } | null })[]
  > => {
    const user = await requireAuth();
    const supabase = await createClient();

    const scope = await getReadScope(user.id, projectId, 'budgets');

    let budgetsQuery = supabase
      .from('budgets')
      .select(
        'id, project_id, name, description, owner_id, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (scope === 'own') {
      budgetsQuery = budgetsQuery.eq('owner_id', user.id);
    } else if (scope === 'team') {
      const teamIds = await getTeamMemberIds(user.id, projectId);
      budgetsQuery = budgetsQuery.in('owner_id', teamIds);
    }
    // scope === 'project': no owner filter

    const { data: budgets, error } = await budgetsQuery;

    if (error || !budgets?.length) return [];

    const budgetsData = budgets as Budget[];
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();

    const projectInfo = project
      ? {
          id: (project as { id: string }).id,
          name: (project as { name: string }).name,
        }
      : null;

    return budgetsData.map((budget) => ({
      ...budget,
      projects: projectInfo,
    })) as (Budget & { projects: { id: string; name: string } | null })[];
  }
);

// ============================================
// GET BUDGET PROJECT ID (for context validation)
// ============================================
export const getBudgetProjectId = cache(
  async (budgetId: string): Promise<string | null> => {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('budgets')
      .select('project_id')
      .eq('id', budgetId)
      .single();
    if (error || !data) return null;
    return (data as { project_id: string | null }).project_id;
  }
);

// ============================================
// GET BUDGET STATS (para cards)
// ============================================
export async function getBudgetStats(budgetId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  // Verify this budget belongs to the requesting user before reading anything
  const { data: budget } = await supabase
    .from('budgets')
    .select('id')
    .eq('id', budgetId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!budget) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: 0,
      progress: 0,
    };
  }

  // Get all items for this budget through categories
  const { data: categories, error: categoriesError } = await supabase
    .from('budget_categories')
    .select('id')
    .eq('budget_id', budgetId);

  if (categoriesError || !categories || categories.length === 0) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: 0,
      progress: 0,
    };
  }

  // Type assertion for categories
  const categoriesData = categories as { id: string }[];
  const categoryIds = categoriesData.map((c) => c.id);

  // If no categories, return early
  if (categoryIds.length === 0) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: categoriesData.length,
      progress: 0,
    };
  }

  const { data: items, error: itemsError } = await supabase
    .from('budget_items')
    .select('quantity, unit_price, status')
    .in('category_id', categoryIds);

  if (itemsError || !items) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: categoriesData.length,
      progress: 0,
    };
  }

  // Type assertion for items
  const itemsData = items as {
    quantity: number;
    unit_price: number;
    status: string;
  }[];

  const total = itemsData.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  const acquired = itemsData
    .filter((item) => item.status === 'acquired')
    .reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      return sum + qty * price;
    }, 0);

  const pending = total - acquired;
  const progress = total > 0 ? (acquired / total) * 100 : 0;

  return {
    total,
    acquired,
    pending,
    itemCount: itemsData.length,
    categoryCount: categoriesData.length,
    progress: Math.round(progress),
  };
}

// ============================================
// CREATE BUDGET
// ============================================
export async function createBudget(formData: {
  name: string;
  description?: string;
  project_id?: string;
}) {
  const user = await requireAuth();
  const supabase = await createClient();

  if (formData.project_id) {
    await requireCan(user.id, 'budgets.create', {
      type: 'budget',
      projectId: formData.project_id,
    });
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      name: formData.name,
      description: formData.description || null,
      project_id: formData.project_id || null,
      owner_id: user.id,
    } as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating budget:', error);
    throw new Error('Failed to create budget');
  }

  revalidatePath('/budgets');
  revalidatePath('/context');
  return data;
}

// ============================================
// UPDATE BUDGET
// ============================================
export async function updateBudget(
  budgetId: string,
  formData: {
    name?: string;
    description?: string;
    project_id?: string;
  }
) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: budgetRow } = await (supabase as any)
    .from('budgets')
    .select('project_id')
    .eq('id', budgetId)
    .maybeSingle();
  const budgetProjectId = (budgetRow as { project_id?: string } | null)
    ?.project_id;
  if (budgetProjectId) {
    await requireCan(user.id, 'budgets.update', {
      type: 'budget',
      projectId: budgetProjectId,
    });
  }

  const updates: Database['public']['Tables']['budgets']['Update'] = {};
  if (formData.name !== undefined) updates.name = formData.name;
  if (formData.description !== undefined)
    updates.description = formData.description || null;
  if (formData.project_id !== undefined)
    updates.project_id = formData.project_id || null;

  const { data, error } = await supabase
    .from('budgets')
    .update(updates as never)
    .eq('id', budgetId)
    .select()
    .single();

  if (error) {
    console.error('Error updating budget:', error);
    throw new Error('Failed to update budget');
  }

  revalidatePath('/budgets');
  revalidatePath(`/budgets/${budgetId}`);
  revalidatePath('/context');
  return data;
}

// ============================================
// DELETE BUDGET
// ============================================
export async function deleteBudget(budgetId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: budgetRow } = await (supabase as any)
    .from('budgets')
    .select('project_id')
    .eq('id', budgetId)
    .maybeSingle();
  const budgetProjectId = (budgetRow as { project_id?: string } | null)
    ?.project_id;
  if (budgetProjectId) {
    await requireCan(user.id, 'budgets.delete', {
      type: 'budget',
      projectId: budgetProjectId,
    });
  }

  const { error } = await supabase.from('budgets').delete().eq('id', budgetId);

  if (error) {
    console.error('Error deleting budget:', error);
    throw new Error('Failed to delete budget');
  }

  revalidatePath('/budgets');
  revalidatePath('/context');
  return { success: true };
}

// ============================================
// DUPLICATE BUDGET (budget + categories + items)
// ============================================
export async function duplicateBudget(sourceBudgetId: string) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: budgetRow } = await (supabase as any)
    .from('budgets')
    .select('project_id')
    .eq('id', sourceBudgetId)
    .maybeSingle();
  const budgetProjectId = (budgetRow as { project_id?: string } | null)
    ?.project_id;
  if (budgetProjectId) {
    await requireCan(user.id, 'budgets.create', {
      type: 'budget',
      projectId: budgetProjectId,
    });
  }

  const { data: newBudgetId, error } = await supabase.rpc(
    'duplicate_budget_atomic' as never,
    {
      source_id: sourceBudgetId,
      new_name: '',
    } as never
  );

  if (error || !newBudgetId) {
    console.error('Error duplicating budget atomically:', error);
    throw new Error('Failed to duplicate budget');
  }

  revalidatePath('/budgets');
  revalidatePath(`/budgets/${newBudgetId}`);
  revalidatePath('/context');
  return { budgetId: newBudgetId };
}

// ---------------------------------------------------------------------------
// Budgets UI permissions
// ---------------------------------------------------------------------------

export type BudgetsPermissions = {
  canCreate: boolean;
  canDelete: boolean;
};

export async function getBudgetsPermissions(
  projectId: string
): Promise<BudgetsPermissions> {
  const user = await requireAuth();
  const supabase = await createClient();

  const allFalse: BudgetsPermissions = { canCreate: false, canDelete: false };
  if (!projectId?.trim()) return allFalse;

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.owner_id === user.id) {
    return { canCreate: true, canDelete: true };
  }

  const granted = await getGrantedActions(user.id, projectId, true);
  return {
    canCreate: granted.has('budgets.create'),
    canDelete: granted.has('budgets.delete'),
  };
}

// ============================================
// GET PROJECTS (para dropdown)
// ============================================
export const getProjects = cache(async () => {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('name');

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  // Type assertion for projects
  return (data || []) as { id: string; name: string }[];
});
