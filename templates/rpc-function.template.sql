-- =============================================================================
-- Transactional RPC Template
-- Copy to supabase/migrations/YYYYMMDDHHMMSS_name.sql or run in SQL Editor.
-- Use when 2+ writes must succeed or fail together (single transaction).
-- =============================================================================

-- TODO: Rename function and parameters to match your use case.
-- Convention: p_ prefix for parameters to avoid collision with column names.
create or replace function create_thing_with_items(
  p_owner_id uuid,
  p_name text,
  p_item_title text default 'Default item'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thing_id uuid;
  v_result   json;
begin
  -- TODO (optional): Enforce auth when using security definer.
  -- Caller can only act on their own owner_id.
  if auth.uid() is distinct from p_owner_id then
    raise exception 'Forbidden: owner_id does not match authenticated user';
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 1: First write (e.g. insert parent row)
  -- ---------------------------------------------------------------------------
  insert into things (owner_id, name)
  values (p_owner_id, trim(p_name))
  returning id into v_thing_id;

  -- ---------------------------------------------------------------------------
  -- Step 2: Second write (e.g. insert child row) — same transaction
  -- ---------------------------------------------------------------------------
  insert into items (thing_id, title, order_index)
  values (v_thing_id, trim(p_item_title), 0);

  -- ---------------------------------------------------------------------------
  -- Return: Only the columns the client needs (explicit selection)
  -- ---------------------------------------------------------------------------
  select to_jsonb(r) into v_result
  from (
    select id, name, owner_id, created_at
    from things
    where id = v_thing_id
  ) r;
  return v_result;

exception
  when others then
    -- Re-raise so the whole transaction is rolled back and the client gets the error
    raise;
end;
$$;

-- TODO: Grant to the roles your app uses (authenticated and/or service_role).
-- Adjust function name and argument types to match the function above.
grant execute on function create_thing_with_items(uuid, text, text) to authenticated;
grant execute on function create_thing_with_items(uuid, text, text) to service_role;

-- =============================================================================
-- Example usage from a server action:
-- =============================================================================
-- 'use server'
-- import { createClient } from '@/lib/supabase/server'
-- import { requireAuth } from '@/lib/auth'
-- import { revalidatePath } from 'next/cache'
--
-- export async function createThingWithItemsAction(formData: FormData) {
--   const user = await requireAuth()
--   const supabase = await createClient()
--   const name = (formData.get('name') as string)?.trim()
--   const itemTitle = (formData.get('item_title') as string)?.trim() || 'Default item'
--   if (!name) return { error: 'Name is required' }
--
--   const { data, error } = await supabase.rpc('create_thing_with_items', {
--     p_owner_id: user.id,
--     p_name: name,
--     p_item_title: itemTitle,
--   })
--
--   if (error) return { error: error.message }
--   revalidatePath('/dashboard')
--   return { data }
-- }
