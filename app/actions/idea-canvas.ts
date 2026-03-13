'use server';

import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { createClient } from '@/lib/supabase/server';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { updateBoardItemPosition } from '@/lib/idea-graph/boards';

export async function updatePositionAction(
  boardItemId: string,
  x: number,
  y: number
) {
  const user = await requireAuth();

  if (!boardItemId || boardItemId.trim().length === 0) {
    return { error: 'Board item ID is required' };
  }

  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
    return { error: 'X and Y coordinates must be valid numbers' };
  }

  const supabase = await createClient();
  const { data: boardItem } = await (supabase as any)
    .from('idea_board_items')
    .select('board_id')
    .eq('id', boardItemId)
    .maybeSingle();
  if (boardItem?.board_id) {
    const { data: boardRow } = await (supabase as any)
      .from('idea_boards')
      .select('project_id')
      .eq('id', boardItem.board_id)
      .maybeSingle();
    if (boardRow?.project_id) {
      await requireCan(user.id, 'ideas.update_node', {
        type: 'idea',
        projectId: boardRow.project_id,
      });
    }
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
    revalidatePath('/context');
    return { data };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'updatePositionAction',
      userIntent: 'Mover nodo en el canvas',
      expected: 'La posición del nodo se actualiza',
      extra: { boardItemId },
    });
    return {
      error:
        error instanceof Error ? error.message : 'Failed to update position',
    };
  }
}
