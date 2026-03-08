# Project Copilot: Phases 4–7 Implementation Plan

**Created:** 2026-03-07
**Status:** Ready to implement — execute in order

---

## What's already done (phases 1–3 + earlier work)

| Feature                                              | Status  |
| ---------------------------------------------------- | ------- |
| Module capability registry                           | ✅ Done |
| Links module (create / update / delete)              | ✅ Done |
| Todos module (add item / toggle / delete)            | ✅ Done |
| Context permission — standard vs full mode           | ✅ Done |
| Mutations — tasks, notes, milestones (update/delete) | ✅ Done |
| Mind map / Ideas module                              | ✅ Done |
| Milestone creation                                   | ✅ Done |
| Bulk approve / reject all                            | ✅ Done |
| Milestone context with task counts (X/Y done)        | ✅ Done |
| Approved/rejected proposals in system prompt         | ✅ Done |
| Session archiving via "Start Fresh"                  | ✅ Done |

---

## Phase 4 — Documents Context ✅ Done

**Goal:** Copilot sees the project's uploaded documents so it can reference them in planning (e.g. "you have a spec doc uploaded", "there's a wireframe in the design folder").

**Key constraint:** Documents are read-only — the AI cannot upload files. This is context enrichment only, no new proposal types.

### What to build

1. **`lib/copilot/registry/modules/documents.ts`** (new file)
   - `fetchDocumentsContext(projectId, scope, supabase): Promise<string>`
   - Queries `project_files` where `kind = 'document'`, `archived_at IS NULL`, `deleted_at IS NULL`, scoped by `project_id`
   - Select: `id, title, document_category, mime_type, file_ext, created_at`
   - **Standard:** count + last 5 titles + categories present
     ```
     ## Documents
     8 documents. Categories: Design, Specs. Recent: wireframe.pdf, api-spec.md, ...
     ```
   - **Full:** all document titles with category and type
     ```
     ## Documents (8 total)
     - wireframe.pdf (Design · pdf)
     - api-spec.md (Specs · markdown)
     ```

2. **`lib/copilot/context.ts`**
   - Import `fetchDocumentsContext` from the new module
   - Add to `Promise.all` alongside links and todos
   - Append `documentsContext` to both standard and full context blocks
   - Add prompt rule: "Documents are read-only — you cannot create or upload them. Reference them by title when relevant to planning."

### Files changed

- `lib/copilot/registry/modules/documents.ts` (new)
- `lib/copilot/context.ts`

### Success criteria

- Copilot responds correctly to "what documents do we have?", "is there a spec uploaded?"
- No new proposal types; documents appear in context only

---

## Phase 5 — Budget Context ✅ Done

**Goal:** Copilot sees project budget totals so it can answer questions like "how much is allocated?", "what's already acquired?", "are we over budget?" and factor cost into planning recommendations.

**Key constraint:** Budget data is read-only — no proposal types for creating/editing budget items.

### What to build

1. **`lib/copilot/registry/modules/budgets.ts`** (new file)
   - `fetchBudgetsContext(projectId, scope, supabase): Promise<string>`
   - Query chain: `budgets` by `project_id` → `budget_categories` by `budget_id` → `budget_items` by `category_id`
   - Aggregate per budget: `total` (qty × unit_price), `acquired` (status = 'acquired'), `pending` (total - acquired)
   - **Standard:** one line per budget with totals
     ```
     ## Budgets
     - Production Setup: $4,200 total · $1,800 acquired · $2,400 pending
     - Marketing: $1,500 total · $500 acquired · $1,000 pending
     ```
   - **Full:** same (no IDs needed — no mutation proposals for budgets yet)

2. **`lib/copilot/context.ts`**
   - Import `fetchBudgetsContext`
   - Add to `Promise.all`
   - Append to both context blocks
   - Add prompt rule: "Budget data is read-only. Use it to inform planning, prioritization, and cost-related recommendations."

### Notes

- `getBudgetStats` in `app/actions/budgets.ts` does the aggregation pattern already — replicate directly in supabase queries using `ctx.supabase` to avoid importing from `app/actions/` (same rule as registry modules)
- If project has no budgets, return `'## Budgets\n- No budgets yet.'`

### Files changed

- `lib/copilot/registry/modules/budgets.ts` (new)
- `lib/copilot/context.ts`

### Success criteria

- Copilot can answer "how much have we spent?" and "what's still pending?" without extra context request
- Cost considerations appear in planning recommendations when relevant

---

## Phase 6 — Session Management UI ✅ Done

**Goal:** Sessions accumulate forever in the dropdown. `getCopilotSessions` returns ALL sessions (active + archived) with no limit. Give users a way to remove sessions they no longer need.

### Current state

- `getCopilotSessions` returns active + archived sessions, ordered active-first then by `updated_at`
- Archived sessions appear in the dropdown with "(archived)" label via `s.status === 'archived'`
- `archiveCopilotSession(sessionId)` exists in actions.ts
- No hard-delete exists yet — sessions are never removed from the list

### What to build

1. **`app/context/[projectId]/copilot/actions.ts`**
   - Add `deleteCopilotSession(sessionId)` — hard deletes the row (cascades messages + proposals via FK `ON DELETE CASCADE`)
   - Scope by `owner_id` for security

2. **`app/context/[projectId]/copilot/ContextCopilotClient.tsx`**
   - Replace the plain `<select>` session picker with a small custom dropdown that shows:
     - Active sessions: selectable, no delete button
     - Archived sessions: selectable (greyed), plus a `×` delete button
   - On delete: call `deleteCopilotSession(sessionId)`, remove from local `sessions` state, if the deleted session was selected switch to the first active session
   - While deleting: disable the `×` button to avoid double-click

3. No i18n keys needed — the `×` button uses `aria-label="Delete session"` only

### Files changed

- `app/context/[projectId]/copilot/actions.ts`
- `app/context/[projectId]/copilot/ContextCopilotClient.tsx`

### Success criteria

- Archived sessions show a `×` button; clicking it removes them from the list permanently
- Active sessions cannot be deleted (only archived via "Start Fresh")
- No crash if the currently selected session is deleted

---

## Phase 7 — Mobile / UX Polish ✅ Done

**Goal:** Make the copilot tab fully usable on a phone (375px viewport).

### Known issues to audit and fix

| Location                                | Issue                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Session bar in `ContextCopilotClient`   | `select + edit button + "Start fresh"` may be too wide on small screens — could overflow or wrap awkwardly |
| Proposal cards in `CopilotProposalCard` | `ml-11` (44px) eats ~12% of a 375px screen — tight with `max-w-xl`                                         |
| `CopilotChatWindow`                     | Check if keyboard on iOS pushes the input bar up correctly                                                 |
| Bulk action toolbar                     | Two buttons side-by-side with `ml-11` — may be cramped                                                     |
| Streaming status                        | Long translated strings may overflow the bubble                                                            |

### Approach

1. Run through the layout at 375px in browser devtools
2. Session bar: consider wrapping to two rows on mobile, or abbreviating the "Start fresh" label to just the `+` icon on `xs` screens
3. Proposal cards: reduce `ml-11` to `ml-8` on mobile (`sm:ml-11`)
4. Input bar: verify it uses `position: sticky bottom-0` or equivalent so it stays above the virtual keyboard
5. Test in both light and dark mode

### Files likely changed

- `app/context/[projectId]/copilot/ContextCopilotClient.tsx`
- `components/context/copilot/CopilotChatWindow.tsx`
- `components/context/copilot/CopilotProposalCard.tsx`
- `components/context/copilot/CopilotInputBar.tsx` (if it exists)

### Success criteria

- Full chat + proposals visible and usable at 375px width
- No horizontal overflow
- Input bar accessible above keyboard on iOS

---

## Recommended execution order

| Phase                      | Est. complexity                  | Value  |
| -------------------------- | -------------------------------- | ------ |
| **4** — Documents Context  | Low (1 new file + context.ts)    | High   |
| **5** — Budget Context     | Medium (multi-table aggregation) | High   |
| **6** — Session Management | Medium (UI refactor)             | Medium |
| **7** — Mobile Polish      | Low–Medium (CSS/layout audit)    | Medium |

All phases are independent. Phase 4 and 5 can be implemented back to back in the same session.
After each phase: `npm run lint`, `npx tsc --noEmit`, `npm run test -- --run`, `npm run build` must all pass.
