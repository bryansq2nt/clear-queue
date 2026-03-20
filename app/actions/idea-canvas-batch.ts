'use server';

import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function batchUpdatePositionsAction(
  updates: Array<{ id: string; x: number; y: number }>
) {
  const user = await requireAuth();

  if (!updates || updates.length === 0) {
    return { success: true };
  }

  const supabase = await createClient();

  // Look up the project_id for permission check via first board item's board
  const firstId = updates[0]?.id;
  if (firstId) {
    const { data: boardItem } = await (supabase as any)
      .from('idea_board_items')
      .select('board_id')
      .eq('id', firstId)
      .maybeSingle();
    if (boardItem?.board_id) {
      const { data: boardRow } = await (supabase as any)
        .from('idea_boards')
        .select('project_id')
        .eq('id', boardItem.board_id)
        .maybeSingle();
      if (boardRow?.project_id) {
        await requireCan(user.id, 'ideas.update', {
          type: 'idea',
          projectId: boardRow.project_id,
        });
      }
    }
  }

  try {
    // Actualizar todos en paralelo con Promise.allSettled para no fallar si uno falla
    const results = await Promise.allSettled(
      updates.map((update) =>
        supabase
          .from('idea_board_items')
          // @ts-ignore - Supabase type inference issue with generated types
          .update({
            x: update.x,
            y: update.y,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id)
      )
    );

    // Contar éxitos y fallos
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    console.log(`✅ Batch update: ${succeeded} succeeded, ${failed} failed`);

    if (failed > 0) {
      console.error(
        'Some updates failed:',
        results.filter((r) => r.status === 'rejected')
      );
    }

    revalidatePath('/ideas');
    revalidatePath('/context');
    return { success: true, succeeded, failed };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'batchUpdatePositionsAction',
      userIntent: 'Guardar posiciones de nodos en el canvas',
      expected: 'Las posiciones se persisten',
      extra: { updateCount: updates.length },
    });
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    };
  }
}
