'use server'

import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import {
  getTodoLists,
  createTodoList,
  updateTodoList,
  archiveTodoList,
  deleteTodoList,
  getTodoItems,
  createTodoItem,
  updateTodoItem,
  toggleTodoItem,
  deleteTodoItem,
} from '@/lib/todo/lists'

// ============================================================================
// List Actions
// ============================================================================

export async function getTodoListsAction(options?: {
  includeArchived?: boolean
  projectId?: string | null
}) {
  await requireAuth()

  try {
    const data = await getTodoLists(options)
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to fetch todo lists',
    }
  }
}

export async function createTodoListAction(formData: FormData) {
  await requireAuth()

  const title = formData.get('title') as string
  const projectId = formData.get('project_id') as string | null
  const description = formData.get('description') as string | null
  const color = formData.get('color') as string | null

  if (!title || title.trim().length === 0) {
    return { error: 'List title is required' }
  }

  try {
    const data = await createTodoList({
      title,
      project_id: projectId || null,
      description: description || null,
      color: color || null,
    })

    revalidatePath('/todo')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to create todo list',
    }
  }
}

export async function renameTodoListAction(id: string, title: string) {
  await requireAuth()

  if (!id || !title || title.trim().length === 0) {
    return { error: 'List ID and title are required' }
  }

  try {
    const data = await updateTodoList(id, { title })
    revalidatePath('/todo')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to rename todo list',
    }
  }
}

export async function archiveTodoListAction(id: string, isArchived: boolean) {
  await requireAuth()

  if (!id) {
    return { error: 'List ID is required' }
  }

  try {
    const data = await archiveTodoList(id, isArchived)
    revalidatePath('/todo')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to archive todo list',
    }
  }
}

export async function deleteTodoListAction(id: string) {
  await requireAuth()

  if (!id) {
    return { error: 'List ID is required' }
  }

  try {
    await deleteTodoList(id)
    revalidatePath('/todo')
    return { success: true }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete todo list',
    }
  }
}

// ============================================================================
// Item Actions
// ============================================================================

export async function getTodoItemsAction(listId: string) {
  await requireAuth()

  if (!listId) {
    return { error: 'List ID is required' }
  }

  try {
    const data = await getTodoItems(listId)
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to fetch todo items',
    }
  }
}

export async function createTodoItemAction(formData: FormData) {
  await requireAuth()

  const listId = formData.get('list_id') as string
  const content = formData.get('content') as string
  const dueDate = formData.get('due_date') as string | null

  if (!listId || !content || content.trim().length === 0) {
    return { error: 'List ID and content are required' }
  }

  try {
    const data = await createTodoItem({
      list_id: listId,
      content,
      due_date: dueDate || null,
    })

    revalidatePath('/todo')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to create todo item',
    }
  }
}

export async function toggleTodoItemAction(id: string) {
  await requireAuth()

  if (!id) {
    return { error: 'Item ID is required' }
  }

  try {
    const data = await toggleTodoItem(id)
    revalidatePath('/todo')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to toggle todo item',
    }
  }
}

export async function updateTodoItemAction(
  id: string,
  updates: {
    content?: string
    due_date?: string | null
  }
) {
  await requireAuth()

  if (!id) {
    return { error: 'Item ID is required' }
  }

  try {
    const data = await updateTodoItem(id, updates)
    revalidatePath('/todo')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to update todo item',
    }
  }
}

export async function deleteTodoItemAction(id: string) {
  await requireAuth()

  if (!id) {
    return { error: 'Item ID is required' }
  }

  try {
    await deleteTodoItem(id)
    revalidatePath('/todo')
    return { success: true }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete todo item',
    }
  }
}
