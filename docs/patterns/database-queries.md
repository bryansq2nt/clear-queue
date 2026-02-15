# Database Queries

Patterns for writing optimized, secure Supabase/Postgres queries in this codebase.

---

## Why this matters

- **Performance**: Selecting only the columns you need reduces payload size and speeds up responses. The custom rule `no-select-star` enforces explicit field selection.
- **Security**: Every query that touches user data must be scoped by `owner_id`, `user_id`, or equivalent so RLS and application logic align. Unscoped queries can leak or mutate the wrong rows.
- **Stability**: Explicit column lists avoid breakage when new columns are added to the table. They also document what the caller actually uses.
- **Cost**: Smaller responses mean less memory and network; in serverless environments this can reduce cost and timeouts.

---

## Requirements

1. **Explicit field selection**: Never use `.select('*')`. Always list columns (and nested relations) you need.
2. **Proper scoping**: Filter by `project_id`, `user_id`, `owner_id`, or the relevant tenant/context so rows are limited to the current user or resource.

---

## Do this

### 1. Select only the columns you need

```ts
// ✅ List view: only fields for cards and links
const { data, error } = await supabase
  .from('projects')
  .select('id, name, color, category, created_at')
  .eq('owner_id', user.id)
  .order('created_at', { ascending: false });
```

### 2. Scope by user (owner_id / user_id)

```ts
// ✅ Only this user's projects
const { data } = await supabase
  .from('projects')
  .select('id, name, category, client_id, clients(full_name)')
  .eq('owner_id', user.id)
  .order('name');
```

### 3. Scope by parent resource (project_id, client_id)

```ts
// ✅ Tasks for a single project
const { data } = await supabase
  .from('tasks')
  .select('id, title, status, order_index, due_date')
  .eq('project_id', projectId)
  .order('order_index');

// ✅ Projects for a single client
const { data } = await supabase
  .from('projects')
  .select('id, name, color, category')
  .eq('client_id', clientId);
```

### 4. Use nested select for relations (explicit fields)

```ts
// ✅ One level: only needed fields from related table
const { data } = await supabase
  .from('projects')
  .select(
    `
    id,
    name,
    category,
    client_id,
    clients ( id, full_name )
  `
  )
  .eq('owner_id', user.id);
```

### 5. Insert/update then return specific fields

```ts
// ✅ Return only what the UI needs after insert
const { data, error } = await supabase
  .from('projects')
  .insert({ name, owner_id: user.id, category })
  .select('id, name, category, created_at')
  .single();
```

---

## Don’t do this

### 1. Using select('\*')

```ts
// ❌ Banned by no-select-star
const { data } = await supabase
  .from('projects')
  .select('*')
  .eq('owner_id', user.id);
```

Use an explicit column list (e.g. `id, name, color, category`).

### 2. No scoping (missing user_id / project_id)

```ts
// ❌ Can return or affect other users' data if RLS is misconfigured
const { data } = await supabase
  .from('projects')
  .select('id, name')
  .order('created_at', { ascending: false });
```

Always add `.eq('owner_id', user.id)` (or the correct scope for the table).

### 3. Scoping only in application code

```ts
// ❌ Fetching "all" then filtering in JS is unsafe and wasteful
const { data } = await supabase.from('tasks').select('id, title, project_id');
const mine = (data ?? []).filter((t) => t.project_id === projectId);
```

Apply `.eq('project_id', projectId)` (and other scopes) in the query.

### 4. Selecting wide tables for a single value

```ts
// ❌ If you only need existence or one column
const { data } = await supabase
  .from('projects')
  .select(
    'id, name, color, notes, created_at, updated_at, client_id, business_id, owner_id, category'
  )
  .eq('id', id)
  .single();
```

Select only what you use, e.g. `.select('id, name, category')`.

### 5. Nested select('\*') or unlisted relations

```ts
// ❌
.select('id, name, clients(*)')
```

List the columns you need from `clients`, e.g. `clients ( id, full_name )`.

---

## Examples with annotations

### List projects for dashboard (scoped + explicit fields)

```ts
const user = await requireAuth();
const supabase = await createClient();

// Scope: owner_id. Fields: only what the list UI needs.
const { data, error } = await supabase
  .from('projects')
  .select('id, name, color, category, client_id, clients(full_name)')
  .eq('owner_id', user.id)
  .order('created_at', { ascending: true });
```

### Single project by id (must still scope)

```ts
// Scope: id + owner_id so user can’t load another user’s project.
const { data, error } = await supabase
  .from('projects')
  .select(
    'id, name, color, category, notes, client_id, business_id, created_at'
  )
  .eq('id', projectId)
  .eq('owner_id', user.id)
  .single();
```

### Tasks in a project (scope by project_id)

```ts
// Scope: project_id (and ensure project is owned by user elsewhere if needed).
const { data } = await supabase
  .from('tasks')
  .select('id, title, status, order_index, due_date, priority')
  .eq('project_id', projectId)
  .order('order_index');
```

### Favorites (scope by user_id)

```ts
const { data } = await supabase
  .from('project_favorites')
  .select('project_id')
  .eq('user_id', user.id);
```

---

## Quick reference

| Do                                                                   | Don’t                                              |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| `.select('id, name, ...')` with explicit columns                     | `.select('*')`                                     |
| `.eq('owner_id', user.id)` or `.eq('user_id', user.id)` on user data | Queries with no user/project scope                 |
| `.eq('project_id', projectId)` for child rows                        | Fetching all then filtering in JS                  |
| List only needed columns from relations: `clients ( id, full_name )` | `clients (*)` or unnamed nested select             |
| Return minimal fields after insert/update: `.select('id, name')`     | Returning full row when only a few fields are used |

**Scope checklist**: For each query, confirm: (1) **Who** (user_id / owner_id) and (2) **What** (project_id, client_id, etc.) so the result set is bounded and correct.
