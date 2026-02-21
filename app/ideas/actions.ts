'use server';

import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { createIdea, updateIdea, deleteIdea } from '@/lib/idea-graph/ideas';

export async function createIdeaAction(formData: FormData) {
  await requireAuth();

  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;

  try {
    const data = await createIdea({
      title,
      description: description || null,
    });

    revalidatePath('/ideas');
    revalidatePath('/context');
    return { data };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'createIdeaAction',
      userIntent: 'Crear nueva idea',
      expected: 'La idea se crea en el grafo',
    });
    return {
      error: error instanceof Error ? error.message : 'Failed to create idea',
    };
  }
}

export async function updateIdeaAction(formData: FormData) {
  await requireAuth();

  const id = formData.get('id') as string;
  const title = formData.get('title') as string | null;
  const description = formData.get('description') as string | null;

  if (!id) {
    return { error: 'Idea ID is required' };
  }

  try {
    const data = await updateIdea(id, {
      title: title || undefined,
      description: description !== null ? description : undefined,
    });

    revalidatePath('/ideas');
    revalidatePath(`/ideas/${id}`);
    revalidatePath('/context');
    return { data };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'updateIdeaAction',
      userIntent: 'Actualizar idea',
      expected: 'Los cambios se guardan',
      extra: { ideaId: id },
    });
    return {
      error: error instanceof Error ? error.message : 'Failed to update idea',
    };
  }
}

export async function deleteIdeaAction(id: string) {
  await requireAuth();

  if (!id) {
    return { error: 'Idea ID is required' };
  }

  try {
    await deleteIdea(id);
    revalidatePath('/ideas');
    revalidatePath('/context');
    return { success: true };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'deleteIdeaAction',
      userIntent: 'Eliminar idea',
      expected: 'La idea se elimina del grafo',
      extra: { ideaId: id },
    });
    return {
      error: error instanceof Error ? error.message : 'Failed to delete idea',
    };
  }
}
