# ARCHITECTURE.md — ClearQueue System Invariants

This file defines non-negotiable system laws. These are architecture contracts, not style guidance.

---

## 1) System Layers (Invariant)

Dependencies must flow inward only:

```text
UI → Application → Domain → Infrastructure
```

| Layer          | Scope                                                                                     | Invariant                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| UI             | Client Components, route UI (`app/**/page.tsx`, `app/**/layout.tsx`, `components/**`)     | Must not access Supabase directly. Must not contain business rules.                                       |
| Application    | Server Actions (`app/actions/**`, feature `actions.ts`) and Route Handlers (`app/api/**`) | Is the only mutation boundary. Coordinates auth, validation, domain calls, persistence, and revalidation. |
| Domain         | `lib/**`                                                                                  | Owns business rules, transformations, and validation logic. Must not import UI concerns.                  |
| Infrastructure | Supabase clients, migrations, RPCs, storage integrations, observability SDK wiring        | Provides persistence and platform integrations. Must not depend on UI.                                    |

**Required:**

- UI must never call Supabase for DB reads/writes.
- Server Actions / Route Handlers are the only mutation entry points.
- Imports from inner layers to outer layers are forbidden.

---

## 2) Data Access Invariants

- Every query must be explicitly scoped:
  - Project-scoped data: `project_id = ...`.
  - User-owned data: `owner_id = ...` or `user_id = ...`.
- No DB calls inside list loops (no N+1 query pattern).
- Every `select` must use explicit columns (no `*`, no empty select).
- DB round-trip budget is contractual:
  - Context tab initial load or refresh: **≤ 3**.
  - Detail page load: **≤ 2**.

---

## 3) Atomicity Invariants

- Any multi-step write that must succeed together must be a single `_atomic` Postgres RPC (or a single SQL statement).
- Sequential dependent write awaits are forbidden.
- Reorder operations must be atomic.
- Partial write states must never be observable by clients.

---

## 4) Security Invariants

- `requireAuth()` or `getUser()` must be the first call in every Server Action and Route Handler.
- All persisted data paths must rely on RLS-enabled tables.
- Client-side Supabase DB access is forbidden.
- Secrets must never be hardcoded in source.
- All user input must be validated and normalized before DB usage.

---

## 5) Observability Invariants

- All mutation error paths in Server Actions and Route Handlers must call `captureWithContext`.
- Context fields are mandatory: `module`, `action`, `userIntent`, `expected`.
- Raw `Sentry.captureException` usage is forbidden in these paths.

---

## 6) UI State Invariants

- Every async load must provide a skeleton loading state.
- `alert()` is forbidden for mutation errors in core modules.
- Mutations must return the updated/created data needed for UI reconciliation.
- `router.refresh()` must not be the primary mutation update mechanism.
- `window.open` must receive a final URL synchronously in the user gesture; never pre-open blank windows and navigate after `await`.
