import { createClient } from '@/lib/supabase/server';

export async function assertOwnedRecord(
  table: 'projects' | 'clients' | 'businesses' | 'billings',
  id: string,
  ownerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'Resource not found or not accessible' };
  }

  return { ok: true };
}

export async function assertTaskOwnedByProject(
  taskId: string,
  ownerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, projects!inner(owner_id)')
    .eq('id', taskId)
    .eq('projects.owner_id', ownerId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'Task not found or not accessible' };
  }

  return { ok: true };
}
