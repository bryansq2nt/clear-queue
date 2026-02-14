'use server'

import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import {
  createBoard,
  deleteBoard,
  addIdeaToBoard,
  updateBoard,
} from '@/lib/idea-graph/boards'

export async function createBoardAction(formData: FormData) {
  await requireAuth()

  const name = formData.get('name') as string
  const description = formData.get('description') as string | null

  try {
    const data = await createBoard({
      name,
      description: description || null,
    })

    revalidatePath('/ideas/boards')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to create board',
    }
  }
}

// Wrapper for form action (returns void)
export async function createBoardFormAction(formData: FormData) {
  await createBoardAction(formData)
  // Form action doesn't need to return anything
}

export async function updateBoardAction(formData: FormData) {
  await requireAuth()

  const id = formData.get('id') as string
  const name = formData.get('name') as string | null
  const description = formData.get('description') as string | null
  const projectId = formData.get('projectId') as string | null

  if (!id) {
    return { error: 'Board ID is required' }
  }

  try {
    const data = await updateBoard(id, {
      ...(name !== undefined && name !== null && { name: name ?? '' }),
      ...(description !== undefined && { description: description || null }),
      ...(projectId !== undefined && { project_id: projectId || null }),
    })
    revalidatePath('/ideas/boards')
    revalidatePath('/ideas')
    return { data }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to update board',
    }
  }
}

export async function deleteBoardAction(id: string) {
  await requireAuth()

  if (!id) {
    return { error: 'Board ID is required' }
  }

  try {
    await deleteBoard(id)
    revalidatePath('/ideas/boards')
    revalidatePath('/ideas')
    return { success: true }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete board',
    }
  }
}

export async function addIdeaToBoardAction(formData: FormData) {
  await requireAuth()

  const boardId = formData.get('boardId') as string
  const ideaId = formData.get('ideaId') as string
  const x = formData.get('x') as string | null
  const y = formData.get('y') as string | null

  if (!boardId || !ideaId) {
    return { error: 'Board ID and Idea ID are required' }
  }

  try {
    const data = await addIdeaToBoard({
      boardId,
      ideaId,
      x: x ? parseFloat(x) : undefined,
      y: y ? parseFloat(y) : undefined,
    })

    revalidatePath(`/ideas/boards/${boardId}`)
    revalidatePath('/ideas')
    return { data }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to add idea to board',
    }
  }
}
