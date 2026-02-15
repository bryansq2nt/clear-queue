'use server';

import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { updateBoardItemPosition } from '@/lib/idea-graph/boards';

export async function updatePositionAction(
  boardItemId: string,
  x: number,
  y: number
) {
  await requireAuth();

  if (!boardItemId || boardItemId.trim().length === 0) {
    return { error: 'Board item ID is required' };
  }

  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
    return { error: 'X and Y coordinates must be valid numbers' };
  }

  try {
    const data = await updateBoardItemPosition({
      boardItemId,
      x,
      y,
    });

    // Revalidate the canvas page and main ideas page
    revalidatePath(`/ideas/boards/[id]/canvas`, 'page');
    revalidatePath('/ideas');
    return { data };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Failed to update position',
    };
  }
}
