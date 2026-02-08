'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Database } from '@/lib/supabase/types'

type Budget = Database['public']['Tables']['budgets']['Row']
type BudgetCategory = Database['public']['Tables']['budget_categories']['Row']
type BudgetItem = Database['public']['Tables']['budget_items']['Row']

type CategoryWithItems = BudgetCategory & {
  budget_items: BudgetItem[]
}

// ============================================
// GET ALL BUDGETS
// ============================================
export async function getBudgets() {
  await requireAuth()
  const supabase = await createClient()
  
  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching budgets:', error)
    return []
  }

  if (!budgets || budgets.length === 0) {
    return []
  }

  // Type assertion for budgets
  const budgetsData = budgets as Budget[]

  // Get unique project IDs
  const projectIds = budgetsData
    .map(b => b.project_id)
    .filter((id): id is string => id !== null)

  // Fetch projects if there are any
  let projectsMap: Record<string, { id: string; name: string }> = {}
  if (projectIds.length > 0) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds)

    if (projects) {
      // Type assertion for projects
      const projectsData = projects as { id: string; name: string }[]
      projectsMap = projectsData.reduce((acc, p) => {
        acc[p.id] = { id: p.id, name: p.name }
        return acc
      }, {} as Record<string, { id: string; name: string }>)
    }
  }

  // Combine budgets with projects
  return budgetsData.map(budget => ({
    ...budget,
    projects: budget.project_id ? projectsMap[budget.project_id] || null : null
  })) as (Budget & { projects: { id: string; name: string } | null })[]
}

// ============================================
// GET BUDGET STATS (para cards)
// ============================================
export async function getBudgetStats(budgetId: string) {
  await requireAuth()
  const supabase = await createClient()

  // Get all items for this budget through categories
  const { data: categories, error: categoriesError } = await supabase
    .from('budget_categories')
    .select('id')
    .eq('budget_id', budgetId)

  if (categoriesError || !categories || categories.length === 0) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: 0,
      progress: 0
    }
  }

  // Type assertion for categories
  const categoriesData = categories as { id: string }[]
  const categoryIds = categoriesData.map(c => c.id)

  // If no categories, return early
  if (categoryIds.length === 0) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: categoriesData.length,
      progress: 0
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('budget_items')
    .select('quantity, unit_price, status')
    .in('category_id', categoryIds)

  if (itemsError || !items) {
    return {
      total: 0,
      acquired: 0,
      pending: 0,
      itemCount: 0,
      categoryCount: categoriesData.length,
      progress: 0
    }
  }

  // Type assertion for items
  const itemsData = items as { quantity: number; unit_price: number; status: string }[]

  const total = itemsData.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const price = Number(item.unit_price) || 0
    return sum + (qty * price)
  }, 0)

  const acquired = itemsData
    .filter(item => item.status === 'acquired')
    .reduce((sum, item) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unit_price) || 0
      return sum + (qty * price)
    }, 0)

  const pending = total - acquired
  const progress = total > 0 ? (acquired / total) * 100 : 0

  return {
    total,
    acquired,
    pending,
    itemCount: itemsData.length,
    categoryCount: categoriesData.length,
    progress: Math.round(progress)
  }
}

// ============================================
// CREATE BUDGET
// ============================================
export async function createBudget(formData: {
  name: string
  description?: string
  project_id?: string
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      name: formData.name,
      description: formData.description || null,
      project_id: formData.project_id || null,
      owner_id: user.id,
    } as any)
    .select()
    .single()

  if (error) {
    console.error('Error creating budget:', error)
    throw new Error('Failed to create budget')
  }

  revalidatePath('/budgets')
  return data
}

// ============================================
// UPDATE BUDGET
// ============================================
export async function updateBudget(
  budgetId: string,
  formData: {
    name?: string
    description?: string
    project_id?: string
  }
) {
  await requireAuth()
  const supabase = await createClient()

  const updates: any = {}
  if (formData.name !== undefined) updates.name = formData.name
  if (formData.description !== undefined) updates.description = formData.description || null
  if (formData.project_id !== undefined) updates.project_id = formData.project_id || null

  const query: any = (supabase
    .from('budgets') as any)
    .update(updates as any)

  const result: any = await query
    .eq('id', budgetId)
    .select()
    .single()

  const { data, error } = result

  if (error) {
    console.error('Error updating budget:', error)
    throw new Error('Failed to update budget')
  }

  revalidatePath('/budgets')
  revalidatePath(`/budgets/${budgetId}`)
  return data
}

// ============================================
// DELETE BUDGET
// ============================================
export async function deleteBudget(budgetId: string) {
  await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', budgetId)

  if (error) {
    console.error('Error deleting budget:', error)
    throw new Error('Failed to delete budget')
  }

  revalidatePath('/budgets')
  return { success: true }
}

// ============================================
// DUPLICATE BUDGET (budget + categories + items)
// ============================================
export async function duplicateBudget(sourceBudgetId: string) {
  await requireAuth()
  const supabase = await createClient()

  // Fetch source budget
  const { data: sourceBudget, error: sourceBudgetError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', sourceBudgetId)
    .single()

  if (sourceBudgetError || !sourceBudget) {
    console.error('Error fetching source budget:', sourceBudgetError)
    throw new Error('Budget not found')
  }

  const sourceBudgetData = sourceBudget as Budget

  // Create new budget
  const { data: newBudget, error: createBudgetError } = await supabase
    .from('budgets')
    .insert({
      name: `${sourceBudgetData.name} (Copy)`,
      description: sourceBudgetData.description ?? null,
      project_id: sourceBudgetData.project_id ?? null,
    } as any)
    .select()
    .single()

  if (createBudgetError || !newBudget) {
    console.error('Error creating duplicated budget:', createBudgetError)
    throw new Error('Failed to duplicate budget')
  }

  const newBudgetData = newBudget as Budget

  // Fetch categories with items
  const { data: categories, error: categoriesError } = await supabase
    .from('budget_categories')
    .select(
      `
      *,
      budget_items (*)
    `
    )
    .eq('budget_id', sourceBudgetId)
    .order('sort_order', { ascending: true })

  if (categoriesError) {
    console.error('Error fetching categories for duplication:', categoriesError)
    // Budget duplicated, but no categories copied; still return new budget id.
    revalidatePath('/budgets')
    revalidatePath(`/budgets/${newBudgetData.id}`)
    return { budgetId: newBudgetData.id }
  }

  const categoriesData = (categories || []) as CategoryWithItems[]

  // Copy categories + items (sequential to keep mapping reliable)
  for (const category of categoriesData) {
    const { data: newCategory, error: newCategoryError } = await supabase
      .from('budget_categories')
      .insert({
        budget_id: newBudgetData.id,
        name: category.name,
        description: category.description ?? null,
        sort_order: category.sort_order ?? 0,
      } as any)
      .select()
      .single()

    if (newCategoryError || !newCategory) {
      console.error('Error duplicating category:', newCategoryError)
      throw new Error('Failed to duplicate budget')
    }

    const newCategoryId = (newCategory as BudgetCategory).id
    const items = (category.budget_items || []) as BudgetItem[]

    if (items.length > 0) {
      const itemInserts = items.map((item) => ({
        category_id: newCategoryId,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        link: item.link ?? null,
        status: (item.status as any) ?? 'pending',
        is_recurrent: item.is_recurrent ?? false,
        notes: item.notes ?? null,
      }))

      const { error: itemsError } = await supabase
        .from('budget_items')
        .insert(itemInserts as any)

      if (itemsError) {
        console.error('Error duplicating items:', itemsError)
        throw new Error('Failed to duplicate budget')
      }
    }
  }

  revalidatePath('/budgets')
  revalidatePath(`/budgets/${newBudgetData.id}`)
  return { budgetId: newBudgetData.id }
}

// ============================================
// GET PROJECTS (para dropdown)
// ============================================
export async function getProjects() {
  await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('name')

  if (error) {
    console.error('Error fetching projects:', error)
    return []
  }

  // Type assertion for projects
  return (data || []) as { id: string; name: string }[]
}
