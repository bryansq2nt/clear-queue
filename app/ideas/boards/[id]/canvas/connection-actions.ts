'use server';

import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
  createConnection,
  deleteConnection,
} from '@/lib/idea-graph/connections';

export async function createConnectionAction(
  fromIdeaId: string,
  toIdeaId: string
) {
  await requireAuth();

  if (!fromIdeaId || fromIdeaId.trim().length === 0) {
    return { error: 'From idea ID is required' };
  }

  if (!toIdeaId || toIdeaId.trim().length === 0) {
    return { error: 'To idea ID is required' };
  }

  if (fromIdeaId === toIdeaId) {
    return { error: 'Cannot create connection from an idea to itself' };
  }

  try {
    const data = await createConnection({
      fromIdeaId,
      toIdeaId,
      type: 'relates_to',
    });

    // Revalidate the canvas page to refresh connections
    revalidatePath(`/ideas/boards/[id]/canvas`, 'page');
    revalidatePath('/context');
    return { data };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Failed to create connection',
    };
  }
}

export async function deleteConnectionAction(connectionId: string) {
  await requireAuth();

  if (!connectionId || connectionId.trim().length === 0) {
    return { error: 'Connection ID is required' };
  }

  try {
    await deleteConnection(connectionId);

    // Revalidate the canvas page and main ideas page
    revalidatePath(`/ideas/boards/[id]/canvas`, 'page');
    revalidatePath('/ideas');
    revalidatePath('/context');
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Failed to delete connection',
    };
  }
}
