# Miles v1 Integration Viability Audit

## Scope

This audit evaluates how to integrate **Miles v1** as the product core (dashboard + persistent overlay) while minimizing risk to existing modules and flows.

Miles v1 target outcomes considered in this report:

- prevent impulsivity + overload
- protect capacity + focus
- reduce chaos
- increase project completion

No implementation is proposed here; only viability and architecture guidance.

---

## 1) Repo Architecture Reality Check (Modularity)

## Current module boundaries (practical)

### Projects + Tasks (core execution)

- **Primary pages**: `/dashboard`, `/project/[id]`.
- **Reads**:
  - Dashboard reads projects/tasks directly from Supabase in a **client component** (`components/AnalyticsDashboard.tsx`).
  - Project board (`components/ProjectKanbanClient.tsx`) also reads projects/current project/tasks directly from Supabase in client-side effects.
- **Writes**:
  - Projects via server actions in `app/actions/projects.ts`.
  - Tasks via server actions in `app/actions/tasks.ts`.
- **Refresh pattern**:
  - Server actions call `revalidatePath('/dashboard')`, `revalidatePath('/project')`.
  - Client views also call explicit local `loadData()`/refetch after action success.

### Clients + Businesses (CRM-like)

- **Primary pages**: `/clients`, `/clients/[id]`, `/businesses`, `/businesses/[id]`.
- **Reads**:
  - Mix of server-side page bootstrap (`requireAuth`, initial fetches in page.tsx) and client-side loading from server actions (`getClients`, `getBusinesses`, etc.).
  - Some pages also fetch projects directly from Supabase client for sidebar/topbar context.
- **Writes**:
  - Clients + businesses are written through server actions concentrated in `app/clients/actions.ts`.
  - Additional cross-module link writes in `app/businesses/actions.ts` (link project/board/budget).
- **Refresh pattern**:
  - Server actions use `revalidatePath('/clients')`, dynamic detail paths, `/businesses`.
  - UI performs explicit refetch callbacks (`loadClients`, `loadBusinesses`, etc.).

### Billings (finance-lite)

- **Primary page**: `/billings`.
- **Reads**:
  - Billing page client loads billings via `getBillings()` server action and also loads projects with client Supabase query.
- **Writes**:
  - `createBilling`, `updateBilling`, `updateBillingStatus` in `app/billings/actions.ts`.
- **Refresh pattern**:
  - Server action revalidate (`/billings`) + client-side reload (`loadBillings()`).

### Profile / Preferences (settings)

- **Primary pages**: `/settings/profile`, `/settings/appearance`.
- **Reads/Writes**:
  - Server actions in settings modules (`getProfile`, `updateProfile`, preferences actions).
- **Refresh pattern**:
  - Revalidate targeted settings routes and root.

### Additional modules (linked but not core to Miles v1)

- Budgets, Notes, Ideas, Todo lists are separate functional modules, already linked from project/business contexts through server actions and selectors.

## Is the app truly modular/decoupled today?

**Answer: partially modular, not fully decoupled.**

### What is modular already

- Domain server actions are clearly grouped by module (`projects`, `tasks`, `clients`, `billings`, settings).
- Database schema has strong domain tables and RLS ownership patterns.
- Reusable UI primitives/components are used across modules.

### What is not fully decoupled (important for Miles)

1. **Read-path inconsistency (server + client Supabase mixed):** many pages read directly in client components while writes are server actions.
2. **Dual refresh strategy:** both `revalidatePath` and explicit client refetch are used, increasing stale-state risk and timing variance.
3. **Cross-module coupling in UI shells:** topbar/sidebar project loading is duplicated across modules.
4. **Business logic leakage into UI orchestration:** some data-enrichment/joins happen in client-level flows instead of centralized selectors.

**Net:** modular enough for safe incremental integration, but Miles should be introduced as a thin orchestration layer first, not a deep rewrite.

---

## 2) Best Integration Strategy for Miles as Core

## Recommendation: **A) Replace `/dashboard` with Miles Control Center; keep existing modules unchanged**

### Why this is least risky in this repo

- Current authenticated landing already redirects to `/dashboard` from `/` (`app/page.tsx`), so changing dashboard internals preserves routing contracts.
- Sidebar/navigation and existing flows already assume `/dashboard` exists.
- Existing module routes (`/project/[id]`, `/clients`, `/businesses`, `/billings`) can remain untouched.
- Miles can become the default control center without forcing immediate route migration or link rewiring.

### Why not B as primary

- Making `/miles` the new home plus redirects requires broader nav/route updates and can create duplicated “entry center” semantics during transition.

### Hybrid note

- Hybrid (A now + optional `/miles` alias later) is viable, but primary path should still be A for minimal disruption.

---

## 3) Persistent Overlay Feasibility

## Best mount point

- **Primary mount candidate:** `app/layout.tsx` (RootLayout).

### Why

- It wraps all app routes already.
- Theme and i18n providers are already mounted globally here, which Miles overlay will likely depend on.

### Exact layout file(s) to modify (future implementation)

1. `app/layout.tsx` — add global Miles host/overlay component under providers.
2. (Optional refinement) introduce an authenticated route-group layout later to avoid showing overlay on login/signup/forgot/reset screens.

### Existing providers/state patterns to align with

- `ThemeProvider` (client-side theme hydration from preferences).
- `I18nProvider` (loads profile + preferences and exposes t/currency).
- Per-page shells often manage local sidebar/search state; overlay should avoid coupling to those local states and use its own top-level state store/context.

---

## 4) Action Interception (“Impulsivity Gates”)

Below are exact action + entry points and recommended enforcement layer.

## 4.1 createProject

- **Server action:** `app/actions/projects.ts` → `createProject`.
- **UI entry points:**
  - `components/AddProjectModal.tsx`
  - Top-level triggers from `components/TopBar.tsx` and `components/Sidebar.tsx`
- **Recommended gate enforcement:** **both server pre-check + UI pre-check**.
- **Why in this repo:**
  - UI pre-check gives instant UX (show rationale/risk/projection).
  - Server pre-check is required for integrity because multiple UI paths call this action.

## 4.2 createTask (optional gate)

- **Server action:** `app/actions/tasks.ts` → `createTask`.
- **UI entry point:** `components/AddTaskModal.tsx`.
- **Recommended gate enforcement:** **UI pre-check default, server pre-check optional by aggressiveness mode**.
- **Why:** task creation is core execution behavior; hard blocking may hurt usability unless aggressiveness is high and consented.

## 4.3 createClient

- **Server action:** `app/clients/actions.ts` → `createClientAction`.
- **UI entry point:** `app/clients/components/CreateClientModal.tsx` (opened from clients page).
- **Recommended gate enforcement:** **both server + UI**.
- **Why:** this is one of the impulsivity-sensitive actions requested; there are multiple module contexts where client creation may be triggered over time.

## 4.4 createBilling (optional gate)

- **Server action:** `app/billings/actions.ts` → `createBilling`.
- **UI entry point:** `app/billings/BillingsPageClient.tsx` create form.
- **Recommended gate enforcement:** **UI-first; server soft-check/logging**.
- **Why:** finance entries may be urgent and operationally necessary; hard blocks should be conservative.

## 4.5 “start new project” flows

- **Practical flow today:** opening add-project modal from topbar/sidebar and submitting `createProject`.
- **Recommended gate enforcement:** **gate all roads at server action**, and optionally gate modal open/submit in UI for earlier guidance.

## Enforcement trade-off summary

- **UI-only:** best UX, weakest integrity.
- **Server-only:** strongest integrity, weaker immediate UX.
- **Both (recommended for high-risk actions):** strongest overall for this mixed-architecture repo.

---

## 5) Data Needed for v1 (Exists vs minimal adds)

## 5.1 Overload detection feasibility today

**Feasible now** with existing tables:

- From `tasks`: `status`, `priority`, `due_date`, `updated_at`, `project_id`.
- From `projects`: project grouping and owner/client context.

**Immediate overload signals possible now**

- blocked task count and age proxy (`updated_at`)
- high-priority volume (`priority >= 4`)
- upcoming due tasks (`due_date` window)
- non-done inventory (backlog/next/in_progress/blocked)

## 5.2 Basic capacity proxy feasibility today

**Feasible as heuristic only**

- Count tasks in `done` state over lookback windows using `updated_at` as completion proxy.
- Convert to done-tasks/week trend.

**Limitations**

- no real time logs
- no estimated effort per task/project
- no robust completion event history

## 5.3 Minimal new fields REQUIRED for Miles v1

Required profile fields:

- `profiles.weekly_capacity_hours` (numeric)
- `profiles.miles_aggressiveness_level` (small int or enum-like text)
- `profiles.miles_allow_hypotheses` (boolean, optional but recommended)

## 5.4 Additional project fields for projection v1 (recommended)

For better deterministic “if you add X” projections:

- `projects.estimated_hours` (numeric, nullable)
- `projects.stage` (text/enum, nullable)
- `projects.estimated_delivery_date` (date, nullable)

These are not strictly required to launch minimal v1 overload/impulsivity, but they significantly improve projection quality.

---

## 6) Minimal “Miles Core” Code Placement

Recommended structure aligned to current repo style:

- `lib/miles/engine/`
  - `capacity.ts` (capacity baseline, overload thresholds)
  - `overload.ts` (risk scoring from tasks/projects)
  - `projection.ts` (deterministic simulator)
  - `gates.ts` (gate policy evaluator)
- `lib/miles/selectors/`
  - query helpers that normalize cross-module reads for Miles
- `lib/miles/types.ts`
  - shared rule/input/output types
- `app/actions/miles.ts`
  - server actions for gate pre-checks, coach suggestions, optional event logging entrypoint
- `components/miles/`
  - `MilesOverlay.tsx` (persistent pet/launcher)
  - `MilesPanel.tsx` (expanded coach/prediction panel)
  - `MilesGateDialog.tsx` (confirm/block UX for risky actions)
- `lib/miles/events.ts`
  - event emission helpers invoked from existing module actions

Design principle: keep Miles as an orchestration layer (engine + selectors + thin hooks) without refactoring existing modules first.

---

## 7) Risk Assessment (Blockers)

## 7.1 Stale data risks

- Mixed read model (client Supabase reads + server action writes + revalidation + local refetch) can desync overlay metrics from module screens.
- Miles should prefer a single canonical fetch path for core signals.

## 7.2 Task ordering scope issue

- Task order logic in `updateTaskOrder` / `createTask` is status-based and not clearly scoped by `project_id` in ordering queries, creating potential cross-project ordering side effects.
- This can distort overload/projection if Miles assumes order_index has local project meaning.

## 7.3 Theme/overlay conflicts

- Global theming is runtime-applied with CSS vars and dark-mode script; overlay must comply with these tokens and z-index layering to avoid visual conflicts with dialogs/drawers.

## 7.4 RLS/policy implications if Miles stores insights/messages

- If Miles persists coach messages, simulations, or gate decisions, new tables need the same owner-bound RLS pattern used by existing modules.
- Avoid storing cross-user/global insights without explicit policy strategy.

---

## Recommended implementation sequence (non-binding)

1. Swap `/dashboard` content to Miles Control Center (strategy A) while leaving all module routes unchanged.
2. Add global overlay mount in `app/layout.tsx` with route-based visibility control.
3. Add profile fields (`weekly_capacity_hours`, aggressiveness, hypotheses flag).
4. Add dual-layer gates for `createProject` and `createClient`; UI-only soft gates for optional flows first.
5. Add projection quality fields on projects when ready.

This sequence yields the highest product impact with the lowest architectural disruption.
