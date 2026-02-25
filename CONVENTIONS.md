# CONVENTIONS.md — ClearQueue Implementation Standards

This file defines implementation standards, naming, and playbook references.
System laws are in `ARCHITECTURE.md`. Execution protocol is in `AGENTS.md`.

---

## 1) Naming conventions

### Server actions

- Exported actions are verb-first and do not use `Action` suffix.
- Reads: `get*`, `list*`.
- Writes: `create*`, `update*`, `delete*`, `move*`, `toggle*`, `duplicate*`.
- Existing legacy names with `Action` suffix may remain until dedicated refactor.

### Component naming

| Pattern                 | Purpose                                 | Example                     |
| ----------------------- | --------------------------------------- | --------------------------- |
| `Context*FromCache.tsx` | Cache wrapper for context tabs          | `ContextNotesFromCache.tsx` |
| `Context*Client.tsx`    | Client tab implementation               | `ContextBoardClient.tsx`    |
| `*PageClient.tsx`       | Client controller for non-context pages | `ProfilePageClient.tsx`     |

### RPC and migration naming

- RPCs: `snake_case` with `_atomic` suffix when transactional.
- Migrations: `YYYYMMDDHHMMSS_description.sql`.

---

## 2) File structure standards

| Location                         | Standard                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/actions/**`                 | Shared server actions by domain                                                          |
| `app/context/[projectId]/<tab>/` | `page.tsx`, `Context*FromCache.tsx`, `Context*Client.tsx`, optional feature `actions.ts` |
| `components/**`                  | Reusable UI only                                                                         |
| `components/skeletons/**`        | Shimmer skeleton components                                                              |
| `lib/**`                         | Domain logic, validation, helper services                                                |
| `supabase/migrations/**`         | Schema + policy + RPC evolution                                                          |

---

## 3) Migration checklist (implementation)

Every table migration must include:

- [ ] RLS enabled.
- [ ] RLS policies for SELECT/INSERT/UPDATE/DELETE.
- [ ] Indexes aligned to primary query patterns.
- [ ] `updated_at` trigger via `update_updated_at_column()` where applicable.
- [ ] FK constraints with explicit delete behavior.
- [ ] Enum definitions (if used) and type sync updates when needed.
- [ ] Soft-delete index if `deleted_at` is introduced.

Reference complete example: `supabase/migrations/20260224100000_document_hub.sql`.

---

## 4) Sentry usage pattern

- Use `captureWithContext` from `@/lib/sentry` in server-side error paths.
- Always include: `module`, `action`, `userIntent`, `expected`.
- Attach relevant identifiers (`projectId`, `userId`, entity IDs) when available.

Reference implementation: `app/actions/documents.ts`.

---

## 5) i18n glossary and translation standards

- All user strings use translation keys and `useI18n().t(key)` in client code.
- Add/update keys in both locale files together.
- Preserve approved terminology:

| Concept          | English  | Spanish     |
| ---------------- | -------- | ----------- |
| Task not started | Pending  | Pendientes  |
| Task blocked     | Blocked  | Detenidas   |
| Task finished    | Done     | Completadas |
| High priority    | Critical | Urgentes    |
| Monetary amount  | Amount   | Importe     |
| Settings page    | Settings | Ajustes     |

---

## 6) Testing expectations

- Domain logic changes in `lib/**`: add/update Vitest coverage.
- New user-facing module/tab: add at least one Playwright happy-path test.
- CI quality commands expected to pass:
  - `npm run lint`
  - `npm run build`
  - `npm run test -- --run`

---

## 7) Formatting and code quality

- Follow project Prettier config exactly.
- Keep edits small and scoped.
- Avoid introducing broad refactors in feature PRs unless explicitly requested.
- Do not add try/catch around imports.

---

## 8) Playbook references (`docs/patterns/*`)

| Implementation area          | Read first                               |
| ---------------------------- | ---------------------------------------- |
| Data loading                 | `docs/patterns/data-loading.md`          |
| Server actions               | `docs/patterns/server-actions.md`        |
| Database queries             | `docs/patterns/database-queries.md`      |
| Transactions / atomic writes | `docs/patterns/transactions.md`          |
| Context session cache        | `docs/patterns/context-session-cache.md` |
