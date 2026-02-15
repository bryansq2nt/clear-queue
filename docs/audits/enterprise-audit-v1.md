# Enterprise Audit v1 — clear-queue

## A) Executive Summary

- **Security: 6.5/10**, **Performance: 6.0/10**, **Database: 7.0/10**, **UX Fluidity: 5.5/10**, **Architecture: 5.5/10**.
- The codebase has a solid baseline for Auth + RLS adoption, with many owner-scoped policies and server-side auth guards.
- The biggest security dependency is still **RLS correctness**; app-layer owner checks are inconsistent and often omitted in write paths.
- Validation is mostly ad-hoc (`trim`, simple length checks), with no shared schema validation layer for server actions.
- Task and billing flows show signs of growth-stage architecture drift (mixed patterns, duplicated query logic, inconsistent boundaries).
- Performance posture is acceptable for current scale, but hot paths include avoidable extra queries, broad selects, and client-heavy dashboard widgets.
- Observability is present (Sentry), but current PII settings and verbose traces can create compliance and data-minimization concerns.
- UX quality is uneven: some modules feel polished, but loading/accessibility patterns are inconsistent across dashboard/kanban/todo surfaces.
- Automated tests are not representative of this product domain (placeholder Playwright spec still points to playwright.dev).
- **Overall: Not yet enterprise-level; strong foundation, but requires hardening and architecture consolidation before scale.**

### Top 5 Risks (ranked by impact)

1. **Broken access-control blast radius if any RLS policy regresses** (many writes rely on `.eq('id', ...)` without owner predicates in code).
2. **Unvalidated server-action inputs across core modules** (projects/tasks/clients/billings) increase integrity and abuse risk.
3. **Task ordering function uses global status ordering (not project-scoped)** causing correctness/perf contention as data grows.
4. **PII observability over-collection** (`sendDefaultPii: true`, broad sampling, stack traces in server actions).
5. **Architecture drift + low test coverage** makes future features (including planned AI module “Miles”) high-risk to deliver safely.

---

## B) System Map (current state)

### High-level module/data flow

```text
Next.js App Router UI (server pages + client components)
  -> Server Actions (app/**/actions.ts + app/actions/*.ts)
      -> Supabase JS (server client)
          -> Postgres tables + RPC functions + RLS policies
          -> Supabase Auth session cookies
          -> Supabase Storage (user-assets bucket)
```

### Main product modules identified

- **Core PM**: Projects + Tasks + Dashboard (`app/actions/projects.ts`, `app/actions/tasks.ts`).
- **Clients/Businesses CRM-lite** (`app/clients/actions.ts`, `app/businesses/actions.ts`).
- **Budgets/Finance planning** (`app/budgets/actions.ts`, `app/budgets/[id]/actions.ts`).
- **Billing/Collections** (`app/billings/actions.ts`).
- **Ideas/Boards graph** (`lib/idea-graph/*`, `app/ideas/**`).
- **Todo lists/items** (`app/todo/actions.ts`, `lib/todo/lists.ts`).
- **Profile/Branding/Assets** (`app/settings/profile/actions.ts`, `lib/storage/upload.ts`).

### Where Supabase is accessed (and why it matters)

- **Server-side Supabase access dominates** via `createClient()` in server actions and server modules (good baseline for secret containment and auth context).
- **Client components still orchestrate data-heavy interactions** and call server actions/functions for pagination and refresh loops (impacts UX fluidity and render churn).
- **RLS is the primary tenant boundary**, because many writes do not include explicit owner predicates in app code.

---

## C) Findings (grouped by category)

## 1) Security

### 1.1

- **Severity:** HIGH
- **Title:** Authorization defense-in-depth is inconsistent in mutation paths (RLS-only reliance in many writes)
- **Evidence:**
  - `app/actions/tasks.ts:66-72` (update by `id` only), `app/actions/tasks.ts:84-85` (delete by `id` only).
  - `app/actions/projects.ts:149-153`, `app/actions/projects.ts:174-178`, `app/actions/projects.ts:234-235`.
  - `app/clients/actions.ts:162-165`, `app/clients/actions.ts:358-361`, `app/clients/actions.ts:445-446`.
- **Why it matters:**
  - If any policy is weakened/removed in migration drift, app code won’t stop cross-tenant access.
  - Defense-in-depth is expected for enterprise systems, especially in write operations.
- **Fix direction (high-level):**
  - Standardize a repository/service write contract requiring owner-scoped predicates or ownership pre-checks, even when RLS exists.
- **Confidence:** High

### 1.2

- **Severity:** MEDIUM
- **Title:** Middleware route protection is incomplete versus app surface area
- **Evidence:**
  - `middleware.ts:39-48` protected prefixes omit `/billings`.
  - Billing page still relies on per-page check at `app/billings/page.tsx:8`.
- **Why it matters:**
  - Inconsistent protection strategy increases chance of accidental exposure when adding routes.
  - Enterprise posture prefers centralized route-guard coverage plus server checks.
- **Fix direction (high-level):**
  - Keep server-side `requireAuth`, but align middleware matcher/prefixes to all authenticated modules.
- **Confidence:** High

### 1.3

- **Severity:** HIGH
- **Title:** Server-side input validation lacks schema-based guarantees
- **Evidence:**
  - Auth uses basic checks only (`app/actions/auth.ts:32-38`, `app/actions/auth.ts:110-114`).
  - Task creation parses primitive values without strict schema (`app/actions/tasks.ts:19-24`).
  - Project validation is manual and partial (`app/actions/projects.ts:56-67`, `app/actions/projects.ts:125-147`).
  - No schema validation library present in runtime deps (`package.json:20-63`).
- **Why it matters:**
  - Inconsistent validation leads to data quality drift and edge-case bugs.
  - Lacks centralized sanitization/normalization policy for enterprise compliance.
- **Fix direction (high-level):**
  - Introduce shared server-action DTO schemas per module (e.g., Zod/Valibot) with strict coercion + constraints.
- **Confidence:** High

### 1.4

- **Severity:** MEDIUM
- **Title:** Session-setting API endpoint lacks explicit origin/intent hardening
- **Evidence:**
  - `app/api/auth/set-recovery-session/route.ts:4-27` accepts tokens from request body and sets session directly.
- **Why it matters:**
  - Sensitive session mutations should include explicit anti-abuse checks (origin/state/intended flow).
  - Token endpoints become high-value targets during auth-flow integration changes.
- **Fix direction (high-level):**
  - Constrain endpoint usage to intended recovery flow (state binding, stricter method contract, anti-replay/expiry assumptions).
- **Confidence:** Medium

### 1.5

- **Severity:** MEDIUM
- **Title:** Observability configuration may over-collect PII
- **Evidence:**
  - `instrumentation-client.ts:14-29`, `sentry.server.config.ts:11-18`, `sentry.edge.config.ts:12-19` set full traces and `sendDefaultPii: true`.
  - Server actions log traces in profile module (`app/settings/profile/actions.ts:72-74`, `app/settings/profile/actions.ts:98-100`, `app/settings/profile/actions.ts:173-174`).
- **Why it matters:**
  - Enterprise environments often require strict data minimization and purpose-limited telemetry.
  - Stack traces plus PII-enabled telemetry can create compliance scope expansion.
- **Fix direction (high-level):**
  - Move to environment-tuned sampling, disable default PII by default, and redact structured logs.
- **Confidence:** High

### 1.6

- **Severity:** LOW
- **Title:** Historic migration shows prior broad-authenticated RLS model (now improved)
- **Evidence:**
  - Initial broad policies in `supabase/migrations/001_initial_schema.sql:50-59`.
  - Later owner-scoped policies in `supabase/migrations/20260208120000_multi_user_projects_tasks_budgets.sql:23-80` and `supabase/migrations/20260216_fix_security_and_performance.sql:9-63`.
- **Why it matters:**
  - Indicates earlier security debt; rollback/replay discipline is critical to avoid policy regression.
- **Fix direction (high-level):**
  - Add automated policy assertions in CI against a migrated ephemeral DB.
- **Confidence:** High

## 2) Performance / Optimization

### 2.1

- **Severity:** HIGH
- **Title:** Task ordering algorithm is globally status-scoped, not project-scoped
- **Evidence:**
  - `supabase/migrations/20260216010000_atomic_todo_and_task_creation.sql:51-55` sets `order_index` by max across all tasks with same status.
- **Why it matters:**
  - Cross-project contention and inflated index scans as tenant/task volume grows.
  - Semantically wrong ordering domain for per-project kanban lanes.
- **Fix direction (high-level):**
  - Scope order calculation to `(project_id, status)` and index accordingly.
- **Confidence:** High

### 2.2

- **Severity:** MEDIUM
- **Title:** Repeated client-side loading loops and manual refresh orchestration in dashboard widgets
- **Evidence:**
  - `components/dashboard/TaskListWidget.tsx:105-139` fetches via callback + effect and reloads after edits.
  - `components/dashboard/CriticalTasksWidget.tsx:47-72`, `components/dashboard/CriticalTasksWidget.tsx:79-81` repeats same pattern.
- **Why it matters:**
  - Produces extra request churn and inconsistent perceived responsiveness.
  - Misses App Router server-first data patterns for lower client workload.
- **Fix direction (high-level):**
  - Consolidate dashboard data in server loaders with cache/revalidation strategy and targeted client hydration.
- **Confidence:** Medium

### 2.3

- **Severity:** MEDIUM
- **Title:** Potentially expensive exact counts on task lists at runtime
- **Evidence:**
  - `app/actions/tasks.ts:190-197`, `app/actions/tasks.ts:221-228` use `{ count: 'exact' }` on paginated lists.
- **Why it matters:**
  - Exact count can become costly on larger tables and degrade latency.
- **Fix direction (high-level):**
  - Use estimated counts/materialized counters where exact total is not strictly required each request.
- **Confidence:** Medium

### 2.4

- **Severity:** LOW
- **Title:** Broad `.select()` usage remains in hot mutation paths
- **Evidence:**
  - Examples: `app/actions/tasks.ts:71`, `app/clients/actions.ts:130`, `app/clients/actions.ts:362`, `app/billings/actions.ts:110`.
- **Why it matters:**
  - Over-fetching increases payload size and serialization overhead.
- **Fix direction (high-level):**
  - Enforce minimal column projections for read-after-write responses.
- **Confidence:** High

## 3) Database Design & Query Quality

### 3.1

- **Severity:** MEDIUM
- **Title:** Multi-step cross-entity updates are not always transactional at app layer
- **Evidence:**
  - `app/clients/actions.ts:419-424` updates business and then cascades project client updates separately.
- **Why it matters:**
  - Partial failures can create state divergence (business updated, projects not updated).
- **Fix direction (high-level):**
  - Move multi-step write flows into RPC transactions with explicit success/failure contracts.
- **Confidence:** High

### 3.2

- **Severity:** MEDIUM
- **Title:** Missing targeted indexes for common dashboard/task access patterns
- **Evidence:**
  - Existing task indexes are basic (`supabase/migrations/001_initial_schema.sql:27-29`).
  - Task queries filter/sort by `status`, `priority`, `due_date`, `updated_at` (`app/actions/tasks.ts:170-173`, `app/actions/tasks.ts:198-201`, `app/actions/tasks.ts:229-231`).
- **Why it matters:**
  - Sort/filter mismatch can degrade list performance under growth.
- **Fix direction (high-level):**
  - Add composite indexes aligned to dominant predicates/order clauses per endpoint.
- **Confidence:** Medium

### 3.3

- **Severity:** LOW
- **Title:** RLS + owner_id indexing is generally good in newer modules (positive baseline)
- **Evidence:**
  - Owner indexes and RLS in clients/businesses (`supabase/migrations/20260208140000_clients_and_businesses.sql:27-44`, `:75-93`).
  - Profile/assets and storage policies (`supabase/migrations/20260214000000_profile_and_branding.sql:24-39`, `:57-70`, `:127-167`).
- **Why it matters:**
  - Shows the DB security model is evolving in the right direction.
- **Fix direction (high-level):**
  - Preserve via migration tests and policy drift checks.
- **Confidence:** High

## 4) UI/UX Fluidity

### 4.1

- **Severity:** MEDIUM
- **Title:** Keyboard accessibility gaps in interactive card rows
- **Evidence:**
  - Clickable `div` rows in `components/dashboard/TaskListWidget.tsx:183-185` and `components/dashboard/CriticalTasksWidget.tsx:113-117`.
- **Why it matters:**
  - Non-semantic click targets impede keyboard/screen-reader usability.
- **Fix direction (high-level):**
  - Use semantic buttons/links with focus states and keyboard handlers.
- **Confidence:** High

### 4.2

- **Severity:** MEDIUM
- **Title:** Theme/token inconsistency creates enterprise polish and dark-mode risk
- **Evidence:**
  - Tokenized styles in `TaskListWidget` (e.g., `bg-card`, `text-foreground`) vs hard-coded slate/white palette in `CriticalTasksWidget` (`components/dashboard/CriticalTasksWidget.tsx:85-107`, `:123-129`).
- **Why it matters:**
  - Inconsistent theming yields uneven visual quality and potential contrast issues.
- **Fix direction (high-level):**
  - Enforce design tokens and component-level style conventions.
- **Confidence:** High

### 4.3

- **Severity:** LOW
- **Title:** Loading/empty/error handling patterns are inconsistent across modules
- **Evidence:**
  - Manual loading/error states in widgets (`components/dashboard/TaskListWidget.tsx:105-114`, `:167-178`).
  - Separate custom loading logic in todo shell (`components/todo/TodoShell.tsx:73`).
- **Why it matters:**
  - Inconsistent interaction feedback reduces perceived quality and predictability.
- **Fix direction (high-level):**
  - Standardize skeleton/loading/error primitives and route-level conventions.
- **Confidence:** Medium

## 5) Architecture & Code Quality

### 5.1

- **Severity:** HIGH
- **Title:** Mixed architecture style (actions + lib services + UI orchestration) causes boundary drift
- **Evidence:**
  - Direct DB access in app-level actions (`app/actions/projects.ts:20-31`, `app/actions/tasks.ts:15-44`).
  - Additional domain access in lib modules (`lib/todo/lists.ts:98-127`, `lib/todo/lists.ts:267-299`).
  - UI-side orchestration in client widgets (`components/dashboard/TaskListWidget.tsx:105-139`).
- **Why it matters:**
  - Increases duplication, inconsistent error contracts, and onboarding complexity.
- **Fix direction (high-level):**
  - Move to explicit feature modules with service + repository boundaries.
- **Confidence:** High

### 5.2

- **Severity:** MEDIUM
- **Title:** Junior-level smell: placeholder tests and low product coverage
- **Evidence:**
  - Current E2E tests target external playwright.dev (`tests/example.spec.ts:3-20`).
  - Test scripts exist (`package.json:11-14`) but repository lacks corresponding domain-focused test suite.
- **Why it matters:**
  - Critical flows (auth, billing, multi-tenant permissions) are under-protected against regressions.
- **Fix direction (high-level):**
  - Add risk-based tests for authz, RLS-sensitive mutations, and billing/todo/task invariants.
- **Confidence:** High

### 5.3

- **Severity:** LOW
- **Title:** Debug logging/traces in server actions indicate non-production hygiene
- **Evidence:**
  - `app/settings/profile/actions.ts:72-74`, `:98-100`, `:150-152`, `:173-174`, `:203-204`.
- **Why it matters:**
  - Noisy logs reduce signal and may leak internal call structure.
- **Fix direction (high-level):**
  - Replace ad-hoc logs with leveled, redacted observability events.
- **Confidence:** High

---

## D) Enterprise Target Architecture

### Target pattern

**Modular Monolith (feature-based modules + service layer + repository pattern)** — recommended for this repo.

### Why this fits

- The product is broad (projects/tasks/clients/billings/ideas/todo/settings) but still operationally a single deployable Next.js app.
- Supabase naturally supports module-bounded repositories + RPC transaction boundaries.
- Team appears to move fast with server actions; this pattern preserves velocity while creating enterprise guardrails.

### Proposed high-level boundaries

```text
/src (or app + lib aligned by feature)
  /modules
    /projects
      project.service.ts
      project.repository.ts
      project.validation.ts
      project.policies.ts
    /tasks
    /clients
    /billings
    /todo
    /ideas
    /profile
  /platform
    /auth (session + guards)
    /db (supabase clients, query helpers, tx wrappers)
    /observability (sentry/logging policies)
  /ui
    /components (pure presentational)
    /features (container/orchestration, no direct db)
```

### Rules (non-negotiable)

1. **Data access lives in repositories only** (no direct Supabase queries from UI components or ad-hoc action bodies).
2. **Validation lives in module schemas** (all server action inputs parsed/coerced before service execution).
3. **Auth checks happen in service entrypoints** + **owner checks in repository predicates** + **RLS as final guard**.
4. **Multi-step writes use DB transactions/RPC**; no split writes across action functions.
5. **UI components are stateless/presentational where possible**; orchestration in feature controllers.

### Migration strategy in 3 phases

1. **Phase 1 — Guardrails & contracts (2–3 weeks):**
   - Introduce validation schemas + shared action result types.
   - Add lint rules/checks for direct `.from()` usage outside repositories.
   - Create authz test harness for critical mutations.
2. **Phase 2 — High-risk module extraction (3–5 weeks):**
   - Extract `tasks`, `billings`, `clients` into service+repository modules.
   - Convert multi-step writes into RPC transactions.
   - Add index/policy alignment for hottest queries.
3. **Phase 3 — UX/perf standardization (2–4 weeks):**
   - Unify loading/error/accessibility patterns.
   - Move dashboard data loading to server-first strategy with cache policy.
   - Harden observability (PII controls, sampling, alerting SLOs).

---

## E) Prioritized Backlog

| Priority | Item                                                                    | Category              | Effort | Risk reduced | Notes                                                |
| -------- | ----------------------------------------------------------------------- | --------------------- | ------ | ------------ | ---------------------------------------------------- |
| P0       | Add owner-scoped defense-in-depth on all write paths (beyond RLS)       | Security              | M      | Very High    | Start with tasks/projects/clients/billings mutations |
| P0       | Introduce schema validation for every server action input               | Security / Quality    | M      | Very High    | Shared module-level DTO schemas                      |
| P0       | Fix task order indexing logic to `(project_id, status)` domain          | Performance / DB      | M      | High         | Correctness + contention fix                         |
| P1       | Replace split multi-step writes with transactional RPCs                 | DB Integrity          | M      | High         | Begin with business-client-project cascade           |
| P1       | Tighten auth session endpoint flow constraints (`set-recovery-session`) | Security              | S      | High         | State/origin/flow binding                            |
| P1       | Reduce telemetry PII and tune sampling by environment                   | Security / Compliance | S      | Medium-High  | Set policy defaults for prod                         |
| P1       | Build authz/RLS regression tests in CI                                  | Security              | M      | High         | Prevent policy drift incidents                       |
| P2       | Add query/index review for task dashboard filters and sort paths        | Performance / DB      | M      | Medium       | Composite indexes + query plans                      |
| P2       | Standardize loading/error/empty states and keyboard semantics           | UX                    | M      | Medium       | Shared primitives + a11y checks                      |
| P2       | Refactor feature boundaries to module service/repository architecture   | Architecture          | L      | High         | Staged per module                                    |
| P3       | Remove debug traces and standardize structured logs                     | Quality / Ops         | S      | Medium       | Reduce noise + leakage                               |
| P3       | Replace placeholder E2E tests with product-domain tests                 | Quality               | M      | Medium       | Cover auth, billing, task/todo flows                 |

---

## F) Quick Wins (<1 day)

1. Add `/billings` to middleware protected prefixes for consistency.
2. Remove `console.trace` calls from profile/settings server actions.
3. Set `sendDefaultPii` to false in non-debug environments.
4. Replace clickable `div` task cards with semantic buttons/links + keyboard support.
5. Add explicit column lists instead of `.select()` in high-traffic mutations.
6. Add basic server-side numeric bounds checks for task `priority` and billing `amount` at action layer.
7. Add a small CI check that fails if any table lacks RLS enablement/policies.
8. Add one integration test for cross-tenant write rejection on tasks.
9. Add one integration test for billing update ownership enforcement.
10. Replace one dashboard widget manual reload loop with server-loaded initial data + targeted refresh.
