# Milestone Capacity & Feasibility Audit

## 1) Current Data Inventory

### Projects (`public.projects`)
**Key fields already present**
- `id`, `owner_id`
- `name`, `color`, `category`, `notes`
- `client_id`, `business_id`
- `created_at`, `updated_at`

**Why relevant**
- Supports project scoping, ownership, client/business linkage, and basic lifecycle proxy (`category='archived'`).

### Tasks (`public.tasks`)
**Key fields already present**
- `id`, `project_id`
- `title`, `status` (`backlog|next|in_progress|blocked|done`)
- `priority`
- `due_date`, `notes`
- `order_index`
- `created_at`, `updated_at`

**Why relevant**
- Supports workload status distribution, blocked counts, due-date pressure, completion ratio snapshots.

### Clients (`public.clients`)
**Key fields already present**
- `id`, `owner_id`
- `full_name`, `phone`, `email`
- `gender`
- `address_line1`, `address_line2`, `city`, `state`, `postal_code`
- `preferences`, `notes`
- `created_at`, `updated_at`

**Why relevant**
- Supports customer entity tracking and joins from projects/billing.

### Businesses (`public.businesses`)
**Key fields already present**
- `id`, `owner_id`, `client_id`
- `name`, `tagline`, `description`, `email`
- address fields (`address_line1`, `address_line2`, `city`, `state`, `postal_code`)
- `website`, `social_links`, `notes`
- `created_at`, `updated_at`

**Why relevant**
- Supports client sub-entities and additional project ownership context.

### Billing / Payments (`public.billings`)
**Key fields already present**
- `id`, `owner_id`
- `client_id` (nullable), `client_name` (fallback), `project_id` (nullable)
- `title`, `amount`, `currency`
- `status` (`pending|paid|overdue|cancelled`)
- `due_date`, `paid_at`, `notes`
- `created_at`, `updated_at`

**Why relevant**
- Supports payment health, overdue analysis, paid timestamp usage.

### User Profile (`public.profiles`, `public.user_preferences`)
**Key fields already present**
- `profiles`: `user_id`, `display_name`, `phone`, `timezone`, `locale`, `avatar_asset_id`, `created_at`, `updated_at`
- `user_preferences`: `user_id`, theme/colors, `currency`, branding assets, `created_at`, `updated_at`

**Why relevant**
- Profile exists, but no capacity planning field yet (e.g., no `weekly_capacity_hours`).

---

## 2) Current UI/Routes Inventory

## Projects
**Pages/routes**
- `/dashboard` (analytics and project/task overview)
- `/project/[id]` (project kanban)

**Create/update paths**
- Server actions in `app/actions/projects.ts`: `createProject`, `updateProject`, `archiveProject`, `unarchiveProject`, `deleteProject`.
- UI entry points:
  - `components/AddProjectModal.tsx` → creates projects.
  - `components/EditProjectModal.tsx` and top-bar flows → updates projects.

## Tasks
**Pages/routes**
- `/dashboard` (task KPIs + blocked + deadlines)
- `/project/[id]` (kanban workflow)

**Create/update paths**
- Server actions in `app/actions/tasks.ts`: `createTask`, `updateTask`, `updateTaskOrder`, `deleteTask`, `deleteTasksByIds`.
- UI entry points:
  - `components/AddTaskModal.tsx`
  - `components/EditTaskModal.tsx`
  - `components/KanbanBoard.tsx` drag/drop calls `updateTaskOrder`.

## Clients
**Pages/routes**
- `/clients`
- `/clients/[id]`

**Create/update paths**
- Server actions in `app/clients/actions.ts`:
  - Clients: `createClientAction`, `updateClientAction`, `deleteClientAction`
  - Client links: `createClientLinkAction`, `updateClientLinkAction`, `deleteClientLinkAction`
- UI entry points:
  - `CreateClientModal`, `EditClientModal`, client detail link forms.

## Businesses
**Pages/routes**
- `/businesses`
- `/businesses/[id]`
- Also managed from `/clients/[id]`

**Create/update paths**
- Server actions in `app/clients/actions.ts`: `createBusinessAction`, `updateBusinessAction`, `updateBusinessFieldsAction`, `deleteBusinessAction`.
- Additional linking actions in `app/businesses/actions.ts` (link project/board/budget to business/project).
- UI entry points:
  - `CreateBusinessModal`, `EditBusinessModal`, detail page inline edits.

## Billing
**Pages/routes**
- `/billings`

**Create/update paths**
- Server actions in `app/billings/actions.ts`: `createBilling`, `updateBilling`, `updateBillingStatus`.
- UI entry point:
  - `app/billings/BillingsPageClient.tsx` form and table status updates.

**API route note**
- No dedicated REST-style `app/api/*` billing/project/task routes were found for these modules; writes are primarily via Next.js server actions.

---

## 3) Milestone Feasibility: What can be computed TODAY

## A) System Load — **Partially feasible now**
**Can compute now using existing data**
- Total active workload: count non-`done` tasks.
- Bottleneck indicators: count `blocked` tasks.
- Urgency pressure: high-priority (`priority>=4`) and near due-date tasks (`due_date`).
- Current completion ratio: `done / total` per project and globally.

**Missing for robust load modeling**
- No effort units per task (`estimated_hours`, `actual_hours`).
- No person/assignee model, so load is only account-level, not per teammate.
- No throughput history table (status transition events), so trend quality is limited.

## B) Project Momentum — **Basic proxy feasible, true momentum limited**
**Can compute now**
- Snapshot momentum proxy from current state:
  - completion ratio,
  - blocked ratio,
  - overdue count,
  - recently updated tasks/projects via `updated_at`.

**Missing**
- No status transition history (cannot accurately compute week-over-week flow).
- No explicit project stage field to contextualize movement.
- No planned-vs-actual effort baseline.

## C) Client Health (payments + blocking + rework) — **Partially feasible now**
**Can compute now**
- **Payments health**: from `billings.status`, `due_date`, `paid_at`, and `amount`.
- **Blocking exposure**: join client → projects (`projects.client_id`) → tasks where `status='blocked'`.

**Missing**
- **Rework signal missing**: no field/event for reopened tasks or rework cycles.
- No dispute/approval metadata in billing.
- No explicit SLA/priority-by-client dimension.

## D) Basic milestones (delivery/payment/close) — **Mixed feasibility**
**Can do now (limited)**
- **Payment milestone**: feasible from billing `status='paid'` and `paid_at`.
- **Delivery proxy**: infer “delivery-like” state if all project tasks are `done`.
- **Close proxy**: infer from project `category='archived'`.

**Missing to make milestones reliable**
- No explicit milestone model.
- No authoritative `achieved_at` timestamps for delivery/close milestones.
- Delivery inference can be wrong if tasks are incomplete/out-of-project scope.

---

## 4) Capacity Modeling Feasibility

## Time tracking today
- No native time tracking dataset exists in current schema for projects/tasks/profiles (no timesheets, no task logged duration, no estimated hours fields).

## Can we infer capacity from task completion rate?
- **Yes, as a rough heuristic only**.
- Possible current method:
  - Choose a lookback window (e.g., 14/28 days).
  - Approximate throughput by counting tasks whose `status='done'` and `updated_at` falls in window.
  - Use moving average done-tasks/week as pseudo-capacity.
- Caveats:
  - `updated_at` is not guaranteed to represent first completion time.
  - Task size is not normalized (1 small task vs 1 large task).
  - Reopened/rework events are not captured.

## Minimal new fields needed (requested)
### Profile
- `profiles.weekly_capacity_hours` (numeric)

### Project
- `projects.estimated_hours` (numeric)
- `projects.estimated_delivery_date` (date)
- `projects.stage` (text or enum)

### Milestones
- Minimal option on `projects`:
  - `delivery_achieved_at` (timestamptz)
  - `payment_achieved_at` (timestamptz)
  - `closed_achieved_at` (timestamptz)

## Minimal migration plan (fields only)
- Add `weekly_capacity_hours` to `profiles` (nullable initially).
- Add `estimated_hours`, `estimated_delivery_date`, `stage` to `projects` (nullable initially).
- Add milestone achieved timestamp fields to `projects` (or equivalent milestone table with `achieved_at`).
- Backfill strategy (optional, non-destructive defaults):
  - Keep null for unknown historical data.
  - Derive tentative `closed_achieved_at` only when clear archival event history exists (currently not guaranteed).

---

## 5) Risks / Vibe-coding Mistakes (high-level, factual)

- **No explicit effort/time model**: prevents robust capacity and burn calculations.
- **No milestone/event history table**: makes trend/momentum and milestone auditing approximate.
- **Potential task ordering logic scope issue**: task order calculations in server actions are status-based and not clearly constrained by `project_id`, which can cause cross-project ordering side effects.
- **State/data-fetch duplication across UI**: multiple client components fetch directly from Supabase while writes happen via server actions; this increases risk of stale/duplicated state handling.
- **Closure semantics are implicit**: project closure appears inferred from category/archive rather than explicit close state + timestamp.
- **Rework not represented**: no explicit reopen counter/event prevents reliable “rework” KPI.

