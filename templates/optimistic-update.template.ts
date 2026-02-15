/**
 * Optimistic Update with Version Checking Template
 * Use when the same row can be edited from multiple places; avoid overwriting
 * someone else's changes by checking a version (or updated_at) before updating.
 *
 * Prerequisites:
 * - Table has a "version" column (integer, default 1) updated on every change,
 *   OR use "updated_at" (timestamptz) and compare before update.
 *
 * Example usage (client):
 *   const result = await updateThingAction({ id, name, version })
 *   if (result.error === 'CONFLICT') {
 *     toast.error('Someone else updated this. Refreshing…')
 *     router.refresh()
 *   }
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// TODO: Use your table row type
type Thing = {
  id: string;
  name: string;
  version: number;
  updated_at: string;
};

type UpdateInput = {
  id: string;
  name: string;
  version: number;
};

type ActionResult<T = unknown> =
  | { data: T; error?: never }
  | { data?: never; error: string };

/**
 * Optimistic update with version check:
 * - Only update if current row version matches the one the client had.
 * - If no row is updated, return a user-friendly CONFLICT error so the UI
 *   can refresh or show "someone else changed this".
 */
export async function updateThingAction(
  input: UpdateInput
): Promise<ActionResult<Thing>> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { id, name, version } = input;
  if (!id) return { error: 'ID is required' };
  if ((name ?? '').trim().length === 0) return { error: 'Name is required' };
  if (version == null || version < 1) return { error: 'Invalid version' };

  // TODO: Increment version on each update so next edit must pass the new version.
  // TODO: Replace 'things' with your table name; cast needed in template (no 'things' in DB types)
  const { data, error } = await (supabase as any)
    .from('things')
    .update({
      name: name.trim(),
      version: version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', user.id)
    .eq('version', version) // Conflict detection: only update if version unchanged
    .select('id, name, version, updated_at')
    .single();

  if (error) {
    return { error: error.message };
  }

  // No row updated => someone else changed the row (version mismatch)
  if (!data) {
    return {
      error: 'CONFLICT', // Use a sentinel so the client can show a user-friendly message
    };
  }

  revalidatePath('/dashboard');
  revalidatePath('/things');
  return { data: data as Thing };
}

// =============================================================================
// SQL: Add version column if your table doesn't have it (run in migration)
// =============================================================================
/*
alter table things
  add column if not exists version int not null default 1;

-- Optional: trigger to auto-increment version on any update
create or replace function things_increment_version()
returns trigger language plpgsql as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

create trigger things_version_trigger
  before update on things
  for each row execute function things_increment_version();
*/

// =============================================================================
// Example client usage (with optimistic UI)
// =============================================================================
/*
const [thing, setThing] = useState(initialThing)

async function handleSave() {
  // Optimistic update: show new name immediately
  setThing(prev => ({ ...prev, name: editedName }))
  const result = await updateThingAction({
    id: thing.id,
    name: editedName,
    version: thing.version,
  })
  if (result.error === 'CONFLICT') {
    toast.error('This was updated elsewhere. Refreshing.')
    router.refresh()
    return
  }
  if (result.error) {
    toast.error(result.error)
    setThing(initialThing)
    return
  }
  if (result.data) setThing(result.data)
}
*/
