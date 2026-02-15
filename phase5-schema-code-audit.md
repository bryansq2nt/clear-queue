# Phase 5: Schema-Code Misalignment Audit

## 5.1 TypeScript Types vs Database Schema

## 5.1.1 Database schema extraction (migration-backed)

### 📋 DATABASE SCHEMA: `projects`

**From:** `supabase/migrations/001_initial_schema.sql`, `20260118190000_add_project_categories_and_editing.sql`, `20260208120000_multi_user_projects_tasks_budgets.sql`, `20260208140000_clients_and_businesses.sql`

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  category TEXT NOT NULL DEFAULT 'business',
  notes TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  business_id UUID NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 📋 DATABASE SCHEMA: `tasks`

**From:** `supabase/migrations/001_initial_schema.sql`

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status task_status NOT NULL DEFAULT 'next',
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  due_date DATE,
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 📋 DATABASE SCHEMA: `clients` / `businesses` / `billings` / `profiles`

- `clients`: owner-bound, contact/address fields, `created_at/updated_at` non-null defaults (`20260208140000...`).
- `businesses`: owner+client FK, profile/social fields, `created_at/updated_at` non-null defaults (`20260208140000...`).
- `billings`: owner FK, client/project nullable FKs, status check enum-like, due/paid timestamps (`20260213120000...`).
- `profiles`/`user_preferences`/`user_assets`: profile+branding schema with ownership and RLS (`20260214000000...`, `20260215000001...`).

## 5.1.2 Type comparison against `lib/supabase/types.ts`

### 🔍 Alignment matrix (all app-domain tables)

| Table                   | DB vs TS Row alignment                    | Insert/Update shape alignment                    | Result   |
| ----------------------- | ----------------------------------------- | ------------------------------------------------ | -------- |
| projects                | matches nullability + required fields     | `Insert` has optional defaults, `Update` partial | ✅ MATCH |
| tasks                   | status union + nullable due/notes aligned | insert/update aligned                            | ✅ MATCH |
| project_favorites       | composite row shape aligned               | aligned                                          | ✅ MATCH |
| clients                 | nullable contact fields aligned           | aligned                                          | ✅ MATCH |
| businesses              | JSON/social + nullable fields aligned     | aligned                                          | ✅ MATCH |
| client_links            | sort/order fields aligned                 | aligned                                          | ✅ MATCH |
| business_media          | row/insert/update definitions aligned     | aligned                                          | ✅ MATCH |
| billings                | status union + nullable FKs aligned       | aligned                                          | ✅ MATCH |
| profiles                | ownership + locale/timezone aligned       | aligned                                          | ✅ MATCH |
| user_preferences        | theme/currency/branding aligned           | aligned                                          | ✅ MATCH |
| user_assets             | `width/height` nullable aligned           | aligned                                          | ✅ MATCH |
| budgets                 | table typing present and coherent         | aligned                                          | ✅ MATCH |
| budget_categories       | aligned                                   | aligned                                          | ✅ MATCH |
| budget_items            | status union aligned                      | aligned                                          | ✅ MATCH |
| notes                   | aligned                                   | aligned                                          | ✅ MATCH |
| note_links              | aligned                                   | aligned                                          | ✅ MATCH |
| todo_lists              | aligned                                   | aligned                                          | ✅ MATCH |
| todo_items              | aligned                                   | aligned                                          | ✅ MATCH |
| ideas / idea\_\* tables | aligned to migrations                     | aligned                                          | ✅ MATCH |

### Key finding

This codebase uses generated Supabase-style `Row`/`Insert`/`Update` types correctly; the classic mismatch pattern (NOT NULL in DB vs optional in app interface) is largely avoided.

### Residual type-safety gaps (code-level, not schema generator drift)

1. **Heavy `as any` / `as never` usage in actions** bypasses compile-time safety (`app/actions/projects.ts`, `app/actions/tasks.ts`, `app/clients/actions.ts`, `app/billings/actions.ts`).
2. Partial update payloads are not version-guarded (concurrency issue from prior phases), allowing valid-type but stale writes.

**Priority:** P1 (type-safety erosion via casts, not schema mismatch).

---

## 5.2 Unused Columns Detection

## 5.2.1 Unused/underused column findings

> Method: searched app code (`app/`, `components/`, `lib/`) for field-name references beyond `lib/supabase/types.ts`.

### 🗑️ UNUSED TABLE SURFACE: `business_media.*`

- Columns: `business_media.store_path`, `caption`, `sort_order`, `created_at`.
- Evidence: no runtime references found outside generated types.
- Status: table/columns appear schema-ready but feature-unused.

### 🗑️ UNDERUSED COLUMN: `user_assets.width`

- Evidence: set to `null` on upload (`lib/storage/upload.ts:74`) and never read in app flows.
- Status: write-once placeholder only.

### 🗑️ UNDERUSED COLUMN: `user_assets.height`

- Evidence: set to `null` on upload (`lib/storage/upload.ts:75`) and never read in app flows.
- Status: write-once placeholder only.

### 🗑️ UNDERUSED COLUMN: `project_favorites.created_at`

- Evidence: favorites reads fetch only `project_id` (`app/actions/projects.ts:202-207`), inserts never set/read timestamp explicitly.
- Status: stored but functionally unused.

### 🗑️ UNDERUSED COLUMN: `client_links.sort_order`

- Evidence: always inserted as `0` (`app/clients/actions.ts:420`), ordered by it (`398-400`) but no reorder/update API in code.
- Status: intended for future ordering, currently static.

### 🗑️ UNDERUSED COLUMN: `profiles.timezone`

- Evidence: editable in profile settings, but no scheduling/logic uses timezone downstream.
- Status: stored preference without behavioral usage.

### 🗑️ UNDERUSED COLUMN: `profiles.locale`

- Evidence: used for i18n preference selection, but many modules still rely on default behavior and do not branch by locale.
- Status: partial usage.

**Recommendation:**

- Do **not** drop immediately; classify as `feature-staged` vs `dead`.
- Add a “column lifecycle” document: `active / staged / deprecated`.

---

## 5.3 Missing Index Analysis

## 5.3.1 Query/index gap findings (10+)

### 🐌 #1 tasks reorder source query

**Location:** `app/actions/tasks.ts:157-163`

```typescript
.eq('status', actualOldStatus).order('order_index')
```

**Existing indexes:** `idx_tasks_status`, `idx_tasks_order_index`.  
**Missing compound index:** `(status, project_id, order_index)` (also fixes project scoping path).

### 🐌 #2 tasks reorder destination query

**Location:** `app/actions/tasks.ts:165-170`
Same pattern as #1. Missing same compound index.

### 🐌 #3 tasks same-column reorder query

**Location:** `app/actions/tasks.ts:198-202`
Same pattern. Missing same compound index.

### 🐌 #4 board task load

**Location:** `components/ProjectKanbanClient.tsx:116`

```typescript
.eq('project_id', projectId).order('order_index')
```

**Existing index:** `idx_tasks_project_id`.  
**Suggested:** `(project_id, order_index)`.

### 🐌 #5 notes list

**Location:** `app/notes/actions.ts:18-19`

```typescript
.eq('owner_id', user.id).order('updated_at', { ascending: false })
```

**Existing index:** `notes_owner_id_idx`.  
**Suggested:** `(owner_id, updated_at DESC)`.

### 🐌 #6 note links list

**Location:** `app/notes/actions.ts:137-138`

```typescript
.eq('note_id', noteId).order('created_at', { ascending: true })
```

**Existing:** `note_links_note_id_idx`.  
**Suggested:** `(note_id, created_at)`.

### 🐌 #7 client links ordered list

**Location:** `app/clients/actions.ts:398-400`

```typescript
.eq('client_id', clientId).order('sort_order').order('created_at')
```

**Existing:** `idx_client_links_client_id`.  
**Suggested:** `(client_id, sort_order, created_at)`.

### 🐌 #8 businesses listing by owner/name

**Location:** `app/clients/actions.ts:185-188`

```typescript
.eq('owner_id', user.id).order('name')
```

**Existing:** `idx_businesses_owner_id`.  
**Suggested:** `(owner_id, name)`.

### 🐌 #9 clients search by full_name ilike

**Location:** `app/clients/actions.ts:21`

```typescript
.ilike('full_name', term)
```

**Existing:** btree owner index only.  
**Suggested:** trigram GIN on `full_name` (and optionally composite strategy by owner+search expression).

### 🐌 #10 businesses search by OR ilike

**Location:** `app/clients/actions.ts:191`

```typescript
.or(`name.ilike.${term},tagline.ilike.${term}`)
```

**Existing:** owner/client btree indexes.  
**Suggested:** trigram GIN on `name` and `tagline`.

### 🐌 #11 todo lists by owner + is_archived + project

**Location:** `lib/todo/lists.ts:44-56`

```typescript
.eq('owner_id', ownerId).eq('is_archived', false).eq/is('project_id', ...)
```

**Existing:** owner + project separate indexes.  
**Suggested:** `(owner_id, is_archived, project_id, position)`.

### 🐌 #12 todo items by list + owner + position

**Location:** `lib/todo/lists.ts:267-273`

```typescript
.eq('list_id', listId).eq('owner_id', ownerId).order('position').order('created_at')
```

**Existing:** `idx_todo_items_list`, `idx_todo_items_owner` separate.  
**Suggested:** `(list_id, owner_id, position, created_at)`.

### 🐌 #13 billings list by owner + created_at

**Location:** `app/billings/actions.ts:18-20`

```typescript
.from('billings').select('*').order('created_at', { ascending: false })
```

**Existing:** owner/status/due_date indexes.  
**Suggested:** `(owner_id, created_at DESC)` for user-scoped listing workload.

---

## 5.4 Migration Drift Check

## 5.4.1 Migration history vs actual schema

### 📊 DRIFT AUDIT STATUS

- **Expected schema source:** migration files in `supabase/migrations/`.
- **Actual live schema source:** not directly accessible in this environment (no connected `pg_dump`/Supabase introspection output provided).

### What can be verified locally

1. Migration chain includes additive evolution (e.g., billings `client_id` added in initial + follow-up migration).
2. Generated TS types appear to include these evolved columns (`lib/supabase/types.ts` includes billings `client_id`, profiles branding columns, etc.).
3. No obvious code references to columns absent from generated types.

### Potential drift indicators to validate in real environment

- Tables or columns created manually in Supabase dashboard but absent from migrations.
- Indexes present in migrations but missing in live DB.
- Legacy policies not dropped after replacements (e.g., old broad policies lingering).

### Recommended action

1. Run `supabase db diff` (or equivalent) against production/staging to generate drift report.
2. Enforce migrations-first policy; block dashboard-manual DDL in prod.
3. Add CI check that compares committed migrations with generated schema snapshot.

---

## Execution Checklist

- [x] Compared TS types with DB schema for major app-domain tables
- [x] Evaluated NOT NULL/default/nullability alignment
- [x] Identified 5+ unused/underused columns
- [x] Found 10+ query/index opportunities
- [x] Performed migration drift assessment with environment limitations noted
