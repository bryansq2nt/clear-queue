# Phase 3 — Performance & Realtime Prep

Goal: maximize perceived speed and code correctness while RBAC is being stabilized.
Every change here is low-risk, immediately valuable, and makes Phase 2 (Realtime)
cleaner to implement when the time comes.

This phase deliberately does NOT touch Realtime subscriptions — that is Phase 2,
which waits for RBAC to be stable.

Research basis:

- `docs/research/rls-query-performance.md`
- `docs/research/react-performance-patterns.md`
- `docs/research/optimistic-ui-realtime-ready.md`

---

## Why now, while RBAC is unstable

These changes are independent of RBAC logic. They touch:

- SQL migration files (no RBAC code)
- `next.config.mjs` (no RBAC code)
- List state setter calls in `*Client.tsx` files (no RBAC code)
- One new shared component

None of them can interfere with role resolution, permission checks, or invite flows.
If RBAC debugging introduces a regression, these changes are not the cause.

---

## Part A — Database: `auth.uid()` optimization migration

### Why this is first

334 bare `auth.uid()` calls in RLS policies. Zero wrapped. Supabase benchmarks show
94.97% improvement per policy when wrapped with `(select auth.uid())`. This is a
pure SQL migration — no application code changes, no RBAC interaction, no deploy risk.

This is also an appropriate time to audit whether early migrations added compound
indexes consistently (tables created before the index convention was established).

### What to build

New migration: `YYYYMMDDHHMMSS_rls_perf_auth_uid.sql`

**Pattern for every affected policy:**

```sql
-- Drop and recreate with wrapped auth.uid()
DROP POLICY IF EXISTS "policy name" ON public.table_name;
CREATE POLICY "policy name" ON public.table_name
  FOR SELECT USING ((select auth.uid()) = owner_id);
```

**Affected tables (bare `auth.uid()` confirmed in migrations):**

- `profiles` (11 occurrences in `20260214000000`)
- `notes` (`20260208180000`)
- `projects`, `tasks`, `budgets` (early versions in `20260208120000`)
- `clients`, `businesses` (`20260208140000`)
- `project_favorites` (`20260208100000`)
- `link_categories` (`20260221120000`)
- `project_files` / documents (`20260224100000`, `20260224120000`)
- `note_folders` (`20260224130000`)
- `calendar_events` (`20260228120000`)
- `billing_categories` (`20260308100000`)
- `organizations`, `organization_members` (`20260310100000`, `20260310100003`)

**Do NOT change:**

- Any policy that already uses `is_project_member()` or `is_org_member()` —
  these are already correct and are the RBAC-related policies
- Any policy introduced after `20260310100009` — these are the RBAC migration
  policies; changing them while RBAC is being debugged adds unnecessary risk

**Verification after applying:**

```sql
-- Should return 0 after the migration
SELECT COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
  AND qual NOT LIKE '%(select auth.uid())%'
  AND with_check NOT LIKE '%(select auth.uid())%';
```

### Risk level

Very low. `DROP POLICY IF EXISTS` + `CREATE POLICY` is instantaneous (no table lock,
no row rewrite). Policies take effect immediately. The only risk is accidentally
dropping a policy without recreating it — read each migration statement twice.

---

## Part B — Build config: `optimizePackageImports`

### Why

ClearQueue imports from `lucide-react` in every component file. Without this setting,
every build processes lucide's full barrel file (~1,400 icons). With it, the bundler
maps each import directly to its source file.

Vercel benchmark: 15–40% faster production cold starts.

### Fix

**File:** `next.config.mjs`

```js
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};
```

One line. No application code changes. Test with `npm run build` to confirm no
regressions.

### Risk level

Very low. If it causes any build issue, revert the single line.

---

## Part C — Audit and fix setState updater forms

### Why

Every `setX([...items, newItem])` that captures list state from a closure instead of
using `prev => ...` is a latent bug. Under React 18 batching it can already cause
stale updates. When Realtime is added (Phase 2), incoming events can arrive between
a mutation firing and its setState executing — making the stale closure problem
real and visible.

Fixing this now means Phase 2 implementation does not need to audit or touch these
files again.

### What to look for

```ts
// ❌ Needs fixing — captures `notes` from closure
setNotes([...notes, newNote]);
setNotes(notes.filter((n) => n.id !== id));
setNotes(notes.map((n) => (n.id === id ? updated : n)));

// ✅ Correct — uses updater form
setNotes((prev) => [...prev, newNote]);
setNotes((prev) => prev.filter((n) => n.id !== id));
setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
```

Also fix rollback patterns that restore to `initialX` (the prop) instead of capturing
`original` inside the updater:

```ts
// ❌ Needs fixing — rollback to stale initial data
const original = items.find(i => i.id === id); // captured from closure
...
if (error) setItems([original, ...items]); // stale

// ✅ Correct — capture inside updater
let original: Item | undefined;
setItems(prev => {
  original = prev.find(i => i.id === id);
  return prev.filter(i => i.id !== id);
});
if (error && original) {
  setItems(prev => [original!, ...prev.filter(i => i.id !== original!.id)]);
}
```

### Files to audit

All `*Client.tsx` files that have list state mutations. Priority order:

1. `ContextBoardClient.tsx` — highest frequency mutations (task create/update/delete)
2. `ContextNotesClient.tsx` — medium frequency
3. `ContextBillingsClient.tsx` — medium frequency
4. `ContextLinksClient.tsx`, `ContextMilestonesClient.tsx`, `ContextBudgetsClient.tsx`
5. `ContextDocumentsClient.tsx`, `ContextMediaClient.tsx`

### Risk level

Low. Each change is a mechanical transformation of `setX(array)` → `setX(prev => ...)`.
Review each changed call to confirm the logic is preserved.

---

## Part D — Hover-only prefetch on notes list

### Why

Notes is the module where users are most likely to have 30+ items. Each note links
to its detail page (`/context/[projectId]/notes/[noteId]`). With default `<Link>`
behavior, 30 notes in the viewport fires 30 prefetch requests on load. Most are
wasted network.

### What to build

**New file:** `components/shared/HoverPrefetchLink.tsx`

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ComponentProps } from 'react';

type Props = ComponentProps<typeof Link>;

/**
 * A Next.js Link that only prefetches on mouse hover, not on viewport entry.
 * Use for list items where N items are visible but only 1-2 will be clicked.
 */
export function HoverPrefetchLink({ onMouseEnter, ...props }: Props) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  return (
    <Link
      {...props}
      prefetch={shouldPrefetch}
      onMouseEnter={(e) => {
        setShouldPrefetch(true);
        onMouseEnter?.(e);
      }}
    />
  );
}
```

**Apply in:** `app/context/[projectId]/notes/ContextNotesClient.tsx` — wherever
individual notes link to their detail pages.

**Do NOT apply to:**

- Tab navigation in `ContextShell.tsx` — the prefetch there is intentional (all
  tabs are prefetched on mount, 14 items max)
- Board task cards — they open modals, not routes
- Links module — external links, not Next.js routes

### Risk level

Very low. A new isolated component. The only change in an existing file is replacing
`<Link>` with `<HoverPrefetchLink>` in the notes list item.

---

## Part E — `useLinkStatus` on tab bar (optional, do last)

### Why

Users on slow connections (mobile, congested WiFi) click a tab and see no feedback
for 300–800ms. The tab button looks the same. They may click again.

Adding a subtle visual pending state (100ms CSS delay, opacity change) gives instant
feedback without adding noise for users on fast connections.

### What to build

Modify `components/context/ContextTabBar.tsx` to wrap tab buttons in a component
that uses `useLinkStatus`. The indicator must have a CSS animation delay so it is
invisible for sub-100ms navigations (cache hits).

Read the Next.js `useLinkStatus` docs before implementing — the hook requires a
specific component tree structure to work correctly.

### Risk level

Low. The visual change is subtle and the feature is purely additive.

---

## Implementation order

| Step | Part | Change                                          | Risk     | Realtime impact           |
| ---- | ---- | ----------------------------------------------- | -------- | ------------------------- |
| 1    | A    | Write `auth.uid()` optimization migration       | Very low | None                      |
| 2    | A    | Verify migration with SQL query                 | —        | —                         |
| 3    | B    | Add `optimizePackageImports` to next.config.mjs | Very low | None                      |
| 4    | B    | Run `npm run build` to confirm                  | —        | —                         |
| 5    | C    | Audit + fix updater forms in ContextBoardClient | Low      | **Prepares for Realtime** |
| 6    | C    | Audit + fix updater forms in ContextNotesClient | Low      | **Prepares for Realtime** |
| 7    | C    | Audit + fix remaining \*Client.tsx files        | Low      | **Prepares for Realtime** |
| 8    | D    | HoverPrefetchLink component + notes list        | Very low | None                      |
| 9    | E    | useLinkStatus on tab bar                        | Low      | None                      |

---

## Files changed

| File                                                             | Change                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `supabase/migrations/YYYYMMDDHHMMSS_rls_perf_auth_uid.sql`       | New — recreates affected policies with wrapped auth.uid() |
| `next.config.mjs`                                                | Add `optimizePackageImports: ['lucide-react']`            |
| `components/shared/HoverPrefetchLink.tsx`                        | New — hover-only prefetch Link wrapper                    |
| `components/context/ContextTabBar.tsx`                           | Add `useLinkStatus` pending indicator                     |
| `app/context/[projectId]/board/ContextBoardClient.tsx`           | Fix setState updater forms                                |
| `app/context/[projectId]/notes/ContextNotesClient.tsx`           | Fix setState updater forms + HoverPrefetchLink            |
| `app/context/[projectId]/billings/ContextBillingsClient.tsx`     | Fix setState updater forms                                |
| `app/context/[projectId]/links/ContextLinksClient.tsx`           | Fix setState updater forms                                |
| `app/context/[projectId]/milestones/ContextMilestonesClient.tsx` | Fix setState updater forms                                |
| `app/context/[projectId]/budgets/ContextBudgetsClient.tsx`       | Fix setState updater forms                                |
| `app/context/[projectId]/documents/ContextDocumentsClient.tsx`   | Fix setState updater forms                                |
| `app/context/[projectId]/media/ContextMediaClient.tsx`           | Fix setState updater forms                                |

**Files NOT touched:** server actions, RBAC files, page.tsx files, any Realtime code.

---

## What this phase does NOT do

- No Realtime subscriptions (Phase 2 — after RBAC is stable)
- No changes to RBAC code or role resolution
- No changes to server actions or database queries beyond the RLS policy migration
- No new loading patterns or skeleton changes
- No changes to the Phase 1 prefetch useEffect in ContextShell

---

## Definition of done

- [ ] Verification query confirms 0 bare `auth.uid()` calls in non-RBAC policies
- [ ] `npm run build` passes with `optimizePackageImports`
- [ ] No `setX([...items, ...])` or `setX(items.filter(...))` pattern remains in any `*Client.tsx`
      that mutates list state (all use `prev => ...` updater form)
- [ ] Rollback handlers capture `original` inside the updater, not from closure
- [ ] `HoverPrefetchLink` used in notes list
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pass
