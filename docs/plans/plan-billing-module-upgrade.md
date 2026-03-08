# Plan: Billing Module Upgrade + Copilot Integration (v3)

**Created:** 2026-02-24
**Revised:** 2026-03-08 — added Copilot integration (Phase 7), reordered phases, added pre-flight audit findings
**Status:** Active — execute in order

---

## Pre-flight audit (findings before writing any code)

These issues were found in the current implementation and MUST be fixed as part of this plan. Do not copy these patterns into new code.

| File                        | Line     | Issue                                                                       | Fix                                                           |
| --------------------------- | -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ContextBillingsClient.tsx` | 152      | `alert()` for mutation errors                                               | Replace with `MutationErrorDialog` pattern                    |
| `ContextBillingsClient.tsx` | 63–65    | `useEffect` fetches clients (initial dropdown data)                         | Pass `clients` as a prop from `FromCache` — fetch server-side |
| `app/actions/billings.ts`   | 196, 242 | `updateBillingStatus` / `updateBilling` don't filter by `owner_id`          | Add `.eq('owner_id', user.id)` to all writes                  |
| `app/actions/billings.ts`   | —        | No `deleteBilling` action                                                   | Add `deleteBilling(id)` scoped by `owner_id`                  |
| `app/actions/billings.ts`   | 130–134  | `getBillingsByProjectId` does a separate project row query (3rd round trip) | Join or remove — project name not needed in billing tab       |
| `app/actions/billings.ts`   | 172–173  | `createBilling` throws instead of returning `{ error }`                     | Return `{ data?, error? }` pattern consistently               |

---

## Current state summary

**Schema (`billings` table):** `id, owner_id, client_id, project_id, title, client_name, amount, currency, status, due_date, paid_at, notes, created_at, updated_at`. Status: `pending | paid | overdue | cancelled`.

**UI:** 3 summary cards (total / paid / pending). Inline form. Table with status dropdown. FAB "New charge". No categories, no billing type, no modal, no filters, no receipts, no budget link, no reminders, no export, no copilot awareness.

---

## Objectives

- **A. Categories** — per-user billing categories with defaults and CRUD.
- **B. Billing types** — charge / payment / spending, with conditional fields (issued_at, payment_method, paid_by, expect_reimbursement).
- **C. UX overhaul** — modal create/edit, `MutationErrorDialog`, fix all violations.
- **D. Filters** — by category, status, date range (client-side).
- **E. Budget link** — associate a billing to a `budget_item` of the same project.
- **F. Receipts** — one file attachment per billing via Document Hub; "Receipts & tickets" read-only folder in Documents.
- **G. Copilot integration** — AI can read billing context and propose create / update / delete operations via natural language.
- **H. Reminders** — per-billing reminder dates; upcoming-reminders widget at the top of the tab.
- **I. Export** — CSV by period (month, year) and/or category.

---

## Feature specifications

### A. Categories — per user, global across projects

- **Table `billing_categories`:** `id, owner_id (FK auth.users), name, color (text nullable), sort_order (int default 0), created_at, updated_at`. RLS by `owner_id`. Index: `(owner_id, sort_order)`.
- **`billings` column:** `category_id uuid NULL REFERENCES billing_categories(id) ON DELETE SET NULL`.
- **Default seed:** On first use (or via RPC), insert defaults per user: "Services", "Materials", "Fees", "Subscriptions", "Other" (`sort_order` 0–4).
- **UI:** Category select in the create/edit modal. Filter chip/dropdown in the billing list. "Manage categories" modal (add, rename, reorder, delete — warn if category has billings).
- **Policy:** Deleting a category with billings → SET NULL on `category_id` (no orphan block, just warn in UI).

### B. Billing types + extended fields

New columns on `billings`:
| Column | Type | Notes |
|---|---|---|
| `type` | text NOT NULL default 'charge' | CHECK IN ('charge', 'payment', 'spending') |
| `issued_at` | date NULL | Emission date for charges |
| `payment_method` | text NULL | 'cash', 'transfer', 'card', 'client_card', 'other' |
| `paid_by` | text NULL | 'me', 'client', 'other' — for spendings |
| `expect_reimbursement` | boolean NOT NULL default false | Spending: someone owes money back |
| `reimburse_to_client_id` | uuid NULL REFERENCES clients(id) ON DELETE SET NULL | Who should reimburse |

**UI:** Type selector (charge / payment / spending) at top of form. Conditional fields: if charge → show `issued_at`; always show `payment_method`; if spending → show `paid_by`, `expect_reimbursement`, and optionally `reimburse_to_client_id`.

### C. UX overhaul

- Replace inline form with a **Dialog modal** (using `components/ui/dialog`).
- Replace `alert()` with **`MutationErrorDialog`** pattern.
- All action violations fixed (see pre-flight audit).
- Pass `clients` as a prop from `FromCache` (fetched server-side alongside billings in 2 parallel queries).
- Add delete support: trash icon in table row, confirm via `MutationErrorDialog`-style confirm dialog.
- Mobile: table scrolls horizontally; on very small screens consider card layout.

### D. Filters (client-side)

- By **category** (dropdown or chips).
- By **status** (pending / paid / overdue / cancelled).
- By **billing type** (charge / payment / spending).
- By **date range** (due_date or issued_at): "This month", "This year", custom range.

Filter state stays in the Client component; no extra DB queries. Reset button.

### E. Budget link

- Column: `budget_item_id uuid NULL REFERENCES budget_items(id) ON DELETE SET NULL`.
- In form: optional "Budget item" section — load `budget_items` for the current project (via `budget_categories` join). Selector: budget name → category → item.
- Shown in table row as a small badge or column.
- Server action validates that the chosen `budget_item` belongs to the same project.

### F. Receipts — Document Hub integration

- Column: `receipt_file_id uuid NULL REFERENCES project_files(id) ON DELETE SET NULL`.
- Upload uses the existing Document Hub flow (`lib/storage/upload.ts` + `project_files`). Files stored with `document_category = 'receipt'` (add to enum if needed) and the billing's `project_id`.
- Billing modal: "Attach receipt" / "View receipt" / "Replace" / "Remove" buttons depending on state.
- Document Hub: a virtual "Receipts & tickets" folder shows files linked to any billing in the project. **In that folder:** rename/view/download allowed; delete and move disabled (tooltip explains to go to Billing tab). Removing/replacing from Billing tab unlinks and optionally soft-deletes the file.
- API route: reuse `app/api/documents/[fileId]/view/route.ts` (302 redirect, no blank tab issue).

### G. Copilot integration (NEW — full CRUD proposals + context)

This is the primary addition to the original plan. The AI must be able to:

- **Read** all billing data in context (standard summary + full list with IDs in full mode).
- **Create** a new billing entry.
- **Update** a billing (status, amount, due_date, title, type, category).
- **Delete** a billing.

See **Section: Copilot integration detail** below.

### H. Reminders

- **Table `billing_reminders`:** `id, billing_id (FK billings ON DELETE CASCADE), owner_id (FK auth.users), remind_at (timestamptz NOT NULL), message (text NULL), created_at`. RLS by `owner_id`. Index: `(owner_id, remind_at)`.
- In billing modal: "Add reminder" — date/time + optional message. Can add multiple.
- **Upcoming reminders widget:** At top of the Billings tab, a section like "Upcoming reminders" showing the next N (≤7 days) reminders with billing title, date, and quick-edit link. Similar to "Recently opened" in Documents.
- Widget query: `billing_reminders` where `remind_at BETWEEN now() AND now() + interval '7 days'` joined with `billings` for title/amount/due_date.

### I. Export

- Server action or API route returning CSV with: type, category, title, client, amount, currency, status, due_date, issued_at, payment_method, notes.
- Filters: by month, by year, by category — combinable.
- UI: "Export" button in the Billings tab toolbar with a small options popover (period + category).

---

## Copilot integration detail

### Files to create/modify

| File                                                 | Change                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/copilot/registry/modules/billings.ts`           | NEW — validators + approve functions + context fetcher                                |
| `lib/copilot/schema.ts`                              | Add `BillingProposalPayload`, `UpdateBillingPayload`, `DeleteBillingPayload` to union |
| `lib/copilot/registry/index.ts`                      | Import + spread `billingsCapabilities`                                                |
| `lib/copilot/context.ts`                             | Import `fetchBillingsContext`, add to `Promise.all`, append to context blocks         |
| `components/context/copilot/card-renderers/index.ts` | Add `billing`, `update_billing`, `delete_billing` configs                             |
| `components/context/copilot/CopilotProposalCard.tsx` | Add billing detail rendering (amount + status + type)                                 |
| `locales/en.json` + `locales/es.json`                | Add billing proposal i18n keys                                                        |

### Context fetcher

`fetchBillingsContext(projectId, scope, supabase): Promise<string>`

Queries `billings` for the project (joined with `billing_categories` for category name):

**Standard mode** (no IDs — summary only):

```
## Billings
5 billings — $3,200 paid · $1,400 pending · $600 overdue
Types: 3 charges, 1 payment, 1 spending
Recent: "Web design retainer", "Logo package", "Monthly hosting"
```

**Full mode** (with IDs — mutation proposals possible):

```
## Billings (5 total)
- [uuid] Web design retainer · charge · $2,000 · paid · due 2026-01-31
- [uuid] Logo package · charge · $800 · pending · due 2026-02-15 · category: Design
- [uuid] Monthly hosting · spending · $200 · paid
- [uuid] Copywriting · payment · $600 · overdue · due 2026-01-20
- [uuid] Print materials · spending · $400 · pending
```

### Proposal types

**`billing` (create):**

```json
{
  "type": "billing",
  "title": "Website retainer - March",
  "amount": 2000,
  "billing_type": "charge",
  "status": "pending",
  "client_name": "Acme Corp",
  "due_date": "2026-03-31",
  "category_name": "Services",
  "payment_method": "transfer",
  "notes": "Monthly retainer fee"
}
```

Required: `title`, `amount` (> 0). Optional: `client_name`, `due_date`, `status`, `billing_type`, `category_name`, `payment_method`, `notes`.

**`update_billing` (update):**

```json
{
  "type": "update_billing",
  "entity_id": "uuid",
  "entity_title": "Website retainer",
  "status": "paid",
  "amount": 2100,
  "due_date": "2026-04-01"
}
```

Required: `entity_id`. At least one updatable field: `title`, `status`, `amount`, `due_date`, `notes`, `billing_type`, `category_name`.

**`delete_billing` (delete):**

```json
{
  "type": "delete_billing",
  "entity_id": "uuid",
  "entity_title": "Website retainer"
}
```

### Registry module structure (`lib/copilot/registry/modules/billings.ts`)

- `validateBillingShape(item)` — checks title (non-empty), amount (positive number), status if present (in enum), billing_type if present (in enum).
- `validateUpdateBillingShape(item)` — checks entity_id (UUID), at least one updatable field.
- `validateDeleteBillingShape(item)` — checks entity_id (UUID).
- `approveBilling(payload, ctx)` — inserts into `billings` scoped by `owner_id` and `project_id`. Resolves `category_name` → `category_id` if provided (lookup `billing_categories` by `owner_id + name`). Returns `{ entityId }`.
- `approveUpdateBilling(payload, ctx)` — updates `billings.eq('id', entity_id).eq('owner_id', userId)`. Resolves category_name if provided.
- `approveDeleteBilling(payload, ctx)` — deletes `billings.eq('id', entity_id).eq('owner_id', userId)`.

### Prompt rules (added to system prompt)

```
## Billing rules
- To create a billing use type "billing". Required: title, amount (number > 0).
- Optional: billing_type ("charge" | "payment" | "spending", default "charge"),
  status ("pending" | "paid" | "overdue" | "cancelled"), client_name, due_date (YYYY-MM-DD),
  category_name (must match an existing category), payment_method ("cash"|"transfer"|"card"|"client_card"|"other"), notes.
- To update use type "update_billing" with entity_id (UUID from full context) and any fields to change.
- To delete use type "delete_billing" with entity_id. Requires full context mode (UUID must be visible).
- Billing IDs are only visible in full context mode. Do not guess IDs.
```

### i18n keys to add

| Key                               | English        | Spanish            |
| --------------------------------- | -------------- | ------------------ |
| `copilot.proposal_billing`        | Create billing | Crear factura      |
| `copilot.proposal_update_billing` | Update billing | Actualizar factura |
| `copilot.proposal_delete_billing` | Delete billing | Eliminar factura   |
| `copilot.created_view_billings`   | View billings  | Ver facturación    |

---

## Execution phases

Execute in order. Each phase must pass `npm run lint`, `npx tsc --noEmit`, `npm run test -- --run` before starting the next.

| Phase        | Content                                                                                                                                                                                            | Depends on                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Phase 1**  | Schema + categories: `billing_categories` table + `category_id` on billings, default seed RPC, CRUD categories, category select in form, filter by category                                        | None                                              |
| **Phase 2**  | Actions overhaul: fix `owner_id` scoping on writes, add `deleteBilling`, change `createBilling` to return `{ data?, error? }`, remove separate project row query, pass clients as prop from server | None (do in parallel with Phase 1 or right after) |
| **Phase 3**  | UX overhaul: Dialog modal for create/edit, `MutationErrorDialog` for errors, delete confirm flow, improved table (delete button), mobile layout                                                    | Phase 1 + 2 (so modal has categories)             |
| **Phase 4**  | Billing types: `type`, `issued_at`, `payment_method`, `paid_by`, `expect_reimbursement`, `reimburse_to_client_id` columns + conditional UI in modal + action updates                               | Phase 3 (adds to already-built modal)             |
| **Phase 5**  | Filters: by category, status, type, date range — client-side, reset button                                                                                                                         | Phase 1 + 4 (needs categories + type)             |
| **Phase 6**  | Budget link: `budget_item_id` column, selector in modal (budget → category → item, project-scoped), display in table                                                                               | None (schema only touches billings)               |
| **Phase 7**  | **Copilot integration**: `lib/copilot/registry/modules/billings.ts` + schema types + registry + context fetcher + card renderers + i18n. Full CRUD proposals.                                      | Phases 1–4 (for correct field support)            |
| **Phase 8**  | Receipts: `receipt_file_id` column, upload/view/replace/remove in modal, "Receipts & tickets" virtual folder in Documents                                                                          | Document Hub (already exists)                     |
| **Phase 9**  | Reminders: `billing_reminders` table, add/remove reminders in modal, upcoming-reminders widget at top of tab                                                                                       | None                                              |
| **Phase 10** | Export: CSV server action or API route by period + category, "Export" button with options popover                                                                                                  | Phases 1, 5                                       |

---

## Schema changes summary

### New table: `billing_categories`

```sql
CREATE TABLE public.billing_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_categories ENABLE ROW LEVEL SECURITY;
-- RLS: owner_id = auth.uid()
-- Index: (owner_id, sort_order)
-- Trigger: update_billing_categories_updated_at
```

### New table: `billing_reminders`

```sql
CREATE TABLE public.billing_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id UUID NOT NULL REFERENCES public.billings(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_reminders ENABLE ROW LEVEL SECURITY;
-- RLS: owner_id = auth.uid()
-- Index: (owner_id, remind_at)
```

### New columns on `billings`

```sql
ALTER TABLE public.billings
  ADD COLUMN category_id UUID NULL REFERENCES public.billing_categories(id) ON DELETE SET NULL,
  ADD COLUMN type TEXT NOT NULL DEFAULT 'charge' CHECK (type IN ('charge', 'payment', 'spending')),
  ADD COLUMN issued_at DATE NULL,
  ADD COLUMN payment_method TEXT NULL,
  ADD COLUMN paid_by TEXT NULL,
  ADD COLUMN expect_reimbursement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reimburse_to_client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN receipt_file_id UUID NULL REFERENCES public.project_files(id) ON DELETE SET NULL,
  ADD COLUMN budget_item_id UUID NULL REFERENCES public.budget_items(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX billings_category_id_idx ON public.billings(category_id);
CREATE INDEX billings_type_idx ON public.billings(project_id, type);
CREATE INDEX billings_budget_item_id_idx ON public.billings(budget_item_id);
```

---

## Risk notes

- **Category deletion with linked billings:** `ON DELETE SET NULL` handles it at the DB level. In the UI, warn the user before deleting a category that has associated billings.
- **Billing type field `type` conflicts with JS `type` keyword:** In payloads, use `billing_type` as the field name in the copilot proposal to avoid confusion, and map it to `type` in the approve function.
- **Receipts — replaced files:** When a receipt is replaced from Billing, the old `project_files` row is unlinked from `receipt_file_id`. Decide whether to soft-delete it (mark `deleted_at`) or leave it as an orphan in Documents (it will no longer appear in "Receipts & tickets" but will remain in the general docs list). Recommended: soft-delete the old file on replace.
- **Copilot category resolution:** The AI sends `category_name` (a string); the approve function resolves it to `category_id` by looking up `billing_categories` where `owner_id = user.id AND name ILIKE category_name`. If not found, create it silently or skip (recommended: skip and leave `category_id` null).
- **`billing_type` vs `type` in DB:** The `billings.type` column uses 'charge'/'payment'/'spending'. In Supabase types these may appear as `string` since it's a CHECK constraint, not a Postgres enum. TypeScript cast as needed.
- **Export performance:** CSV generation is done server-side with filters pushed to Supabase (not client filtering). For large lists this keeps the response payload small.

---

## Definition of Done checklist

- [ ] **Phase 1:** `billing_categories` table + RLS + indexes + trigger. Default seed RPC. `category_id` on billings. Category CRUD UI + select in form. Filter by category.
- [ ] **Phase 2:** `owner_id` scoping on all writes. `deleteBilling` action. `createBilling` returns `{ data?, error? }`. No separate project row query. Clients passed as prop.
- [ ] **Phase 3:** Modal create/edit. `MutationErrorDialog` for all errors. Delete confirm flow. No `alert()` anywhere in billings.
- [ ] **Phase 4:** All new columns added (type, issued_at, payment_method, paid_by, etc.). Conditional form UI by type. Actions updated.
- [ ] **Phase 5:** All filters working client-side. Reset button. Filter state does not trigger extra DB calls.
- [ ] **Phase 6:** `budget_item_id` column. Project-scoped budget item selector in modal. Displayed in table.
- [ ] **Phase 7:** `fetchBillingsContext` in context builder. `billing` / `update_billing` / `delete_billing` proposals working end-to-end. Tests for validators. i18n keys in both locales.
- [ ] **Phase 8:** `receipt_file_id` column. File upload/view/replace/remove from billing modal. "Receipts & tickets" folder in Documents with correct restrictions.
- [ ] **Phase 9:** `billing_reminders` table + RLS. Add/remove reminders in modal. Upcoming-reminders widget at top of tab.
- [ ] **Phase 10:** CSV export API route. Export button + options popover in UI.
- [ ] All phases: `npm run lint`, `npx tsc --noEmit`, `npm run test -- --run`, `npm run build` pass.

---

## References

- `app/context/[projectId]/billings/` — current billing tab
- `app/actions/billings.ts` — current server actions (violations documented above)
- `supabase/migrations/20260213120000_add_billings_module.sql`
- `supabase/migrations/20260213121000_billings_add_client_and_overdue.sql`
- Document Hub: `20260224100000_document_hub.sql`, `app/api/documents/[fileId]/view/route.ts`
- Budgets: `supabase/migrations/202601250000_presupuestos.sql`
- Copilot registry: `lib/copilot/registry/modules/tasks.ts` (CRUD pattern reference)
- Copilot context: `lib/copilot/context.ts`
- Error dialog: `components/board/MutationErrorDialog.tsx`
- AGENTS.md — MutationErrorDialog, window.open, RPC for multi-step, data loading rules
