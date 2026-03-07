# Project Copilot — Module Registry Implementation Plan

**Created:** 2026-03-07
**Status:** Ready for implementation
**Design document:** `docs/project-copilot/architecture/copilot-universal-module-control.md`

---

## Goal

Refactor the Copilot's internals so that adding a new module requires creating one new file + one registry line, with no changes to the core parser, approval dispatcher, or card shell. Then use that foundation to give the Copilot control over all ClearQueue modules.

---

## Phase 1 — Registry infrastructure (pure refactor, no behavior change)

**Goal:** Migrate existing 10 proposal types into the registry pattern. All tests pass. No user-visible change. No new features.

### 1.1 Create registry types

**File:** `lib/copilot/registry/types.ts`

Define:

```typescript
export interface ApproveContext {
  projectId: string;
  userId: string;
  supabase: SupabaseServerClient; // typed Supabase client from server.ts
}

export interface CopilotModuleCapability {
  type: string;
  module: string;
  label: string; // i18n key
  icon: string; // lucide icon name (string, not component — avoids server/client boundary)
  cardVariant: 'create' | 'delete' | 'update' | 'graph';
  promptDescription: string;
  examplePayload: object;
  contextFetcher?: (
    projectId: string,
    scope: 'standard' | 'full'
  ) => Promise<string>;
  validate: (item: unknown) => ParsedProposal | null;
  approve: (
    payload: unknown,
    ctx: ApproveContext
  ) => Promise<{ entityId?: string; error?: string }>;
  /** Optional: paths to revalidate after approval. Defaults to board + notes + milestones. */
  revalidatePaths?: (projectId: string) => string[];
}
```

### 1.2 Create module files for existing types

One file per module group:

**`lib/copilot/registry/modules/tasks.ts`**

- Export `tasksCapabilities: CopilotModuleCapability[]`
- Covers: `task`, `delete_task`, `update_task`
- Move `validateTaskShape`, `validateDeleteTaskShape`, `validateUpdateTaskShape` here
- `approve` for `task`: call `approve_copilot_proposal_atomic` (RPC) — still uses the atomic RPC for create
- `approve` for `delete_task`, `update_task`: inline from current `approveProposal` mutation branch
- `contextFetcher`: returns the tasks section (counts + recent tasks)

**`lib/copilot/registry/modules/notes.ts`**

- Covers: `note`, `delete_note`, `update_note`
- Same pattern

**`lib/copilot/registry/modules/milestones.ts`**

- Covers: `milestone`, `delete_milestone`, `update_milestone`
- `approve` for `milestone`: still uses `approve_copilot_proposal_atomic` RPC
- `contextFetcher`: returns the milestones section

**`lib/copilot/registry/modules/ideas.ts`**

- Covers: `mind_map`
- Move `createMindMapFromProposal` logic here
- `contextFetcher`: returns board names for this project (brief)

### 1.3 Create registry index

**File:** `lib/copilot/registry/index.ts`

```typescript
import { tasksCapabilities } from './modules/tasks';
import { notesCapabilities } from './modules/notes';
import { milestonesCapabilities } from './modules/milestones';
import { ideasCapabilities } from './modules/ideas';

export const COPILOT_REGISTRY = new Map<string, CopilotModuleCapability>(
  [
    ...tasksCapabilities,
    ...notesCapabilities,
    ...milestonesCapabilities,
    ...ideasCapabilities,
  ].map((c) => [c.type, c])
);
```

### 1.4 Refactor parser to use registry

**File:** `lib/copilot/parser.ts`

- Remove all individual `validate*Shape` functions (they move to module files)
- Remove `switch` statement from `parseProposals`
- Replace with: `const cap = COPILOT_REGISTRY.get(obj.type); if (cap) validated = cap.validate(item);`
- `ParsedProposal` type stays the same (union from schema.ts)

### 1.5 Refactor approveProposal to use registry

**File:** `app/context/[projectId]/copilot/actions.ts`

- Remove `MUTATION_TYPES` set
- Remove all `if (type === 'delete_milestone') ...` branches
- Remove `if (type === 'mind_map') ...` branch
- Replace with:
  ```typescript
  const cap = COPILOT_REGISTRY.get(type);
  if (!cap) return { error: `Unknown proposal type: ${type}` };
  const { entityId, error } = await cap.approve(payload, {
    projectId,
    userId: user.id,
    supabase,
  });
  ```
- Note: `task`, `note`, `milestone` create types still call the RPC from within their `approve` function — the dispatcher doesn't need to know this

### 1.6 Refactor context.ts to use registry

**File:** `lib/copilot/context.ts`

- Remove manual fetching of tasks/notes/milestones from `buildProjectContext`
- Remove manual string concatenation of context blocks
- Replace with:

  ```typescript
  const moduleCapabilities = [...COPILOT_REGISTRY.values()]
    .filter((c, i, arr) => arr.findIndex((x) => x.module === c.module) === i) // unique modules
    .filter((c) => c.contextFetcher);

  const contextBlocks = await Promise.all(
    moduleCapabilities.map((c) => c.contextFetcher!(projectId, scope))
  );
  ```

- System prompt examples auto-built: `[...COPILOT_REGISTRY.values()].map(c => c.examplePayload)`

### 1.7 Refactor CopilotProposalCard to use registry

**File:** `components/context/copilot/CopilotProposalCard.tsx`

- Remove giant switch for `typeLabel` and `TypeIcon` — look up from registry
- Create a UI registry in `components/context/copilot/card-renderers/index.ts` mapping type → detail component
- Card shell (approve/reject buttons, title, status, link) stays in `CopilotProposalCard`
- Per-type details rendered by the detail component for that type

### 1.8 Tests

- All 74 existing parser tests must still pass (behavior unchanged)
- Add one test: unknown proposal type is skipped (not in registry → returns null)
- Add one test: registry has no duplicate types

**Definition of done for Phase 1:**

- `npm run lint` passes
- `npm run build` passes
- `npm run test -- --run` passes (74+ tests)
- No user-visible behavior change

---

## Phase 2 — Links module (link vault)

**Goal:** User can say "add a link to the Stripe docs under References" and the Copilot proposes it.

### New proposal types

| Type            | Action                              |
| --------------- | ----------------------------------- |
| `link`          | Create a new link                   |
| `link_category` | Create a new link category          |
| `delete_link`   | Delete an existing link             |
| `update_link`   | Update link title, url, or category |

### Payload shapes

```typescript
interface LinkProposalPayload {
  type: 'link';
  title: string;
  url: string;
  category?: string | null; // category name (resolved to id server-side)
  description?: string | null;
}

interface LinkCategoryProposalPayload {
  type: 'link_category';
  name: string;
  description?: string | null;
}

interface DeleteLinkPayload {
  type: 'delete_link';
  entity_id: string; // UUID from context
  entity_title?: string;
}

interface UpdateLinkPayload {
  type: 'update_link';
  entity_id: string;
  entity_title?: string;
  title?: string;
  url?: string;
  category?: string | null;
}
```

### Files to create/change

| File                                                                | Action                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `lib/copilot/registry/modules/links.ts`                             | New — capability definitions, validators, approve functions, contextFetcher |
| `lib/copilot/registry/index.ts`                                     | Add `linksCapabilities` import + spread                                     |
| `lib/copilot/schema.ts`                                             | Add new payload interfaces to union                                         |
| `components/context/copilot/card-renderers/LinkProposalDetails.tsx` | New — renders url + category                                                |
| `components/context/copilot/card-renderers/index.ts`                | Register `link`, `link_category`, `delete_link`, `update_link`              |
| `locales/en.json` + `locales/es.json`                               | Add `copilot.proposal_link`, `copilot.proposal_link_category`, etc.         |

### Context fetcher behavior

- Standard: "Links: 12 total. Categories: References, Tools, Design. Recent: Stripe docs, GitHub, Figma."
- Full: All links with id, title, url, category — so AI can propose update/delete

### Approval logic

- `link` create: call `createProjectLink` from `app/actions/links.ts`; category resolved by name → id
- `link_category`: call `createLinkCategory`
- `delete_link`, `update_link`: call existing link actions with entity_id

### DB migration

None needed — `copilot_proposals.type` CHECK already accepts any string after Phase 1 migration (or extend the CHECK to include new types).

---

## Phase 3 — Todos module

**Goal:** User can say "add a todo to email the client" or "mark the deploy task as done".

### New proposal types

| Type               | Action                          |
| ------------------ | ------------------------------- |
| `todo_item`        | Create a todo item in a list    |
| `toggle_todo`      | Toggle a todo item's done state |
| `delete_todo_item` | Delete a todo item              |

### Payload shapes

```typescript
interface TodoItemProposalPayload {
  type: 'todo_item';
  content: string;
  list_title?: string; // resolved to list_id server-side; uses first list if absent
  priority?: number;
}

interface ToggleTodoPayload {
  type: 'toggle_todo';
  entity_id: string; // todo_item UUID from context
  entity_title?: string;
  done: boolean; // target state
}

interface DeleteTodoItemPayload {
  type: 'delete_todo_item';
  entity_id: string;
  entity_title?: string;
}
```

### Notes

- The `toggle_todo` approval calls `toggleTodoItem` from `app/actions/todo.ts`
- This tests the "state-change action" pattern (not just CRUD)
- Context fetcher: show todo lists with item counts; full scope shows all items with IDs

---

## Phase 4 — Budgets module

**Goal:** User can say "add a $2,400 infrastructure cost to the budget".

### New proposal types

| Type                  | Action                       |
| --------------------- | ---------------------------- |
| `budget_entry`        | Create a budget entry        |
| `update_budget_entry` | Update amount or description |
| `delete_budget_entry` | Delete an entry              |

### Payload shapes

```typescript
interface BudgetEntryProposalPayload {
  type: 'budget_entry';
  description: string;
  amount: number; // numeric, currency handled by project settings
  category?: string;
  budget_name?: string; // resolved to budget_id server-side
}
```

### Notes

- Numeric validation is critical: amount must be a finite positive number
- Currency is project-scoped — no currency conversion
- Context fetcher: budget names + total amounts; full scope shows line items

---

## Phase 5 — Billings module

Simple: `billing_record` create type. Same pattern as budget entry, different table.

---

## Phase 6 — Ideas (individual nodes)

Complement to the existing `mind_map` type:

| Type              | Action                                         |
| ----------------- | ---------------------------------------------- |
| `idea`            | Create a single idea (not a full board)        |
| `idea_connection` | Create a connection between two existing ideas |

These use entity_ids from context (requires full scope for ideas).

---

## Phase 7 — Owner module

| Type           | Action                                           |
| -------------- | ------------------------------------------------ |
| `update_owner` | Update project owner/client name, email, company |

Single-field updates to the project owner record.

---

## Rollout order and dependencies

```
Phase 1 (registry refactor)
    ↓
Phase 2 (links)     Phase 3 (todos)     Phase 4 (budgets)
    ↓                    ↓                    ↓
Phase 5 (billings)  Phase 6 (ideas)    Phase 7 (owner)
```

Phases 2–7 are independent of each other (can be done in any order after Phase 1).

---

## File map: what exists vs. what will exist

```
lib/copilot/
  schema.ts                          ← exists, extended each phase
  parser.ts                          ← exists, simplified in Phase 1
  context.ts                         ← exists, simplified in Phase 1
  registry/
    types.ts                         ← NEW (Phase 1)
    index.ts                         ← NEW (Phase 1)
    modules/
      tasks.ts                       ← NEW (Phase 1) — migrated from parser.ts + actions.ts
      notes.ts                       ← NEW (Phase 1)
      milestones.ts                  ← NEW (Phase 1)
      ideas.ts                       ← NEW (Phase 1) — migrated mind_map logic
      links.ts                       ← NEW (Phase 2)
      todos.ts                       ← NEW (Phase 3)
      budgets.ts                     ← NEW (Phase 4)
      billings.ts                    ← NEW (Phase 5)

components/context/copilot/
  CopilotProposalCard.tsx            ← exists, simplified in Phase 1
  card-renderers/
    index.ts                         ← NEW (Phase 1)
    TaskProposalDetails.tsx          ← NEW (Phase 1) — extracted from card
    NoteProposalDetails.tsx          ← NEW (Phase 1)
    MilestoneProposalDetails.tsx     ← NEW (Phase 1)
    MindMapProposalDetails.tsx       ← NEW (Phase 1)
    LinkProposalDetails.tsx          ← NEW (Phase 2)
    TodoProposalDetails.tsx          ← NEW (Phase 3)
    BudgetProposalDetails.tsx        ← NEW (Phase 4)

app/context/[projectId]/copilot/
  actions.ts                         ← exists, simplified dispatcher in Phase 1
```

---

## Key constraints from AGENTS.md

- Registry module files in `lib/copilot/registry/modules/` are **lib files** — they must not import from `app/` or use `'use server'`. The `approve` functions must call imported server actions.
- `approve` functions that call Supabase directly (not via an existing server action) must use the `supabase` client from `ApproveContext` — it is already authenticated and scoped.
- New module types that require multi-step DB writes (create + link) must use an `_atomic` RPC or accept non-atomicity with a documented reason (as done for `mind_map`).
- All new `contextFetcher` functions must scope queries by `owner_id` and `project_id`.

---

## Success criteria

| Metric                                      | Target                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Files touched to add a new module           | ≤ 3 (registry module file + i18n + card renderer)                  |
| `approveProposal` function length           | < 50 lines (dispatcher only)                                       |
| `parseProposals` function length            | < 30 lines (generic loop only)                                     |
| `CopilotProposalCard.tsx` switch statements | 0 (replaced by registry lookup)                                    |
| Test coverage                               | All existing tests pass; each new module has ≥ 5 parser unit tests |
| User-visible change in Phase 1              | None                                                               |
