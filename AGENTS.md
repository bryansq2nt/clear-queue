# AGENTS.md — ClearQueue Execution Protocol

This file defines how agents execute work in this repository.
Architecture laws live in `ARCHITECTURE.md`. Implementation standards live in `CONVENTIONS.md`.

---

## 0) Operating mode (required)

- Do not invent patterns. Follow existing project patterns and `docs/patterns/*`.
- Do not change business logic when the task is documentation/governance-only.
- Do not bypass architecture laws. Escalate uncertainty via an audit note in `docs/audits/`.

---

## 1) Mini-Spec Protocol (MANDATORY before coding)

Before editing any file, produce this block in your working notes/output:

```md
## Mini Spec

Goal:
Constraints:
Architecture Layers Touched:
Files to Modify:
DB Impact:
Performance Impact:
Test Plan:
Risks:
```

**Required behavior:**

- No implementation starts until the Mini Spec is complete.
- If scope expands, update the Mini Spec before continuing.

---

## 2) Pre-Flight Checklist (MANDATORY)

Complete in order before writing code:

1. **Map layers touched** (UI / Application / Domain / Infrastructure) and verify inward dependency flow.
2. **Read the closest reference implementation** from `docs/patterns/*` and matching feature files.
3. **List exact files to change**; shrink scope if the list becomes broad.
4. **Define test plan**:
   - `lib/**` logic change → add/update Vitest tests.
   - New user-facing module/tab → add Playwright happy-path test.
5. **Check DB impact**:
   - Multi-step write → `_atomic` RPC.
   - Schema change → migration with RLS, indexes, and `updated_at` trigger.

---

## 3) Execution Guardrails

- Use Server Actions/Route Handlers for all mutations.
- Use explicit select columns only.
- Scope queries by ownership and project where applicable.
- After mutations, revalidate real app paths.
- For context tabs, update from action return values and/or `onRefresh`; do not rely on `router.refresh()`.
- Never use `alert()` for core mutation errors.

---

## 4) Structured Self-Audit Gate (MANDATORY before completion)

Agent must explicitly answer all checks below with `PASS` or `FAIL` and evidence.

### Data & performance gate

- DB calls count for initial load path = ? (must satisfy architecture budget).
- Any DB call inside loop? (must be no).
- Any `.select('*')` or empty `.select()`? (must be no).
- Query scoping includes required `owner_id/user_id` and `project_id` filters? (must be yes).

### Write-path gate

- Any multi-step write present? If yes, `_atomic` RPC used? (must be yes).
- Reordering logic atomic? (must be yes).
- Mutation returns updated/created row for UI reconciliation? (must be yes).
- `revalidatePath`/`revalidateTag` called after successful mutation? (must be yes).

### Security & observability gate

- Auth call (`requireAuth` or `getUser`) is first call in each action/route? (must be yes).
- RLS/migration checklist satisfied for schema changes? (must be yes/N-A).
- `captureWithContext` used on mutation error paths with required fields? (must be yes).
- Any raw `Sentry.captureException` in those paths? (must be no).

### UX/API correctness gate

- Loading state uses skeletons for async loads? (must be yes).
- Mutation errors use dialog pattern, not `alert()`? (must be yes).
- `window.open` pattern correct (no blank-preopen then await)? (must be yes/N-A).
- Empty state present where list/detail can be empty? (must be yes).

**Release rule:** If any gate is `FAIL`, stop and refactor before declaring done.

---

## 5) Red Flags — Immediate Refactor Required

Any item below is a structural smell and must be refactored before merge:

- DB call inside a loop.
- `.select('*')` or unbounded select shape.
- Two dependent writes in sequence instead of `_atomic` RPC.
- Server action/route without auth as first call.
- `components/**` or `*Client.tsx` importing Supabase DB client for data access.
- Missing loading skeleton for async view.
- Mutation error shown with `alert()`.
- Missing `revalidatePath`/`revalidateTag` after mutation.
- `window.open('', ...)` followed by async URL fetch and navigation.
- Use of `any` in new TypeScript code without explicit, documented justification.
- File >300 lines after change without justification in PR notes.
- Missing empty state for user-facing collections.

---

## 6) Known tech debt — do not copy

These known violations exist and are tracked in `docs/audits/AUDIT_SUMMARY.md`. Do not copy these patterns.

| Location                                         | Violation                                   | Correct approach                                                           |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------- |
| `app/context/[projectId]/links/actions.ts:413`   | N+1 loop — one `UPDATE` per link in reorder | Use `reorder_links_atomic` RPC (one call)                                  |
| Task ordering (multiple files)                   | Non-atomic reorder; `max(sort_order)` race  | Use `move_task_atomic` RPC                                                 |
| `revalidatePath('/dashboard')` in legacy actions | Revalidates non-existent route              | New code revalidates real paths (`/`, `/context`, `/context/${projectId}`) |
| Exports suffixed with `Action`                   | Naming debt                                 | New code uses verb-first names without suffix                              |

---

## 7) Escalation path

If uncertain, create an audit note in `docs/audits/<topic>-YYYY-MM-DD.md` with:

- What was found.
- Why it is ambiguous.
- Candidate options.
- Recommendation and blast radius.
