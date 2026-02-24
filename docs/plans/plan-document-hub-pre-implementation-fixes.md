# Document Hub — Pre-Implementation Fix Plan

**Date:** 2026-02-24
**Status:** Ready for execution
**Scope:** Fixes required _before_ starting Document Hub implementation
**Related docs:**

- `docs/pre-build/document-hub-design.md`
- `docs/pre-build/document-hub-pre-build-audit.md`

---

## Summary

A codebase audit was run against the current repo to identify any issues that would block or create technical debt during Document Hub implementation. The audit found **2 existing code violations** that should be fixed first, **3 design doc corrections** needed to prevent wrong implementation decisions, and **1 implementation prerequisite** that must be addressed at the start of Phase 1.

No architectural blockers were found. The codebase patterns (cache system, server actions, RLS, storage) are all sound and ready for Document Hub to follow.

---

## Findings

### FINDING-1 — `lib/storage/upload.ts:84` — Bare `.select()` after insert (HIGH)

**File:** `lib/storage/upload.ts`
**Line:** 84

**Problem:**

```ts
const { data: row, error: insertError } = await supabase
  .from('user_assets')
  .insert(insertPayload as never)
  .select() // ← no column list — equivalent to SELECT *
  .single();
```

`.select()` with no arguments returns all columns. This violates the hard rule from `AGENTS.md` and `CONVENTIONS.md`: _"Always select explicit columns (never select '_')."\* The ESLint rule `clear-queue/no-select-star` enforces this, but the bare `.select()` form may not be caught by that rule's implementation.

**Fix:**
Replace the bare `.select()` with an explicit column list matching the `user_assets` table schema:

```ts
const { data: row, error: insertError } = await supabase
  .from('user_assets')
  .insert(insertPayload as never)
  .select(
    'id, user_id, kind, bucket, path, mime_type, size_bytes, width, height, created_at'
  )
  .single();
```

**Why fix before Document Hub:**
Document Hub's `uploadDocumentAction` will follow the exact same upload → insert → return-row pattern from `lib/storage/upload.ts` as a reference. If the reference has a bare `.select()`, the implementing agent will copy it.

---

### FINDING-2 — `app/actions/notes.ts:220` — Bare `.select()` after insert in `addNoteLink` (HIGH)

**File:** `app/actions/notes.ts`
**Line:** 220

**Problem:**

```ts
const { data, error } = await supabase
  .from('note_links')
  .insert(insertPayload as never)
  .select() // ← no column list — equivalent to SELECT *
  .single();
```

Same violation as FINDING-1 — bare `.select()` after an insert returns all columns.

**Fix:**
Replace with explicit columns matching the `note_links` table:

```ts
const { data, error } = await supabase
  .from('note_links')
  .insert(insertPayload as never)
  .select('id, note_id, title, url, created_at')
  .single();
```

**Why fix before Document Hub:**
`app/actions/notes.ts` is the golden-path reference for Document Hub server actions (explicitly called out in `document-hub-pre-build-audit.md` section 7.2). The implementing agent will read this file and copy patterns from it.

---

### FINDING-3 — `docs/pre-build/document-hub-design.md` — Server action names use forbidden `Action` suffix (MEDIUM)

**File:** `docs/pre-build/document-hub-design.md`
**Sections:** 4.2, 4.3, 4.4, 4.5, 4.6, 4.7

**Problem:**
The design document names all server actions with the `Action` suffix:

- `uploadDocumentAction`
- `updateDocumentAction`
- `archiveDocumentAction`
- `markDocumentFinalAction`
- `getDocumentSignedUrlAction`
- `touchDocumentAction`

`CONVENTIONS.md` section 2 and `AGENTS.md` section 1 explicitly state: _"Exported server actions must be verb-first and must NOT use the `Action` suffix."_ This is also enforced by a transitional note in `AGENTS.md` section 6 that calls out legacy names and says new code must follow the rule.

**Correct names for Document Hub actions:**
| Current (wrong) | Correct |
|---|---|
| `uploadDocumentAction` | `uploadDocument` |
| `updateDocumentAction` | `updateDocument` |
| `archiveDocumentAction` | `archiveDocument` |
| `markDocumentFinalAction` | `markDocumentFinal` |
| `getDocumentSignedUrlAction` | `getDocumentSignedUrl` |
| `touchDocumentAction` | `touchDocument` |

**Fix:**
Update all action name references throughout `document-hub-design.md` sections 4 and 6 to use the correct verb-first, no-suffix names.

**Why fix before Document Hub:**
The implementing agent will read the design doc and use those function names verbatim. If the names are wrong in the doc, the implementation will have naming violations from day one.

---

### FINDING-4 — `docs/pre-build/document-hub-design.md` — Skeleton components placed in wrong folder and named incorrectly (MEDIUM)

**File:** `docs/pre-build/document-hub-design.md`
**Section:** 6.2

**Problem:**
The design places skeleton components here:

```
components/context/documents/
  DocumentRow.tsx
  DocumentRowSkeleton.tsx     ← wrong name + wrong folder
  SkeletonDocuments.tsx       ← wrong folder
  UploadDocumentDialog.tsx
  EditDocumentDialog.tsx
```

Two issues:

1. **Wrong folder:** All existing skeleton components live in `components/skeletons/` (e.g. `SkeletonNotes.tsx`, `SkeletonBoard.tsx`, `SkeletonBudgets.tsx`). `CONVENTIONS.md` section 1 explicitly states: _"components/skeletons/ — Shimmer skeleton components for loading states."_ Placing them in `components/context/documents/` breaks this convention.

2. **Wrong naming:** `DocumentRowSkeleton` breaks the `Skeleton*` prefix convention used by all other skeletons in the codebase (`SkeletonNotes`, `SkeletonBoard`, `SkeletonBudgets`, `SkeletonTodos`, `SkeletonOwner`, etc.).

**Correct structure:**

```
components/skeletons/
  SkeletonDocuments.tsx       ← full list skeleton (N shimmer rows)
  SkeletonDocumentRow.tsx     ← single shimmer row

components/context/documents/  (or inline near the route)
  DocumentRow.tsx
  UploadDocumentDialog.tsx
  EditDocumentDialog.tsx
```

**Fix:**
Update `document-hub-design.md` section 6.2 to move skeleton components to `components/skeletons/` and rename `DocumentRowSkeleton` → `SkeletonDocumentRow`.

**Why fix before Document Hub:**
The implementing agent will follow the component layout in the design doc exactly. Wrong folder/naming from the start means the skeleton system becomes inconsistent and future AI agents won't find the skeletons where conventions say they should be.

---

### FINDING-5 — `docs/pre-build/document-hub-pre-build-audit.md` — Stale file path for notes server actions (MEDIUM)

**File:** `docs/pre-build/document-hub-pre-build-audit.md`
**Sections:** 2.2 and 7.2

**Problem:**
Both sections reference the notes server actions file as `app/notes/actions.ts`:

> _"app/notes/actions.ts is a good reference"_ (section 2.2)
> _"app/notes/actions.ts — getNotes (cached), getNoteById..."_ (section 7.2)

The actual file path is `app/actions/notes.ts`. There is no `app/notes/` directory.

**Fix:**
Replace `app/notes/actions.ts` with `app/actions/notes.ts` in both sections 2.2 and 7.2.

**Why fix before Document Hub:**
An implementing agent reading this doc to locate the reference implementation will look for `app/notes/actions.ts` and fail to find it. This wastes time or causes the agent to fall back to a less accurate reference.

---

### FINDING-6 — `app/context/ContextDataCache.tsx` — Missing `'documents'` cache key type (IMPLEMENTATION PREREQUISITE)

**File:** `app/context/ContextDataCache.tsx`
**Line:** 12–23

**Problem:**
The `CacheKey` union currently has these types:

```ts
export type CacheKey =
  | { type: 'project'; projectId: string }
  | { type: 'board'; projectId: string }
  | { type: 'notes'; projectId: string }
  | { type: 'links'; projectId: string }
  | { type: 'linkCategories'; projectId: string }
  | { type: 'ideas'; projectId: string }
  | { type: 'owner'; projectId: string }
  | { type: 'budgets'; projectId: string }
  | { type: 'billings'; projectId: string }
  | { type: 'todos'; projectId: string }
  | { type: 'noteDetail'; noteId: string };
```

`'documents'` is not in the union. `ContextDocumentsFromCache` will call `cache.get({ type: 'documents', projectId })` which will produce a TypeScript error until this is added.

**Fix:**
Add the `'documents'` type to the `CacheKey` union:

```ts
| { type: 'documents'; projectId: string }
```

**When to fix:**
This can be added at the start of Document Hub Phase 1 or Phase 3 (before `ContextDocumentsFromCache` is created). It is a 1-line change with zero risk.

**Note on `invalidateProject`:**
The existing `invalidateProject` function uses `key.split(':')[1] === projectId` to identify keys to remove. Since `documents:${projectId}` follows the same format as all other project-scoped keys, `invalidateProject` will correctly invalidate document cache entries with no changes needed.

---

### FINDING-7 — `docs/pre-build/document-hub-pre-build-audit.md` — Stale claim about AGENTS.md and CONVENTIONS.md (LOW)

**File:** `docs/pre-build/document-hub-pre-build-audit.md`
**Section:** 6.1

**Problem:**
Section 6.1 states: _"AGENTS.md and CONVENTIONS.md do not exist in the repo."_

Both files now exist at the repo root and have been updated with upgraded content. The pre-build audit was written at an earlier point in time when these files were absent.

**Fix:**
Update section 6.1 to reflect that both files now exist and are the authoritative governance documents for the project.

**Why fix:**
Low priority — this is a docs accuracy issue, not a code issue. Fix it when updating the audit doc for FINDING-5.

---

### FINDING-8 — `docs/pre-build/document-hub-design.md` — Cache type list missing `billings` (LOW)

**File:** `docs/pre-build/document-hub-design.md`
**Section:** 8

**Problem:**
The cache type union shown in section 8 is:

```ts
type CacheKeyType =
  | 'board'
  | 'notes'
  | 'links'
  | 'linkCategories'
  | 'ideas'
  | 'owner'
  | 'budgets'
  | 'todos'
  | 'project'
  | 'documents';
```

The actual `ContextDataCache.tsx` also contains `'billings'`. The design doc's list is incomplete and could confuse an implementor who copies it to replace the real union.

**Fix:**
Add `'billings'` to the example union in section 8.

---

### FINDING-9 — `app/context/[projectId]/links/actions.ts:413` — N+1 DB calls in `reorderProjectLinksAction` (PRE-EXISTING, LOW)

**File:** `app/context/[projectId]/links/actions.ts`
**Lines:** 413–422

**Problem:**

```ts
for (let i = 0; i < orderedIds.length; i++) {
  const id = orderedIds[i]?.trim();
  if (!id) continue;
  const { error } = await supabase
    .from('project_links')
    .update({ sort_order: i } as never)
    .eq('id', id)
    .eq('project_id', pid)
    .eq('owner_id', user.id);
  if (error) return { error: error.message };
}
```

One DB `UPDATE` per link in the reorder list. With 20 links, this is 20 round trips. `AGENTS.md` and `CONVENTIONS.md` both ban per-row DB calls in list loops and require RPCs for multi-step operations.

**This is pre-existing and not a Document Hub blocker.** It is documented here because Document Hub will implement a sort/archive pattern and must not copy this approach.

**Correct fix (separate task):**
Create a `reorder_links_atomic` RPC that accepts an array of `(id, sort_order)` pairs and applies them in a single transaction.

---

## Fix Order

The following table shows the recommended execution order:

| #   | Finding                                        | File                                             | Effort           | Block DH?                              |
| --- | ---------------------------------------------- | ------------------------------------------------ | ---------------- | -------------------------------------- |
| 1   | `FINDING-1` bare `.select()` in upload.ts      | `lib/storage/upload.ts:84`                       | 1 line           | Yes — it's a reference file            |
| 2   | `FINDING-2` bare `.select()` in notes.ts       | `app/actions/notes.ts:220`                       | 1 line           | Yes — it's a reference file            |
| 3   | `FINDING-3` wrong action names in design doc   | `docs/pre-build/document-hub-design.md`          | ~10 replacements | Yes — naming used in implementation    |
| 4   | `FINDING-4` skeleton folder/name in design doc | `docs/pre-build/document-hub-design.md`          | ~5 changes       | Yes — structure used in implementation |
| 5   | `FINDING-5` stale path in pre-build audit      | `docs/pre-build/document-hub-pre-build-audit.md` | 2 replacements   | Medium — agent lookup failure          |
| 6   | `FINDING-6` missing `'documents'` in cache     | `app/context/ContextDataCache.tsx`               | 1 line           | Yes — must exist before Phase 3        |
| 7   | `FINDING-7` stale AGENTS/CONVENTIONS claim     | `docs/pre-build/document-hub-pre-build-audit.md` | 1 paragraph      | Low                                    |
| 8   | `FINDING-8` missing `billings` in design doc   | `docs/pre-build/document-hub-design.md`          | 1 line           | Low                                    |
| 9   | `FINDING-9` N+1 in links reorder               | `app/context/[projectId]/links/actions.ts`       | New RPC needed   | No — pre-existing, separate task       |

---

## What Does NOT Need Fixing Before Document Hub

- **Legacy `Action` suffix in `app/actions/clients.ts`, `idea-boards.ts`, etc.** — These are documented as transitional/legacy in `AGENTS.md` section 6. They do not affect Document Hub.
- **`revalidatePath('/dashboard')` calls** — Also documented as a legacy transitional note. Not related to Document Hub.
- **Middleware protecting `/dashboard`, `/project` etc.** — Broader than current routes by design. No change needed.
- **`project_files` table not existing** — Expected. Document Hub Phase 1 creates it via migration.
- **TypeScript types for `project_files`** — Will be generated/extended after Phase 1 migration runs.

---

## Definition of "Done" for Pre-Implementation Fixes

All pre-implementation fixes are complete when:

- [ ] `lib/storage/upload.ts:84` uses explicit column list in `.select()`
- [ ] `app/actions/notes.ts:220` uses explicit column list in `.select()`
- [ ] `document-hub-design.md` uses correct action names (no `Action` suffix) throughout
- [ ] `document-hub-design.md` section 6.2 shows skeletons in `components/skeletons/` with `Skeleton*` prefix
- [ ] `document-hub-pre-build-audit.md` sections 2.2 and 7.2 reference `app/actions/notes.ts`
- [ ] `document-hub-pre-build-audit.md` section 6.1 updated to reflect AGENTS.md/CONVENTIONS.md now exist
- [ ] `document-hub-design.md` section 8 includes `'billings'` in the cache type list
- [ ] `npm run lint` passes with no new violations
- [ ] `npm run build` passes

Only after all boxes above are checked should Document Hub Phase 1 begin.
