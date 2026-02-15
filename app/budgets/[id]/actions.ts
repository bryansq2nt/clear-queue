'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

type BudgetCategory = Database['public']['Tables']['budget_categories']['Row'];
type BudgetCategoryInsert =
  Database['public']['Tables']['budget_categories']['Insert'];
type BudgetItem = Database['public']['Tables']['budget_items']['Row'];
type BudgetItemInsert = Database['public']['Tables']['budget_items']['Insert'];
type Budget = Database['public']['Tables']['budgets']['Row'];

// Type for category with items from Supabase query
type CategoryWithItems = BudgetCategory & {
  budget_items: BudgetItem[];
};

// ============================================
// GET BUDGET WITH FULL DATA
// ============================================
export async function getBudgetWithData(budgetId: string) {
  await requireAuth();
  const supabase = await createClient();

  // Get budget
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id, project_id, name, description, owner_id, created_at, updated_at')
    .eq('id', budgetId)
    .single();

  if (budgetError || !budget) {
    throw new Error('Budget not found');
  }

  // Type assertion for budget
  const budgetData = budget as Budget;

  // Get project if exists
  let project = null;
  if (budgetData.project_id) {
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', budgetData.project_id)
      .single();

    if (projectData) {
      project = projectData;
    }
  }

  // Get categories with items
  const { data: categories, error: categoriesError } = await supabase
    .from('budget_categories')
    .select(
      `
      id, budget_id, name, description, sort_order, created_at,
      budget_items (id, category_id, name, description, quantity, unit_price, link, status, is_recurrent, notes, sort_order, created_at, updated_at)
    `
    )
    .eq('budget_id', budgetId)
    .order('sort_order', { ascending: true })
    .order('sort_order', { ascending: true, foreignTable: 'budget_items' });

  if (categoriesError) {
    console.error('Error fetching categories:', categoriesError);
    return { budget: { ...budgetData, projects: project }, categories: [] };
  }

  // Type assertion for categories with items
  const categoriesData = (categories || []) as CategoryWithItems[];

  // Calculate totals for each category
  const categoriesWithTotals = categoriesData.map((category) => {
    const items = category.budget_items || [];
    const categoryTotal = items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      return sum + qty * price;
    }, 0);
    const acquiredTotal = items
      .filter((item) => item.status === 'acquired')
      .reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        return sum + qty * price;
      }, 0);

    return {
      ...category,
      items,
      category_total: categoryTotal,
      acquired_total: acquiredTotal,
      item_count: items.length,
    };
  });

  return {
    budget: { ...budgetData, projects: project },
    categories: categoriesWithTotals,
  };
}

// ============================================
// CREATE CATEGORY
// ============================================
export async function createCategory(formData: {
  budget_id: string;
  name: string;
  description?: string;
}) {
  await requireAuth();
  const supabase = await createClient();

  // Get max sort_order
  const { data: maxOrder } = await supabase
    .from('budget_categories')
    .select('sort_order')
    .eq('budget_id', formData.budget_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const maxOrderData = maxOrder as { sort_order: number } | null;
  const nextOrder = (maxOrderData?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('budget_categories')
    .insert({
      budget_id: formData.budget_id,
      name: formData.name,
      description: formData.description || null,
      sort_order: nextOrder,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    throw new Error('Failed to create category');
  }

  revalidatePath(`/budgets/${formData.budget_id}`);
  return data;
}

// ============================================
// UPDATE CATEGORY
// ============================================
export async function updateCategory(
  categoryId: string,
  budgetId: string,
  formData: {
    name?: string;
    description?: string;
  }
) {
  await requireAuth();
  const supabase = await createClient();

  const updates: any = {};
  if (formData.name !== undefined) updates.name = formData.name;
  if (formData.description !== undefined)
    updates.description = formData.description || null;

  const query: any = (supabase.from('budget_categories') as any).update(
    updates as any
  );

  const result: any = await query.eq('id', categoryId).select().single();

  const { data, error } = result;

  if (error) {
    console.error('Error updating category:', error);
    throw new Error('Failed to update category');
  }

  revalidatePath(`/budgets/${budgetId}`);
  return data;
}

// ============================================
// DELETE CATEGORY
// ============================================
export async function deleteCategory(categoryId: string, budgetId: string) {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from('budget_categories')
    .delete()
    .eq('id', categoryId);

  if (error) {
    console.error('Error deleting category:', error);
    throw new Error('Failed to delete category');
  }

  revalidatePath(`/budgets/${budgetId}`);
  return { success: true };
}

// ============================================
// REORDER CATEGORIES
// ============================================
export async function reorderCategories(
  budgetId: string,
  categoryIds: string[]
) {
  await requireAuth();
  const supabase = await createClient();

  // Update sort_order for each category
  const updates = categoryIds.map((id, index) => {
    const query: any = (supabase.from('budget_categories') as any).update({
      sort_order: index,
    } as any);

    return query.eq('id', id);
  });

  await Promise.all(updates);
  revalidatePath(`/budgets/${budgetId}`);
  return { success: true };
}

// ============================================
// CREATE ITEM
// ============================================
export async function createItem(formData: {
  category_id: string;
  name: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  link?: string;
  status?: 'pending' | 'quoted' | 'acquired';
  is_recurrent?: boolean;
  notes?: string;
}) {
  await requireAuth();
  const supabase = await createClient();

  // Get budget_id from category
  const { data: category } = await supabase
    .from('budget_categories')
    .select('budget_id')
    .eq('id', formData.category_id)
    .single();

  const categoryData = category as { budget_id: string } | null;
  if (!categoryData) {
    throw new Error('Category not found');
  }

  const budgetId = categoryData.budget_id;

  // Get max sort_order within category
  const { data: maxOrder } = await supabase
    .from('budget_items')
    .select('sort_order')
    .eq('category_id', formData.category_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const maxOrderData = maxOrder as { sort_order: number } | null;
  const nextOrder = (maxOrderData?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('budget_items')
    .insert({
      category_id: formData.category_id,
      name: formData.name,
      description: formData.description || null,
      quantity: formData.quantity || 1,
      unit_price: formData.unit_price || 0,
      link: formData.link || null,
      status: formData.status || 'pending',
      is_recurrent: formData.is_recurrent || false,
      notes: formData.notes || null,
      sort_order: nextOrder,
    } as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating item:', error);
    throw new Error('Failed to create item');
  }

  revalidatePath(`/budgets/${budgetId}`);
  return data;
}

// ============================================
// UPDATE ITEM
// ============================================
export async function updateItem(
  itemId: string,
  budgetId: string,
  formData: {
    name?: string;
    description?: string;
    quantity?: number;
    unit_price?: number;
    link?: string;
    status?: 'pending' | 'quoted' | 'acquired';
    is_recurrent?: boolean;
    notes?: string;
  }
) {
  await requireAuth();
  const supabase = await createClient();

  const updates: any = {};
  if (formData.name !== undefined) updates.name = formData.name;
  if (formData.description !== undefined)
    updates.description = formData.description || null;
  if (formData.quantity !== undefined) updates.quantity = formData.quantity;
  if (formData.unit_price !== undefined)
    updates.unit_price = formData.unit_price;
  if (formData.link !== undefined) updates.link = formData.link || null;
  if (formData.status !== undefined) updates.status = formData.status;
  if (formData.is_recurrent !== undefined)
    updates.is_recurrent = formData.is_recurrent;
  if (formData.notes !== undefined) updates.notes = formData.notes || null;

  const query: any = (supabase.from('budget_items') as any).update(
    updates as any
  );

  const result: any = await query.eq('id', itemId).select().single();

  const { data, error } = result;

  if (error) {
    console.error('Error updating item:', error);
    throw new Error('Failed to update item');
  }

  revalidatePath(`/budgets/${budgetId}`);
  return data;
}

// ============================================
// DELETE ITEM
// ============================================
export async function deleteItem(itemId: string, budgetId: string) {
  await requireAuth();
  const supabase = await createClient();

  const { error } = await supabase
    .from('budget_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('Error deleting item:', error);
    throw new Error('Failed to delete item');
  }

  revalidatePath(`/budgets/${budgetId}`);
  return { success: true };
}

// ============================================
// DELETE MULTIPLE ITEMS (within a budget)
// ============================================
export async function deleteItems(itemIds: string[], budgetId: string) {
  await requireAuth();
  const supabase = await createClient();

  if (!itemIds || itemIds.length === 0) {
    return { success: true };
  }

  // Safety: ensure we only delete items that belong to this budget (via categories)
  const { data: categories, error: categoriesError } = await supabase
    .from('budget_categories')
    .select('id')
    .eq('budget_id', budgetId);

  if (categoriesError) {
    console.error(
      'Error fetching categories for deleteItems:',
      categoriesError
    );
    throw new Error('Failed to delete items');
  }

  const categoryIds = (categories || []).map((c: any) => c.id).filter(Boolean);
  if (categoryIds.length === 0) {
    return { success: true };
  }

  const { error } = await supabase
    .from('budget_items')
    .delete()
    .in('id', itemIds)
    .in('category_id', categoryIds);

  if (error) {
    console.error('Error deleting items:', error);
    throw new Error('Failed to delete items');
  }

  revalidatePath(`/budgets/${budgetId}`);
  return { success: true };
}

// ============================================
// REORDER ITEMS (within one category)
// ============================================
export async function reorderItems(
  budgetId: string,
  categoryId: string,
  itemIds: string[]
) {
  await requireAuth();
  const supabase = await createClient();

  // Verify category belongs to budget
  const { data: category, error: categoryError } = await supabase
    .from('budget_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('budget_id', budgetId)
    .single();

  if (categoryError || !category) {
    console.error('Error validating category for reorderItems:', categoryError);
    throw new Error('Invalid category');
  }

  const updates = itemIds.map((id, index) => {
    const query: any = (supabase.from('budget_items') as any).update({
      sort_order: index,
    } as any);
    return query.eq('id', id).eq('category_id', categoryId);
  });

  await Promise.all(updates);
  revalidatePath(`/budgets/${budgetId}`);
  return { success: true };
}
