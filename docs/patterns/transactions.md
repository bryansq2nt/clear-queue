# Transactions

When and how to run multi-step database operations atomically with Supabase/Postgres.

---

## Why this matters

- **Atomicity**: Several inserts/updates/deletes should either all succeed or all roll back. Without a transaction, a failure in the middle can leave the database in an inconsistent state (e.g. order header created but items not, or one table updated and another not).
- **Consistency**: RPC functions run in a single transaction with a single round-trip. Application code that does multiple `supabase.from(...)` calls runs as separate statements; a crash or error between them does not roll back earlier ones.
- **Simplicity**: Moving complex multi-step logic into one RPC gives a clear contract (one call, one transaction) and keeps the action code thin.

---

## When to use RPC functions

Use a **Postgres function (RPC)** when:

- You need **two or more writes** that must succeed or fail together (e.g. create project + add default tasks, or move task + update order_index on siblings).
- You have **read-then-write** logic that must not be interleaved with other changes (e.g. "read current max order_index, insert with order_index+1").
- You want **one network round-trip** for several operations.
- You need **server-side constraints or logic** that are easier to express in SQL/PLpgSQL than in TypeScript.

Use **single-statement actions** when:

- One insert, update, or delete is enough.
- You're only reading.
- The steps are independent (e.g. update project, then revalidate; no shared transaction needed).

---

## How to create transaction wrappers

Supabase does not expose a client-side "begin / commit / rollback" API. Transactions are achieved by:

1. **RPC (recommended)**: Define a Postgres function that does all steps in one transaction. Call it with `supabase.rpc('function_name', { arg1, arg2 })`.
2. **Postgres function body**: Use `BEGIN ... COMMIT` and `EXCEPTION WHEN ... THEN ROLLBACK` inside the function so any error aborts the whole transaction.

The "wrapper" is the Postgres function plus a thin server action that calls it and maps arguments/results.

---

## Template for atomic operations

### 1. Postgres function (migration or SQL editor)

```sql
-- Example: create a project and add a default "Backlog" task in one transaction.
create or replace function create_project_with_backlog(
  p_owner_id uuid,
  p_name text,
  p_category text default 'business'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_result json;
begin
  -- Step 1: insert project
  insert into projects (owner_id, name, category)
  values (p_owner_id, trim(p_name), p_category)
  returning id into v_project_id;

  -- Step 2: insert default task (same transaction)
  insert into tasks (project_id, title, status, order_index)
  values (v_project_id, 'Backlog', 'backlog', 0);

  -- Return the new project row (optional)
  select to_jsonb(r) into v_result
  from (select id, name, category, created_at from projects where id = v_project_id) r;
  return v_result;
exception
  when others then
    raise;  -- Rolls back the whole transaction
end;
$$;
```

- **security definer**: Runs with the function owner’s privileges; use RLS inside the function if needed (e.g. check `auth.uid() = p_owner_id`).
- **raise**: Re-raising the exception ensures the transaction is rolled back and the client gets the error.

### 2. Grant execute to the role your app uses

```sql
grant execute on function create_project_with_backlog(uuid, text, text) to authenticated;
grant execute on function create_project_with_backlog(uuid, text, text) to service_role;
```

### 3. Server action that calls the RPC

```ts
// app/projects/actions.ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function createProjectWithBacklog(formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();
  const name = (formData.get('name') as string)?.trim();
  const category = (formData.get('category') as string) || 'business';
  if (!name) return { error: 'Project name is required' };

  const { data, error } = await supabase.rpc('create_project_with_backlog', {
    p_owner_id: user.id,
    p_name: name,
    p_category: category,
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return { data };
}
```

---

## Do this

### 1. Use RPC for multi-step writes that must be atomic

```ts
// ✅ One call = one transaction
const { data, error } = await supabase.rpc('create_project_with_backlog', {
  p_owner_id: user.id,
  p_name: name,
  p_category: category,
});
```

### 2. Return useful data from the RPC

```sql
-- ✅ Return created row(s) so the client doesn’t refetch
return (select to_jsonb(p) from projects p where p.id = v_project_id);
```

### 3. Enforce auth inside the RPC when using security definer

```sql
-- ✅ Ensure the caller can only create for themselves
if auth.uid() is distinct from p_owner_id then
  raise exception 'Forbidden';
end if;
```

### 4. Re-raise exceptions so the transaction rolls back

```sql
exception
  when others then
    raise;
```

### 5. Keep the server action thin: validate input, call RPC, revalidate

```ts
export async function createProjectWithBacklog(formData: FormData) {
  const user = await requireAuth()
  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Project name is required' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_project_with_backlog', { ... })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { data }
}
```

---

## Don’t do this

### 1. Assuming multiple client calls are one transaction

```ts
// ❌ Two separate transactions; the first commits even if the second fails
const { data: project } = await supabase.from('projects').insert(...).select().single()
await supabase.from('tasks').insert({ project_id: project.id, title: 'Backlog', ... })
```

Use one RPC that does both inserts inside a single Postgres transaction.

### 2. Ignoring errors between steps

```ts
// ❌ If the second call fails, the project is already created
const { data: project } = await supabase.from('projects').insert(...).single()
if (!project) return { error: 'Failed to create project' }
const { error: taskError } = await supabase.from('tasks').insert(...)
if (taskError) return { error: taskError.message }  // Project is still there
```

Use an RPC so both steps roll back on any failure.

### 3. Doing heavy logic in the action instead of in the RPC

```ts
// ❌ Multiple round-trips; not atomic
const { data: maxOrder } = await supabase.from('tasks').select('order_index').eq('project_id', id).order('order_index', { ascending: false }).limit(1).single()
const nextOrder = (maxOrder?.order_index ?? -1) + 1
await supabase.from('tasks').insert({ project_id: id, order_index: nextOrder, ... })
```

Move "read max order + insert" into one Postgres function and call it via RPC.

### 4. RPC without exception handling (silent partial commit)

```sql
-- ❌ If the second insert fails, the first is already committed
insert into projects ...;
insert into tasks ...;  -- No exception block
```

Wrap the body in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE; END` so the whole transaction rolls back.

### 5. Returning sensitive columns from RPC

```sql
-- ❌ Don’t return columns the UI or contract doesn’t need
return (select to_jsonb(p) from projects p where p.id = v_project_id);  -- p is entire row
```

Select only the columns you need, e.g. `select id, name, category, created_at`.

---

## Quick reference

| Do                                                                | Don’t                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Use an RPC for 2+ writes that must be atomic                      | Rely on multiple `supabase.from()` calls to be one transaction |
| Put all steps in one Postgres function with BEGIN/EXCEPTION/RAISE | Assume ordering of client calls gives atomicity                |
| Validate input in the server action, then call RPC                | Put complex multi-step logic only in TypeScript                |
| Return minimal JSON from RPC (e.g. created row)                   | Return full table row with unused/sensitive columns            |
| Use `security definer` + auth check when needed                   | Expose RPC that can mutate any user’s data                     |

**When in doubt**: If more than one write must succeed or fail together, implement it in a Postgres function and call it via `supabase.rpc(...)`.
