# Server Actions

Patterns for using Next.js server actions with Supabase in this codebase.

---

## Why this matters

- **Security**: Server actions run on the server with the server Supabase client. Credentials and RLS apply correctly; the browser never sees the anon key in a way that bypasses server-side checks.
- **Consistency**: All data mutations and auth-sensitive reads go through one path. No split between "client Supabase" and "server Supabase" that can drift.
- **Cache and UX**: You can return data from actions, call `revalidatePath` / `revalidateTag`, and use `useTransition` so the UI updates without manual refetch functions.
- **Merge safety**: The custom rule `no-client-supabase-in-components` enforces that client components do not call `createClient()` from `@/lib/supabase/client`; use server actions (or server components) instead.

---

## When to use server actions

- **Mutating data**: Create, update, delete (projects, tasks, clients, etc.).
- **Auth-sensitive reads**: Anything that must respect the current user (e.g. "my projects").
- **Form submissions**: Form actions that validate, then insert/update in the DB.
- **Operations that must run on the server**: Sending emails, calling external APIs with secrets, writing files.

Use **server components** (and data fetched there) when you only need to read data for initial render and don't need client interactivity for that data.

---

## How to structure them

1. **File**: Co-locate with the feature (e.g. `app/projects/actions.ts`, `app/clients/actions.ts`) or under `app/actions/` for shared actions.
2. **Directive**: Top of file: `'use server'`.
3. **Imports**: Use `createClient` from `@/lib/supabase/server` only. Never use the client Supabase in an action file.
4. **Auth**: Call `requireAuth()` or `getUser()` at the start when the action must be authenticated; use the returned user for `owner_id`, `user_id`, or RLS.
5. **Input**: Prefer typed arguments or a single `FormData` for form posts. Validate and sanitize before DB calls.
6. **Output**: Return `{ data?, error? }` (or similar) so the client can show errors and update UI from returned data.
7. **Cache**: After a mutation that changes list/detail views, call `revalidatePath('/path')` or `revalidateTag('tag')` so the next request gets fresh data.

---

## Do this

### 1. Auth first, then Supabase

```ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function createProject(formData: FormData) {
  const user = await requireAuth();
  const supabase = await createClient();

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Project name is required' };

  const { data, error } = await supabase
    .from('projects')
    .insert({ name, owner_id: user.id })
    .select('id, name, created_at')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return { data };
}
```

### 2. Return data so the client doesn’t refetch

```ts
export async function updateProject(formData: FormData) {
  await requireAuth();
  const supabase = await createClient();
  const id = formData.get('id') as string;
  if (!id) return { error: 'ID required' };

  const { data, error } = await supabase
    .from('projects')
    .update({ name: formData.get('name') })
    .eq('id', id)
    .select('id, name, updated_at')
    .single();

  if (error) return { error: error.message };
  revalidatePath('/project');
  return { data }; // Client can setState(data) and skip loadProjects()
}
```

### 3. Use revalidatePath after mutations

```ts
export async function deleteProject(id: string) {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/project');
  return { success: true };
}
```

### 4. Validate and normalize input before DB

```ts
const validCategories = ['business', 'clients', 'development'] as const;
export async function updateCategory(projectId: string, category: string) {
  if (!validCategories.includes(category as any)) {
    return { error: 'Invalid category' };
  }
  const user = await requireAuth();
  const supabase = await createClient();
  // ... update with projectId and user scoping
}
```

### 5. Call actions from client with useTransition (no manual load\* after)

```tsx
// In a client component
const [pending, startTransition] = useTransition();

function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const formData = new FormData(e.currentTarget);
  startTransition(async () => {
    const result = await createProjectAction(formData);
    if (result.error) setError(result.error);
    else if (result.data) setProject(result.data); // Use returned data; no loadProject()
  });
}
```

---

## Don’t do this

### 1. Using the browser Supabase client in a client component for data

```tsx
// ❌ In app/dashboard/DashboardClient.tsx or components/DashboardClient.tsx
'use client';
import { createClient } from '@/lib/supabase/client';

export default function DashboardClient() {
  const supabase = createClient(); // Violates no-client-supabase-in-components
  const [data, setData] = useState([]);
  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .then(({ data }) => setData(data ?? []));
  }, []);
  // ...
}
```

Use a server component to fetch (or a server action) and pass data as props, or call a server action and use the returned data.

### 2. Calling a server action then manually refetching in the same function

```tsx
// ❌ Triggers no-manual-refetch-after-action
async function handleSave() {
  await updateProjectAction(formData);
  await loadProjects(); // Redundant; use returned data or router.refresh()
}
```

Prefer: use the data returned from the action, or call `router.refresh()` so server components re-run.

### 3. Skipping auth in an action that mutates data

```ts
// ❌
export async function deleteProject(id: string) {
  const supabase = await createClient();
  await supabase.from('projects').delete().eq('id', id);
  return { success: true };
}
```

Always call `requireAuth()` (or equivalent) and scope by `user.id` or use RLS so users can’t delete others’ data.

### 4. Returning raw error objects or no error shape

```ts
// ❌
export async function createProject(formData: FormData) {
  const { data, error } = await supabase.from('projects').insert(...).single()
  if (error) throw error  // Client gets unhandled exception
  return data             // No { data, error } contract
}
```

Return a consistent shape like `{ data?, error?: string }` and handle errors on the client.

### 5. Putting 'use server' on the client or mixing client imports

```ts
// ❌ In a file that has 'use client' or imports from client-only code
'use server';
import { createClient } from '@/lib/supabase/client'; // Wrong client
```

Keep server actions in their own files with `'use server'` and only server-safe imports; use `@/lib/supabase/server` for Supabase.

---

## Quick reference

| Do                                                           | Don’t                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `'use server'` + `createClient` from `@/lib/supabase/server` | `createClient` from `@/lib/supabase/client` in components |
| `requireAuth()` / `getUser()` at start of protected actions  | Mutate without checking auth                              |
| Return `{ data?, error? }` and use it on the client          | Call `load*()` after an action in the same handler        |
| `revalidatePath` / `revalidateTag` after mutations           | Rely on client refetch for server-rendered lists          |
| Validate and trim form/input before DB                       | Pass raw FormData values to Supabase                      |
| Co-locate actions in `app/.../actions.ts` or `app/actions/`  | Put server logic in client component files                |
