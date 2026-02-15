/**
 * Server Action Template
 * Copy to app/<feature>/actions.ts or app/actions/<name>.ts and rename.
 *
 * Example usage (in a client component):
 *   const [pending, startTransition] = useTransition()
 *   const result = await createThingAction(formData)
 *   if (result.error) setError(result.error)
 *   else if (result.data) setThing(result.data)
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// TODO: Define a return type so callers get type safety
type ActionResult<T = unknown> =
  | { data: T; error?: never }
  | { data?: never; error: string };

// TODO: Replace with your table row type (e.g. from lib/supabase/types or a local type)
type Thing = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

/**
 * TODO: Rename and adjust for your mutation (create | update | delete).
 * - requireAuth() ensures only logged-in users can call this.
 * - Validate/sanitize input before hitting the DB.
 * - Return { data } so the client can update UI without refetching (no load*() after).
 */
export async function createThingAction(
  formData: FormData
): Promise<ActionResult<Thing>> {
  // TODO: Auth first — unauthenticated users get redirected
  const user = await requireAuth();
  const supabase = await createClient();

  // TODO: Extract and validate input; return { error } early on invalid input
  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    return { error: 'Name is required' };
  }

  // TODO: Use explicit .select('...') — avoid .select('*') (see no-select-star rule)
  // TODO: Replace 'things' with your table name; cast needed in template (no 'things' in DB types)
  const { data, error } = await (supabase as any)
    .from('things')
    .insert({
      name,
      owner_id: user.id,
    })
    .select('id, name, owner_id, created_at')
    .single();

  if (error) {
    return { error: error.message };
  }

  // TODO: Revalidate every path that shows this data so server components refetch
  revalidatePath('/dashboard');
  revalidatePath('/things');

  return { data: data as Thing };
}

/**
 * Example: update action with same structure
 */
export async function updateThingAction(
  formData: FormData
): Promise<ActionResult<Thing>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim();
  if (!id) return { error: 'ID is required' };
  if (!name) return { error: 'Name is required' };

  const { data, error } = await (supabase as any)
    .from('things')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, name, owner_id, created_at, updated_at')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/things');
  return { data: data as Thing };
}

/**
 * Example: delete action
 */
export async function deleteThingAction(
  id: string
): Promise<ActionResult<{ success: true }>> {
  const user = await requireAuth();
  const supabase = await createClient();
  if (!id) return { error: 'ID is required' };

  const { error } = await (supabase as any)
    .from('things')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/things');
  return { data: { success: true } };
}
