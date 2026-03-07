# Project Copilot — Universal Module Control

**Created:** 2026-03-07
**Status:** Design locked — implementation pending
**Author:** Architecture review session
**Related:**

- `docs/project-copilot/architecture/project-copilot-architecture-adr.md` (original ADRs)
- `docs/project-copilot/plans/copilot-module-registry-implementation-plan.md` (implementation plan)

---

## 1. Vision

The Project Copilot must evolve from a **task/note/milestone planning assistant** into a **universal natural language interface for the entire ClearQueue application**. The user should be able to type anything — "add a link to the Stripe docs under References", "create a budget entry for $2,400 of infrastructure costs", "mark the onboarding todo as done" — and the Copilot handles it, always with the user's explicit approval before writing.

This document records the current state of the Copilot, the scaling problem we identified, the architecture decision made to solve it, and the modules targeted for implementation.

---

## 2. Current state (as of 2026-03-07)

### What the Copilot can do

| Action                       | Type                                         | Mechanism                                          |
| ---------------------------- | -------------------------------------------- | -------------------------------------------------- |
| Create task                  | `task`                                       | Atomic RPC `approve_copilot_proposal_atomic`       |
| Create note                  | `note`                                       | Atomic RPC                                         |
| Create milestone             | `milestone`                                  | Atomic RPC                                         |
| Assign task to milestone     | `task` with `milestone_id`/`milestone_title` | Atomic RPC resolves title → id                     |
| Delete milestone/task/note   | `delete_*`                                   | Server action dispatch                             |
| Update milestone/task/note   | `update_*`                                   | Server action dispatch                             |
| Create idea board (mind map) | `mind_map`                                   | Server action: board + ideas + items + connections |
| Request full context         | `<<REQUEST_CONTEXT>>`                        | Client retries with `scope: 'full'`                |
| Bulk approve/reject          | UI-only                                      | Loop over pending proposals for a message          |

### Current proposal types (total: 10)

```typescript
type ProposalType =
  | 'task'
  | 'note'
  | 'milestone'
  | 'delete_milestone'
  | 'update_milestone'
  | 'delete_task'
  | 'update_task'
  | 'delete_note'
  | 'update_note'
  | 'mind_map';
```

### Current context included in every system prompt

- **Standard scope:** 10 most recent tasks (title + status), 5 notes (title only), up to 8 milestones (id + title)
- **Full scope:** Up to 80 tasks with id/status/milestone_id, 20 notes with id, all milestones

No other modules (links, budgets, billings, todos, ideas, owner) appear in the context. The Copilot is blind to them and cannot propose actions for them.

---

## 3. The scaling problem

### Every new module type requires touching 6 files

Adding a new proposal type (e.g., `link`) currently requires:

1. **`lib/copilot/schema.ts`** — new payload interface + extend the `ProposalType` union + extend `CopilotProposal.payload` union
2. **`lib/copilot/parser.ts`** — new validator function + new `case` in the `parseProposals` switch
3. **`lib/copilot/context.ts`** — fetch data from new module + add section to system prompt + add example to `<<PROPOSALS>>` block
4. **`app/context/[projectId]/copilot/actions.ts`** — new `if/else` branch in `approveProposal`
5. **`components/context/copilot/CopilotProposalCard.tsx`** — new `case` in switch for icon/label + new render section for details
6. **`locales/en.json` + `locales/es.json`** — new i18n keys

With 8+ ClearQueue modules to integrate, this approach produces:

- Files with hundreds of lines of if/else and switch/case
- No clear ownership — module-specific logic is scattered across copilot files
- High risk of merge conflicts when two modules are developed in parallel
- Each new developer must read the entire `approveProposal` function to understand where to add their module

### The files will keep growing

`approveProposal` in `actions.ts` is already ~200 lines for 10 proposal types. At 30 types (full module coverage), it will be ~600 lines. `CopilotProposalCard.tsx` has the same problem. The parser switch will have 30+ cases. `context.ts` will have a `Promise.all` with 10+ fetchers and manual concatenation of context blocks.

---

## 4. Architecture decision: Module Capability Registry

Instead of the copilot code knowing about each module, **each module declares its own copilot capabilities** and self-registers. The copilot infrastructure becomes module-agnostic.

### 4.1 Core interface

```typescript
// lib/copilot/registry/types.ts

interface CopilotModuleCapability {
  // Identity
  type: string; // e.g. 'link', 'delete_link', 'budget_entry'
  module: string; // e.g. 'links', 'budgets' — matches ClearQueue module name
  label: string; // i18n key, e.g. 'copilot.proposal_link'
  icon: string; // lucide icon name, e.g. 'Link2'

  // System prompt generation
  promptDescription: string; // one-line description for system prompt
  examplePayload: object; // canonical example shown to AI in system prompt

  // Context contribution (what data to show AI for this module)
  contextFetcher?: (
    projectId: string,
    scope: 'standard' | 'full'
  ) => Promise<string>;

  // Validation (parser)
  validate: (item: unknown) => ParsedProposal | null;

  // Approval (server-side execution)
  approve: (
    payload: unknown,
    context: ApproveContext
  ) => Promise<{ entityId?: string; error?: string }>;

  // UI card rendering hint
  cardVariant: 'create' | 'delete' | 'update' | 'graph';
}

interface ApproveContext {
  projectId: string;
  userId: string;
  supabase: SupabaseClient;
}
```

### 4.2 Registry

```typescript
// lib/copilot/registry/index.ts

import { tasksCapabilities } from './modules/tasks';
import { notesCapabilities } from './modules/notes';
import { milestonesCapabilities } from './modules/milestones';
import { linksCapabilities } from './modules/links';
import { budgetsCapabilities } from './modules/budgets';
import { todosCapabilities } from './modules/todos';
// ... future modules

export const COPILOT_REGISTRY = new Map<string, CopilotModuleCapability>(
  [
    ...tasksCapabilities,
    ...notesCapabilities,
    ...milestonesCapabilities,
    ...linksCapabilities,
    ...budgetsCapabilities,
    ...todosCapabilities,
  ].map((c) => [c.type, c])
);
```

### 4.3 Parser becomes generic

```typescript
// lib/copilot/parser.ts — after refactor

export function parseProposals(content: string): ParsedProposal[] {
  // ... extract JSON block (unchanged) ...
  for (const item of parsed) {
    const obj = item as Record<string, unknown>;
    const capability = COPILOT_REGISTRY.get(String(obj.type));
    if (!capability) continue; // unknown type — skip
    const validated = capability.validate(item);
    if (validated) result.push(validated);
  }
  return result;
}
```

The `parseProposals` function never needs to be edited again when a new module is added.

### 4.4 Approval becomes a dispatcher

```typescript
// approveProposal in actions.ts — after refactor

const capability = COPILOT_REGISTRY.get(type);
if (!capability) return { error: `Unknown proposal type: ${type}` };

const { entityId, error } = await capability.approve(payload, {
  projectId: proposalRow.project_id,
  userId: user.id,
  supabase,
});

if (error) return { error };

// mark proposal approved, revalidate paths ...
```

### 4.5 System prompt is auto-generated

```typescript
// lib/copilot/context.ts — after refactor

function buildProposalExamples(enabledModules: string[]): string {
  return [...COPILOT_REGISTRY.values()]
    .filter((c) => enabledModules.includes(c.module))
    .map((c) => JSON.stringify(c.examplePayload, null, 2))
    .join(',\n');
}

async function buildModuleContextBlocks(
  projectId: string,
  enabledModules: string[],
  scope: 'standard' | 'full'
): Promise<string> {
  const fetchers = [...COPILOT_REGISTRY.values()]
    .filter((c) => enabledModules.includes(c.module) && c.contextFetcher)
    .map((c) => c.contextFetcher!(projectId, scope));

  const blocks = await Promise.all(fetchers);
  return blocks.filter(Boolean).join('\n\n');
}
```

### 4.6 UI card rendering

`CopilotProposalCard` renders based on `cardVariant` + a per-module detail component. The main card shell (approve/reject buttons, status, header) is shared. Module-specific detail rendering is looked up from a UI registry:

```typescript
// components/context/copilot/card-renderers/index.ts
const CARD_RENDERERS: Record<string, React.FC<{ payload: unknown }>> = {
  link: LinkProposalDetails,
  budget_entry: BudgetProposalDetails,
  // ...
};
```

---

## 5. What adding a new module looks like AFTER the refactor

To give Copilot control over **link vault**:

1. Create `lib/copilot/registry/modules/links.ts`:
   - Define `LinkProposalPayload`, `DeleteLinkPayload`, `UpdateLinkPayload`
   - Write `validateLinkShape`, `validateDeleteLinkShape`, etc.
   - Write `approveLinkProposal`, `approveDeleteLinkProposal`
   - Write `fetchLinksContext(projectId, scope)` → returns markdown block for system prompt
   - Export `linksCapabilities: CopilotModuleCapability[]`

2. Add one line to `lib/copilot/registry/index.ts`:

   ```typescript
   import { linksCapabilities } from './modules/links';
   // add to registry spread
   ```

3. Add i18n keys to `locales/en.json` and `locales/es.json`

4. Create `components/context/copilot/card-renderers/LinkProposalDetails.tsx`

5. Register in `components/context/copilot/card-renderers/index.ts`

**No changes to `parser.ts`, `context.ts` system prompt core, `approveProposal` dispatch, or `CopilotProposalCard` shell.**

---

## 6. Modules targeted for Copilot integration

| Module                 | Actions                                                          | Priority | Notes                            |
| ---------------------- | ---------------------------------------------------------------- | -------- | -------------------------------- |
| **Links (link vault)** | create link, create category, delete link, update link title/url | 1        | Good test for category reference |
| **Todos**              | create item, toggle done, delete item                            | 2        | Tests non-CRUD action (toggle)   |
| **Budgets**            | create entry, update amount/description, delete entry            | 3        | Numeric fields, currency         |
| **Billings**           | create billing record                                            | 4        | Simpler than budgets             |
| **Ideas**              | create single idea, create connection between existing ideas     | 5        | Complements mind_map             |
| **Owner**              | update project owner / client info                               | 6        | Low-frequency but useful         |
| **Board (tasks)**      | Already done — create, update, delete, move status               | —        | Fully implemented                |
| **Notes**              | Already done — create, update, delete                            | —        | Fully implemented                |
| **Milestones**         | Already done — create, update, delete                            | —        | Fully implemented                |

---

## 7. Context strategy for new modules

The `<<REQUEST_CONTEXT>>` mechanism generalizes to any module:

```
<<REQUEST_CONTEXT>>{"module":"links","full":true}<</REQUEST_CONTEXT>>
```

- **Standard mode:** Each module's `contextFetcher` returns a summary (count + recent 5–10 items with no IDs)
- **Full mode:** Full list with IDs for targeted modules, so the AI can propose updates/deletes

The client already supports the retry-with-full-context flow. Extending it to module-specific context requests is a parser + API change, not a UI change.

---

## 8. What does NOT change

- The `<<PROPOSALS>>` / `<</PROPOSALS>>` delimiter protocol (ADR-006) — unchanged
- The `approve_copilot_proposal_atomic` RPC — kept for task/note/milestone create types; new modules may use server action dispatch (not every approval needs DB-level atomicity)
- The streaming architecture (Route Handler, Anthropic SDK) — unchanged
- Rate limiting — unchanged
- Bulk approve/reject — works automatically for new types (type-agnostic by design)
- DB schema for `copilot_proposals` — the `payload` column is JSONB, so new payload shapes need no migration

---

## 9. Migration path (no big-bang rewrite)

The refactor happens in two phases:

**Phase A — Registry infrastructure (no behavior change):**
Move existing types (task, note, milestone, delete*\*, update*\*, mind_map) into `lib/copilot/registry/modules/`. Wire up the generic parser, dispatcher, and context builder. All existing tests pass. No user-visible change.

**Phase B — New modules (one at a time):**
Add links, then todos, then budgets, etc. Each is isolated to its registry file + card renderer. Fully testable in isolation. Can be shipped incrementally.

---

## 10. Open questions

- **`approve` functions in registry modules must be server-side** — they call Supabase. They should be imported from `app/actions/` and wrapped in the capability object. The registry file itself cannot have `'use server'` at the top (it's a lib file), so the approve function must be an already-exported server action.
- **Per-module context in REQUEST_CONTEXT** — extend the existing `parseContextRequest` or add a new protocol. Decision deferred to implementation plan.
- **Module enablement check** — the Copilot should only include context and proposals for modules that are enabled for the project. The module registry (`lib/modules/registry.ts`) already tracks enabled/disabled state per project. The copilot context builder should filter `contextFetcher` calls and proposal examples by enabled modules.
