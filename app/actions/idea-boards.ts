'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import {
  createBoard,
  deleteBoard,
  addIdeaToBoard,
  updateBoard,
  listBoardsByProjectId,
} from '@/lib/idea-graph/boards';

export async function createBoardAction(formData: FormData) {
  await requireAuth();

  const name = formData.get('name') as string;
  const description = formData.get('description') as string | null;

  try {
    const data = await createBoard({
      name,
      description: description || null,
    });

    revalidatePath('/ideas/boards');
    revalidatePath('/context');
    return { data };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'createBoardAction',
      userIntent: 'Crear nuevo board de ideas',
      expected: 'El board se crea y aparece en la lista',
    });
    return {
      error: error instanceof Error ? error.message : 'Failed to create board',
    };
  }
}

// Wrapper for form action (returns void)
export async function createBoardFormAction(formData: FormData) {
  await createBoardAction(formData);
  // Form action doesn't need to return anything
}

export async function updateBoardAction(formData: FormData) {
  await requireAuth();

  const id = formData.get('id') as string;
  const name = formData.get('name') as string | null;
  const description = formData.get('description') as string | null;
  const projectId = formData.get('projectId') as string | null;

  if (!id) {
    return { error: 'Board ID is required' };
  }

  try {
    const data = await updateBoard(id, {
      ...(name !== undefined && name !== null && { name: name ?? '' }),
      ...(description !== undefined && { description: description || null }),
      ...(projectId !== undefined && { project_id: projectId || null }),
    });
    revalidatePath('/ideas/boards');
    revalidatePath('/ideas');
    revalidatePath('/context');
    return { data };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'updateBoardAction',
      userIntent: 'Actualizar board',
      expected: 'Los cambios se guardan',
      extra: { boardId: id },
    });
    return {
      error: error instanceof Error ? error.message : 'Failed to update board',
    };
  }
}

export async function deleteBoardAction(id: string) {
  await requireAuth();

  if (!id) {
    return { error: 'Board ID is required' };
  }

  try {
    await deleteBoard(id);
    revalidatePath('/ideas/boards');
    revalidatePath('/ideas');
    revalidatePath('/context');
    return { success: true };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'deleteBoardAction',
      userIntent: 'Eliminar board',
      expected: 'El board se elimina',
      extra: { boardId: id },
    });
    return {
      error: error instanceof Error ? error.message : 'Failed to delete board',
    };
  }
}

/** Server action for context ideas tab: list boards by project (cacheable from client). */
export async function getBoardsByProjectIdAction(projectId: string) {
  await requireAuth();
  if (!projectId?.trim()) return [];
  return listBoardsByProjectId(projectId.trim());
}

/**
 * Atomically create a board already linked to a project.
 * Replaces the two-step createBoardAction → updateBoardAction pattern used in
 * ContextIdeasClient, which left orphaned boards (project_id = null) on failure.
 */
export async function createBoardWithProjectAction(
  name: string,
  projectId: string
): Promise<{ data?: { id: string; name: string }; error?: string }> {
  const user = await requireAuth();

  const trimmedName = name?.trim();
  if (!trimmedName) return { error: 'Board name is required' };

  const trimmedProjectId = projectId?.trim();
  if (!trimmedProjectId) return { error: 'Project ID is required' };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('idea_boards')
    .insert({
      owner_id: user.id,
      name: trimmedName,
      project_id: trimmedProjectId,
      updated_at: new Date().toISOString(),
    } as never)
    .select('id, name, project_id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/ideas/boards');
  revalidatePath('/ideas');
  revalidatePath('/context');
  revalidatePath(`/context/${trimmedProjectId}`);
  revalidatePath(`/context/${trimmedProjectId}/ideas`);

  return { data: data as { id: string; name: string } };
}

export async function addIdeaToBoardAction(formData: FormData) {
  await requireAuth();

  const boardId = formData.get('boardId') as string;
  const ideaId = formData.get('ideaId') as string;
  const x = formData.get('x') as string | null;
  const y = formData.get('y') as string | null;

  if (!boardId || !ideaId) {
    return { error: 'Board ID and Idea ID are required' };
  }

  try {
    const data = await addIdeaToBoard({
      boardId,
      ideaId,
      x: x ? parseFloat(x) : undefined,
      y: y ? parseFloat(y) : undefined,
    });

    revalidatePath(`/ideas/boards/${boardId}`);
    revalidatePath('/ideas');
    revalidatePath('/context');
    return { data };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'addIdeaToBoardAction',
      userIntent: 'Añadir idea al board',
      expected: 'La idea aparece en el canvas del board',
      extra: { boardId, ideaId },
    });
    return {
      error:
        error instanceof Error ? error.message : 'Failed to add idea to board',
    };
  }
}
