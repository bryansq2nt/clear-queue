'use server';

import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function batchUpdatePositionsAction(
  updates: Array<{ id: string; x: number; y: number }>
) {
  await requireAuth();

  if (!updates || updates.length === 0) {
    return { success: true };
  }

  const supabase = await createClient();

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
    console.error('Batch update error:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    };
  }
}
