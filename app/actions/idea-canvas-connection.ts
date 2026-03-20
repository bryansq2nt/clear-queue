'use server';

import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { createClient } from '@/lib/supabase/server';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import {
  createConnection,
  deleteConnection,
} from '@/lib/idea-graph/connections';

export async function createConnectionAction(
  fromIdeaId: string,
  toIdeaId: string
) {
  const user = await requireAuth();

  if (!fromIdeaId || fromIdeaId.trim().length === 0) {
    return { error: 'From idea ID is required' };
  }

  if (!toIdeaId || toIdeaId.trim().length === 0) {
    return { error: 'To idea ID is required' };
  }

  if (fromIdeaId === toIdeaId) {
    return { error: 'Cannot create connection from an idea to itself' };
  }

  const supabase = await createClient();
  const { data: boardItem } = await (supabase as any)
    .from('idea_board_items')
    .select('board_id')
    .eq('idea_id', fromIdeaId)
    .limit(1)
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
    captureWithContext(error, {
      module: 'ideas',
      action: 'createConnectionAction',
      userIntent: 'Crear conexión entre ideas',
      expected: 'La conexión se crea en el canvas',
      extra: { fromIdeaId, toIdeaId },
    });
    return {
      error:
        error instanceof Error ? error.message : 'Failed to create connection',
    };
  }
}

export async function deleteConnectionAction(connectionId: string) {
  const user = await requireAuth();

  if (!connectionId || connectionId.trim().length === 0) {
    return { error: 'Connection ID is required' };
  }

  const supabase = await createClient();
  const { data: connRow } = await (supabase as any)
    .from('idea_connections')
    .select('from_idea_id')
    .eq('id', connectionId)
    .maybeSingle();
  if (connRow?.from_idea_id) {
    const { data: boardItem } = await (supabase as any)
      .from('idea_board_items')
      .select('board_id')
      .eq('idea_id', connRow.from_idea_id)
      .limit(1)
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
    await deleteConnection(connectionId);

    // Revalidate the canvas page and main ideas page
    revalidatePath(`/ideas/boards/[id]/canvas`, 'page');
    revalidatePath('/ideas');
    revalidatePath('/context');
    return { success: true };
  } catch (error) {
    captureWithContext(error, {
      module: 'ideas',
      action: 'deleteConnectionAction',
      userIntent: 'Eliminar conexión entre ideas',
      expected: 'La conexión se elimina del canvas',
      extra: { connectionId },
    });
    return {
      error:
        error instanceof Error ? error.message : 'Failed to delete connection',
    };
  }
}
