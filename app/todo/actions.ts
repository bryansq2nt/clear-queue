'use server'

import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import {
  getTodoLists,
  getTodoListById,
  createTodoList,
  updateTodoList,
  archiveTodoList,
  deleteTodoList,
  getTodoItems,
  getTodoItemsByListIds,
  createTodoItem,
  updateTodoItem,
  toggleTodoItem,
  deleteTodoItem,
} from '@/lib/todo/lists'
import { getProjects } from '@/app/budgets/actions'
import type { TodoItem } from '@/lib/todo/lists'

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
    revalidatePath(`/todo/list/${id}`)
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to rename todo list',
    }
  }
}

export async function updateTodoListAction(
  id: string,
  updates: { title?: string; project_id?: string | null }
) {
  await requireAuth()

  if (!id) {
    return { error: 'List ID is required' }
  }

  try {
    const data = await updateTodoList(id, updates)
    revalidatePath('/todo')
    revalidatePath(`/todo/list/${id}`)
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to update todo list',
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

export type TodoListWithItems = {
  list: Awaited<ReturnType<typeof getTodoListById>>
  items: TodoItem[]
  projectName: string | null
}

export async function getTodoListWithItemsAction(listId: string): Promise<{
  data?: TodoListWithItems
  error?: string
}> {
  await requireAuth()

  if (!listId) {
    return { error: 'List ID is required' }
  }

  try {
    const list = await getTodoListById(listId)
    if (!list) {
      return { error: 'List not found' }
    }
    const items = await getTodoItems(listId)
    const projects = await getProjects()
    const projectName = list.project_id
      ? (projects.find((p) => p.id === list.project_id)?.name ?? null)
      : null
    return {
      data: { list, items, projectName },
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to load list',
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

// ============================================================================
// Project-first dashboard & board
// ============================================================================

export type ProjectTodoSummary = {
  projectId: string
  projectName: string
  pendingCount: number
  previewItems: TodoItem[]
}

export async function getProjectsWithTodoSummaryAction(): Promise<{
  data?: ProjectTodoSummary[]
  error?: string
}> {
  await requireAuth()

  try {
    const projects = await getProjects()
    const lists = await getTodoLists({ includeArchived: false })
    const projectListIds = lists
      .filter((l) => l.project_id != null)
      .reduce((acc, l) => {
        const pid = l.project_id!
        if (!acc[pid]) acc[pid] = []
        acc[pid].push(l.id)
        return acc
      }, {} as Record<string, string[]>)

    const summaries: ProjectTodoSummary[] = []
    for (const project of projects) {
      const listIds = projectListIds[project.id] || []
      if (listIds.length === 0) continue

      const items = await getTodoItemsByListIds(listIds)
      const pending = items.filter((i) => !i.is_done)
      const previewItems = items.slice(0, 3)

      summaries.push({
        projectId: project.id,
        projectName: project.name,
        pendingCount: pending.length,
        previewItems,
      })
    }

    return { data: summaries }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to fetch todo summary',
    }
  }
}

export type ProjectTodoBoard = {
  defaultListId: string
  projectName: string
  items: TodoItem[]
}

export async function getProjectTodoBoardAction(projectId: string): Promise<{
  data?: ProjectTodoBoard
  error?: string
}> {
  await requireAuth()

  if (!projectId) {
    return { error: 'Project ID is required' }
  }

  try {
    const projects = await getProjects()
    const project = projects.find((p) => p.id === projectId)
    if (!project) {
      return { error: 'Project not found' }
    }

    let lists = await getTodoLists({ includeArchived: false, projectId })
    if (lists.length === 0) {
      const newList = await createTodoList({
        title: 'Tasks',
        project_id: projectId,
      })
      lists = [newList]
      revalidatePath('/todo')
      revalidatePath(`/todo/project/${projectId}`)
    }

    const sortedLists = [...lists].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const defaultListId = sortedLists[0]?.id ?? lists[0].id
    const listIds = lists.map((l) => l.id)
    const items = await getTodoItemsByListIds(listIds)

    return {
      data: {
        defaultListId,
        projectName: project.name,
        items,
      },
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to load project board',
    }
  }
}
