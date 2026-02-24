# Document Hub Pre-Build Audit

Answers to the "Questions for Cursor — Document Hub Pre-Build Audit" based on the current codebase. Use this as the single reference when implementing Document Hub.

---

## 1. Database & Schema

### 1.1 Full schema for the `projects` table

The `projects` table was built across several migrations. **Current columns:**

| Column        | Type        | Nullable | Notes                                                                                                                                 |
| ------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID        | NOT NULL | PK, default `gen_random_uuid()`                                                                                                       |
| `name`        | TEXT        | NOT NULL |                                                                                                                                       |
| `color`       | TEXT        | NULL     |                                                                                                                                       |
| `category`    | TEXT        | NOT NULL | Default `'business'`, CHECK: `business`, `clients`, `development`, `internal_tools`, `operations`, `personal`, `research`, `archived` |
| `notes`       | TEXT        | NULL     | Long-form project notes                                                                                                               |
| `owner_id`    | UUID        | NOT NULL | References `auth.users(id)` ON DELETE CASCADE                                                                                         |
| `client_id`   | UUID        | NULL     | References `clients(id)` ON DELETE SET NULL                                                                                           |
| `business_id` | UUID        | NULL     | References `businesses(id)` ON DELETE SET NULL; must belong to `client_id` (trigger)                                                  |
| `created_at`  | TIMESTAMPTZ | NOT NULL | Default NOW()                                                                                                                         |
| `updated_at`  | TIMESTAMPTZ | NOT NULL | Default NOW(); maintained by trigger `update_projects_updated_at`                                                                     |

**Ownership:** `owner_id` identifies the project owner. RLS restricts all access to rows where `owner_id = auth.uid()`.

**Status / soft delete:** There is **no** `status` column and **no** soft-delete column (e.g. `deleted_at`) on `projects`. "Archived" is represented only as a category value (`category = 'archived'`).

**Migrations that define/alter `projects`:**

- `001_initial_schema.sql` — create table (id, name, color, created_at), RLS
- `20260118190000_add_project_categories_and_editing.sql` — category, updated_at, color, trigger for updated_at
- `20260119000000_add_project_notes.sql` — notes
- `20260208120000_multi_user_projects_tasks_budgets.sql` — owner_id, RLS by owner
- `20260208140000_clients_and_businesses.sql` — client_id, business_id, trigger for client/business consistency

---

### 1.2 What does `requireAuth()` return?

**Full Supabase `User` object** (not just `userId`).

Definition in `lib/auth.ts`:

```typescript
export async function requireAuth() {
  const user = await getUser();

  if (!user) {
    redirect('/');
  }

  return user;
}
```

`getUser()` returns `supabase.auth.getUser()` → `data.user`. So you get the full session user (e.g. `user.id`, `user.email`, etc.). Typical usage when you need the id: `const user = await requireAuth();` then use `user.id`.

---

### 1.3 Shared `updated_at` trigger utility

**Yes.** The shared function is **`update_updated_at_column()`**.

**Definition** (from `001_initial_schema.sql` and reused in many migrations, e.g. `202601250000_presupuestos.sql`):

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

Tables attach it with a trigger, e.g.:

```sql
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Note:** The `projects` table uses a dedicated function and trigger: `update_projects_updated_at_column()` and `update_projects_updated_at` (see `20260118190000_add_project_categories_and_editing.sql`). For new tables (e.g. Document Hub), use the shared `update_updated_at_column()`.

---

### 1.4 Does `project_files` exist? Current migration and TypeScript type

**No.** `project_files` does **not** exist in the database.

- There is **no** migration creating a `project_files` table.
- `lib/supabase/types.ts` has **no** `project_files` type; it has `projects`, `tasks`, `notes`, `project_links`, etc., but no `project_files`.
- The plan doc `docs/plans/plan-link-vault.md` explicitly says that Media Vault, Document Hub, and a unified Files page are out of scope for that plan and that the DB may later grow with `project_files` (and `project_events`).

So Document Hub will need a **new migration** to create `project_files` (or equivalent) and then types can be regenerated or extended.

---

### 1.5 TypeScript type for `project_files` in `lib/supabase/types.ts`

**N/A** — `project_files` is not in the codebase. After you add the table via migration, run Supabase type generation (or add types manually) and you’ll get something like `Database['public']['Tables']['project_files']['Row']` in `lib/supabase/types.ts`.

---

## 2. Project Infrastructure & Patterns

### 2.1 Folder structure under `app/project/[id]/`

There is **only one** file:

- `app/project/[id]/page.tsx` — server component that calls `requireAuth()`, reads `params.id`, and **redirects** to `/context/${id}/board`.

So the real “project” UI lives under **`app/context/[projectId]/`**, not under `app/project/[id]/`. Document Hub should follow the **context** structure.

**Relevant context structure:**

- `app/context/layout.tsx` — wraps with `ContextDataCacheProvider`
- `app/context/[projectId]/layout.tsx` — `requireAuth()`, renders `ContextLayoutWrapper(projectId)` with children
- `app/context/[projectId]/ContextLayoutWrapper.tsx` — client; loads project (cache or fetch), then `ContextLayoutClient`
- `app/context/[projectId]/ContextLayoutClient.tsx` — records access, renders `ContextShell` (header + tab bar + main)
- `app/context/[projectId]/board/` — board tab (page, BoardContent, ContextBoardFromCache, ContextBoardClient)
- `app/context/[projectId]/notes/` — notes tab (page, ContextNotesFromCache, ContextNotesClient; sub-routes `new`, `[noteId]`)
- `app/context/[projectId]/links/` — links tab
- `app/context/[projectId]/ideas/` — ideas tab (and `board/[boardId]`)
- `app/context/[projectId]/budgets/` — budgets tab
- `app/context/[projectId]/todos/` — todos tab
- `app/context/[projectId]/owner/` — owner tab

Adding Document Hub would mean adding e.g. `app/context/[projectId]/documents/` (or `files/`) with the same pattern: `page.tsx` → `*FromCache` → `*Client` and optional detail routes.

---

### 2.2 Example of a complete, working server action file

**`app/actions/notes.ts`** is a good reference. It includes:

- `'use server'`
- `cache()` for read-only actions (`getNotes`)
- `requireAuth()` (sometimes capturing `user` for `owner_id`)
- `createClient()` from `@/lib/supabase/server`
- Explicit column lists in every `.select()`
- Scoping by `owner_id` and optional `projectId`
- `revalidatePath` after every mutation (multiple paths: `/notes`, `/notes/[id]`, `/context`)
- Return shape `{ error?: string; data?: T }` for mutations
- Sentry `captureWithContext` on errors

Relevant snippet (structure only):

```ts
'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/supabase/types';

export const getNotes = cache(async (options?: { projectId?: string }) => {
  const user = await requireAuth();
  const supabase = await createClient();
  const noteCols = 'id, owner_id, project_id, title, content, created_at, updated_at';
  let query = supabase.from('notes').select(noteCols).eq('owner_id', user.id).order('updated_at', { ascending: false });
  if (options?.projectId?.trim()) query = query.eq('project_id', options.projectId.trim());
  const { data, error } = await query;
  // ...
  return (data as Note[]) || [];
});

export async function createNote(params: { ... }): Promise<{ error?: string; data?: Note }> {
  const user = await requireAuth();
  // ... insert with owner_id: user.id, then:
  revalidatePath('/notes');
  revalidatePath('/notes/[id]');
  revalidatePath('/context');
  return { data: data as Note };
}
```

Use this pattern for Document Hub actions (with project-scoped reads and ownership/RLS as needed).

---

### 2.3 Storage helper pattern for file upload

**No project-level file upload exists yet.** The only storage in the app is:

- **Bucket:** `user-assets` (private), created in `supabase/migrations/20260214000000_profile_and_branding.sql`.
- **Path convention:** `{user_id}/{kind}/{uuid}.{ext}`.
- **Policies:** All scoped to `(storage.foldername(name))[1] = auth.uid()::text` (user can only access their own folder).

There is **no** shared helper module for uploads in the codebase; profile/branding would use the Supabase client and that bucket directly. Document Hub will need:

- New bucket(s) or paths (e.g. project-scoped) and RLS/policies.
- A small helper or actions for upload/list/delete that respect project ownership (and optionally a `project_files` table).

---

### 2.4 How `revalidatePath` is used — path-based vs tag-based

- **Path-based:** Used everywhere. After mutations, actions call `revalidatePath('/...')` and often several paths (e.g. `/context`, `/context/${projectId}`, `/context/${projectId}/links`).
- **Tag-based:** **Not used** in the codebase. `.cursorrules` and docs mention `revalidateTag` as an option, but no file actually calls `revalidateTag`. There is no `unstable_cache` with tags either.

So: **path-based revalidation only.** For Document Hub, after create/update/delete of documents, call `revalidatePath('/context')`, `revalidatePath(\`/context/${projectId}\`)`, and `revalidatePath(\`/context/${projectId}/documents\`)` (or whatever the tab path is).

---

## 3. Navigation & Tab System

### 3.1 Tab component and how tabs are defined

The tab bar is **`components/context/ContextTabBar.tsx`** (there is no `ProjectContextNav.tsx`). It receives `projectId` and optional `onExitStart` for the “Salir” transition.

**How tabs are defined:** A constant array `TABS` with `slug`, `labelKey` (i18n), and icon:

```ts
const TABS = [
  { slug: 'board', labelKey: 'context.stages', icon: LayoutGrid },
  { slug: 'owner', labelKey: 'context.project_owner', icon: UserCircle },
  { slug: 'notes', labelKey: 'context.notes', icon: FileText },
  { slug: 'links', labelKey: 'context.links', icon: LinkIcon },
  { slug: 'ideas', labelKey: 'context.ideas', icon: Lightbulb },
  { slug: 'budgets', labelKey: 'context.budgets', icon: DollarSign },
  { slug: 'todos', labelKey: 'context.todos', icon: CheckSquare },
] as const;
```

**Active state:** Derived from `usePathname()`:

- `href` for board is `base` (`/context/${projectId}`), for others `base/${slug}`.
- Active when `pathname === href` or (for non-board) `pathname.startsWith(base/${slug})`.

**Adding a new tab:** (1) Add an entry to `TABS` in `ContextTabBar.tsx` (e.g. `documents` with label key and icon). (2) Create the route folder under `app/context/[projectId]/` (e.g. `documents/page.tsx` and optional sub-routes). No other central config.

---

### 3.2 `app/context/[projectId]/layout.tsx` in full

```tsx
import { requireAuth } from '@/lib/auth';
import ContextLayoutWrapper from './ContextLayoutWrapper';

export default async function ContextProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return (
    <ContextLayoutWrapper projectId={projectId}>
      {children}
    </ContextLayoutWrapper>
  );
}
```

So the layout only enforces auth and passes `projectId` into `ContextLayoutWrapper`. The wrapper (client) loads project data from cache or `getProjectById(projectId)`, then renders `ContextLayoutClient(projectId, projectName)` which renders `ContextShell` (header + `ContextTabBar` + main). Tab content is whatever `children` is for the current route (e.g. board, notes, documents).

---

### 3.3 Sub-tabs inside a module

- **Ideas:** Has a sub-route `ideas/board/[boardId]` (board canvas). No second-level tab bar; navigation to a board is via links/UI that push to that route.
- **Notes:** Has list at `notes` and detail at `notes/[noteId]` (and `notes/new`). No internal tab bar.
- **Budgets:** Has list and `budgets/[budgetId]`. No internal tab bar.

So **sub-tabs are just nested routes**; there is no shared “sub-tab bar” component. Modules implement their own links/buttons to switch between list/detail or list/board.

---

### 3.4 Shared tab/subtab UI primitive

- **Tabs:** The only shared tab UI is **`ContextTabBar`** for the main context tabs (board, owner, notes, links, ideas, budgets, todos). It’s a single component; new tabs are added by editing `TABS` and adding the route.
- **Sub-tabs:** No shared primitive. Modules use standard links, buttons, or Radix `Tabs` (`components/ui/tabs.tsx`) if they need in-page tabs. For Document Hub you can either use nested routes only (like notes) or add a small in-page tab list (e.g. “All / By type”) with local state or search params.

---

## 4. Security & RLS

### 4.1 Example RLS policy block (notes)

From `supabase/migrations/20260208180000_notes_and_note_links.sql`:

```sql
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own notes"
  ON public.notes FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (owner_id = auth.uid());
```

So notes are **owner-scoped**: every operation requires `owner_id = auth.uid()`. For project-scoped resources (e.g. documents) you can either use an `owner_id` on the file row or a policy that joins to `projects` and checks `projects.owner_id = auth.uid()`.

---

### 4.2 How the app verifies project ownership in server actions

There is **no** single shared “assert project ownership” helper. Pattern in practice:

- **Auth:** Every action calls `await requireAuth()` (and often keeps `user` for inserts or checks).
- **RLS:** Project-scoped tables (tasks, project_links, etc.) have RLS that ties access to project ownership (e.g. `EXISTS (SELECT 1 FROM projects p WHERE p.id = ... AND p.owner_id = auth.uid())`). So the server-side Supabase client (with the user’s session) only sees rows the user is allowed to see.
- **Explicit checks when needed:** When the action needs to branch on “is this my project?” (e.g. to return 404 or a custom message), it uses `getProjectById(projectId)` from `app/actions/projects.ts` (cached, read-only). That returns `null` if the user has no access (RLS) or the project doesn’t exist. No inline “select project and check owner_id” pattern; they rely on `getProjectById` + null check.

So: **use RLS for enforcement**, and **use `getProjectById(projectId)` when you need an explicit “has access / is owner” check** in an action.

---

### 4.3 Storage bucket policies for `project-media` and `project-docs` (PR1)

**They do not exist.** The only storage bucket in migrations is **`user-assets`** in `20260214000000_profile_and_branding.sql` (for profile/branding assets, path `{user_id}/{kind}/{uuid}.{ext}`). There are no `project-media` or `project-docs` buckets or policies. Document Hub will need new bucket(s) and RLS policies (and possibly a `project_files` table with project_id and ownership).

---

## 5. Cache System

### 5.1 Caching strategy in use

- **Next.js:** Path-based **`revalidatePath`** after mutations. No `unstable_cache` or `revalidateTag` in the codebase.
- **React:** **`cache()`** from `react` wraps read-only server actions (e.g. `getNotes`, `getProjectById`) so that multiple callers in the same request share one result.
- **Client-side (context):** **Context session cache** implemented in `app/context/ContextDataCache.tsx` — a React Context holding a key/value store so that when the user returns to an already-visited project/tab, data is shown from memory without refetching. No server-side tag-based cache.

---

### 5.2 How an existing module (Notes) implements cache

- **Fetch (read):** `getNotes({ projectId })` in `app/actions/notes.ts` is wrapped in React `cache(...)` so it’s deduped per request. It’s not using `unstable_cache` or tags.
- **Cache wrapper:** `ContextNotesFromCache` (client component):
  - Reads from `useContextDataCache()` with key `{ type: 'notes', projectId }`.
  - On **cache hit:** Renders `ContextNotesClient` with cached data, no loading.
  - On **cache miss:** Shows `<SkeletonNotes />`, calls `getNotes({ projectId })`, then `cache.set({ type: 'notes', projectId }, data)` and renders `ContextNotesClient` with that data.
- **Invalidation:** The client receives `onRefresh` (a function that invalidates the cache key and refetches). After a mutation (e.g. delete note), the handler calls `onRefresh()` (or updates from returned data). So invalidation is **client-driven** via the context cache’s `invalidate` + refetch in the `*FromCache` wrapper.

No `revalidateTag` or cache tags on the server; the only “tags” are the **client cache key types** like `notes`, `board`, `links`, etc., plus `projectId` (and for note detail, `noteId`).

---

### 5.3 Cache keys / “tags” and naming

- **Scope:** Per project and per data type. Keys are: `{ type: 'board' | 'notes' | 'links' | 'linkCategories' | 'ideas' | 'owner' | 'budgets' | 'todos' | 'project'; projectId: string }` or for note detail `{ type: 'noteDetail'; noteId: string }`.
- **Naming:** Literal type + id. Example: `notes:${projectId}`, `project:${projectId}`. Implemented in `ContextDataCache.tsx` as `cacheKeyToString(k)`.

So for Document Hub you’d add something like `{ type: 'documents'; projectId: string }` and optionally a detail key (e.g. `documentDetail:${documentId}`) if you cache detail view data.

---

### 5.4 Central cache utility

**Yes:** `app/context/ContextDataCache.tsx`. It provides:

- **Provider:** `ContextDataCacheProvider` — holds the in-memory store; must live in a layout that stays mounted when switching projects (e.g. `app/context/layout.tsx`).
- **API:** `get<T>(key)`, `set<T>(key, value)`, `invalidate(key)`, `invalidateProject(projectId)`.
- **Hook:** `useContextDataCache()`.

There is no other central cache file. Server-side “cache” is just React `cache()` on the getter actions and revalidation via `revalidatePath`.

---

## 6. Cursor Rules & Conventions

### 6.1 Contents of `.cursorrules` / cursor.rules / AGENTS.md / CONVENTIONS.md

- **`.cursorrules`** exists at repo root and is the main rule set. It covers:
  - Database: explicit column selection, scope by `project_id` / `owner_id`, RPC for atomic multi-step ops.
  - Server actions: `'use server'`, always `revalidatePath` (or `revalidateTag`) after mutations, no `createClient()` in components (only server or server components).
  - Data loading: fetch in Server Components, wrap read-only actions with `cache()`, pass data as props; never initial data fetch in `useEffect` in a page.
  - Context session cache: use client cache for “return to same context,” provider in parent layout (e.g. `app/context/layout.tsx`), `*FromCache` + `onRefresh` pattern, invalidate after mutations.
  - Loading: shimmer/skeleton only; no spinners or “Loading…” text.
  - No `router.refresh()` after insert/update; use returned data or `onRefresh`.
  - Prettier: semicolons, single quotes, `tabWidth: 2`, `trailingComma: "es5"`; run Prettier after edits.
  - Before generating: check `docs/patterns/`, use `templates/`, follow CURSOR_RULES.md if present.

- **AGENTS.md** exists at the repo root. It is the authoritative contract for humans and AI agents. It defines core invariants, repo architecture, golden paths, DoD checklist, and transitional notes.
- **CONVENTIONS.md** exists at the repo root. It defines the official four-layer model (UI → Application → Domain → Infrastructure), folder structure, naming conventions, query/cache patterns, module blueprint, and testing strategy.

---

### 6.2 Import alias structure

From `tsconfig.json`:

```json
"paths": { "@/*": ["./*"] }
```

So:

- **`@/lib`** → `./lib` (repo root)
- **`@/components`** → `./components`
- **`@/app`** → `./app`

All are relative to the project root. No other aliases.

---

### 6.3 UI component library and sheet/drawer example

- **Library:** Radix UI primitives (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, etc.) plus Tailwind and small wrappers in `components/ui/` (button, input, label, dialog, dropdown-menu, select, tabs, textarea, skeleton). This is the typical “shadcn-style” set without the shadcn name.
- **Sheet/drawer:** There is **no** `Sheet` or `Drawer` component in `components/ui`. The only drawer-like usage is **`app/ideas/IdeaDrawer.tsx`**, which uses **`Dialog`** from `@/components/ui/dialog` (Radix Dialog). So for slide-out or overlay panels, the codebase uses **Dialog** (e.g. for idea detail). If Document Hub needs a side panel, use **Dialog** or add a Sheet component (e.g. Radix or shadcn Sheet) and use it consistently.

---

### 6.4 TypeScript strictness

From `tsconfig.json`:

- **`strict`:** `true`
- **`noUncheckedIndexedAccess`:** not set (so not enabled)
- Other usual options: `skipLibCheck: true`, `noEmit: true`, `isolatedModules: true`, etc.

So strict mode is on; indexed access is not strictly checked.

---

## 7. Existing Module to Use as Reference (Document Hub)

### 7.1 Most complete reference module: Notes

The **Notes** module under the context area is the best reference for “list + detail with session cache and server actions”:

- Lives under **`app/context/[projectId]/notes/`** (and uses shared actions from `app/actions/notes.ts`).
- Uses the full pattern: server page → `*FromCache` → `*Client`, cache key `notes:${projectId}`, `onRefresh` after mutations, no `router.refresh()`.
- Has a list view and a detail view (`[noteId]`) plus `new` for creation.
- Server actions use explicit selects, `owner_id` / `project_id` scoping, `revalidatePath`, and return `{ data?, error? }`.

Use Notes as the **reference implementation** for Document Hub (list + optional detail, cache, actions, RLS).

---

### 7.2 Reference files for that module

| Purpose                      | File                                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server actions**           | `app/actions/notes.ts` — getNotes (cached), getNoteById, createNote, updateNote, deleteNote, getNoteLinks, addNoteLink, deleteNoteLink; all with explicit columns, requireAuth, revalidatePath.             |
| **Main list page (context)** | `app/context/[projectId]/notes/page.tsx` — async page, requireAuth, renders `<ContextNotesFromCache projectId={projectId} />`.                                                                              |
| **Cache wrapper**            | `app/context/[projectId]/notes/ContextNotesFromCache.tsx` — get/set cache key `{ type: 'notes', projectId }`, loading = `<SkeletonNotes />`, renders `ContextNotesClient` with initialNotes and onRefresh.  |
| **List/row client**          | `app/context/[projectId]/notes/ContextNotesClient.tsx` — receives initialNotes and onRefresh; list of cards (title, updated_at, dropdown menu View/Edit/Delete); FAB to create; navigates to detail or new. |
| **Detail cache wrapper**     | `app/context/[projectId]/notes/[noteId]/ContextNoteDetailFromCache.tsx` — cache key `{ type: 'noteDetail', noteId }`, fetches note + links, renders ContextNoteDetailClient.                                |
| **Detail client**            | `app/context/[projectId]/notes/[noteId]/ContextNoteDetailClient.tsx` — wraps `NoteEditor` with list/detail hrefs and onSaveSuccess/onDeleteSuccess (invalidates cache).                                     |

For Document Hub, mirror this with e.g.:

- `app/context/[projectId]/documents/page.tsx` → `ContextDocumentsFromCache` → `ContextDocumentsClient`
- Optional `app/context/[projectId]/documents/[documentId]/` with a `*FromCache` + client and a cache key for document detail
- A new `app/actions/documents.ts` (or under context) with cached getter + create/update/delete and `revalidatePath` + return data/error.

---

_End of Document Hub Pre-Build Audit._
