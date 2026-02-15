'use server';

import { requireAuth } from '@/lib/auth';
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
    return { data };
  } catch (error) {
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
    return { data };
  } catch (error) {
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
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to delete idea',
    };
  }
}
