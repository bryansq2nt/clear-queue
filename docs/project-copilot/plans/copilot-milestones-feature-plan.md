# Project Copilot: Milestones Feature Plan

**Created:** 2026-03-06  
**Status:** Planning  
**Goal:** Allow the AI Copilot to create custom milestones from chat and assign tasks to milestones (new or existing), so users can build and execute project plans in real life.

---

## 1. Objective

### What we're building

- **Create milestones from chat:** The Copilot can propose new milestones (e.g. "Phase 1: Discovery", "Sprint 1 – MVP"). The user reviews and approves; the milestone is created in the project.
- **Assign tasks to milestones:** When proposing tasks, the Copilot can attach them to an existing milestone or to a milestone created in the same conversation. Approved tasks are created with `milestone_id` set.

### User value

Users can say things like:

- "Create a plan for this project with three phases: Discovery, Design, Build."
- "Add a milestone 'Sprint 1 – MVP' and add these tasks under it: …"
- "Put the 'User research' task under the 'Discovery' milestone."

The Copilot becomes a planning partner: it suggests milestones and tasks, and the user approves; the result is a real timeline and board they can execute on.

### Out of scope for this plan

- Reordering milestones from chat
- Completing/reopening milestones from chat
- Deleting milestones from chat  
  (These can be added later if needed.)

---

## 2. Current state (brief)

- **Copilot:** Chat → AI responds with optional `<<PROPOSALS>>` JSON block. Proposals are `task` or `note`. User approves/rejects; approve creates the entity via `approve_copilot_proposal_atomic`.
- **Milestones:** Table `milestones` exists; `tasks.milestone_id` exists. CRUD and UI (Hitos tab) are implemented. `create_task_atomic` accepts `in_milestone_id`.
- **Gap:** No proposal type `milestone`; task payload has no `milestone_id` / `milestone_title`; AI context does not include current milestones; RPC and UI don’t handle milestone proposals.

---

## 3. Architecture overview

| Layer           | Change summary                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DB**          | Allow `type = 'milestone'` in `copilot_proposals`.                                                                                                                                          |
| **Schema (TS)** | Add `MilestoneProposalPayload`; extend `TaskProposalPayload` with optional `milestone_id` or `milestone_title`.                                                                             |
| **Parser**      | Parse `type: 'milestone'` and optional `milestone_id` / `milestone_title` on tasks.                                                                                                         |
| **Context**     | Include project milestones (id + title) in system prompt so the AI can reference them.                                                                                                      |
| **Prompt**      | Document milestone and task-with-milestone proposal format; instruct AI when to propose milestones and how to reference them.                                                               |
| **RPC**         | `approve_copilot_proposal_atomic`: add branch for `milestone` (insert milestone); for `task`, resolve `milestone_id` from payload or by `milestone_title` and pass to `create_task_atomic`. |
| **Actions**     | `approveProposal` return type includes `'milestone'`; revalidate milestones path; optionally invalidate milestones cache.                                                                   |
| **UI**          | `CopilotProposalCard` supports `milestone` (title, description, approve → create, link to Hitos).                                                                                           |

---

## 4. Detailed implementation plan

### Phase 1 — Schema and DB

**4.1.1 Migration: allow `milestone` in `copilot_proposals.type`**

- File: `supabase/migrations/YYYYMMDDHHMMSS_copilot_proposals_milestone_type.sql`
- Change: `ALTER TABLE copilot_proposals DROP CONSTRAINT ... ; ADD CONSTRAINT ... CHECK (type IN ('task', 'note', 'milestone'));` (exact constraint name from `information_schema` or recreate CHECK).
- No new tables; only extend the existing enum-like CHECK.

**4.1.2 TypeScript schema** (`lib/copilot/schema.ts`)

- Add:

  ```ts
  export type ProposalType = 'task' | 'note' | 'milestone';

  export interface MilestoneProposalPayload {
    type: 'milestone';
    title: string;
    description?: string | null;
  }
  ```

- Extend `TaskProposalPayload`:

  ```ts
  // Optional: assign task to a milestone (by id or by title)
  milestone_id?: string | null;   // UUID of existing milestone
  milestone_title?: string | null; // Exact title to resolve in this project
  ```

- Update `CopilotProposal.payload` union to include `MilestoneProposalPayload`.

**4.1.3 Parser** (`lib/copilot/parser.ts`)

- Add `validateMilestoneShape(item)`: require `title` (non-empty string); optional `description` (string).
- In `parseProposals`, handle `obj.type === 'milestone'` and push validated milestone proposals.
- In `validateTaskShape`, read optional `milestone_id` (UUID string) and `milestone_title` (string); include in returned payload (no validation of existence here; RPC will resolve).

**4.1.4 Validation** (optional but recommended: `lib/validation/copilot.ts` or inside parser)

- Milestone: title length cap (e.g. 200 chars); description cap (e.g. 2000).
- Task: if `milestone_id` present, must be UUID; if `milestone_title` present, trim and allow non-empty.

---

### Phase 2 — AI context and prompt

**4.2.1 Project context** (`lib/copilot/context.ts`)

- In `buildProjectContext`, fetch project milestones (e.g. `listMilestones(projectId)` or `getMilestonesWithProgress` and take id + title).
- Add a section to the system prompt, e.g.:

  ```text
  ## Project milestones (id and title)
  - <id>: "<title>"
  - ...
  (or "No milestones yet.")
  ```

- Instruct: "You may propose new milestones. When proposing tasks, you may set milestone_id to an existing milestone id, or milestone_title to the exact title of an existing or newly proposed milestone (the user must approve the milestone before or with the task)."

**4.2.2 System prompt / output format** (`lib/copilot/context.ts` and/or `docs/project-copilot/prompts/`)

- Extend the `<<PROPOSALS>>` example to include:
  - A milestone example: `{ "type": "milestone", "title": "Phase 1: Discovery", "description": "Optional." }`
  - A task with milestone: `"milestone_id": "<uuid>"` or `"milestone_title": "Phase 1: Discovery"`
- Rules:
  - Milestone: `title` required; `description` optional.
  - Task: optional `milestone_id` (UUID) or `milestone_title` (exact string). Prefer `milestone_title` when the milestone is proposed in the same turn so the backend can resolve after the user approves the milestone.
  - Order: recommend listing milestone proposals before task proposals that reference them (for clarity; backend will resolve by title at approve time if needed).

---

### Phase 3 — Backend: approve RPC and actions

**4.3.1 `approve_copilot_proposal_atomic`** (new migration)

- Add branch for `v_type = 'milestone'`:
  - Read `title`, `description` from payload; validate title non-empty and length.
  - Get next `sort_order` for the project (e.g. `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM milestones WHERE project_id = rec.project_id`).
  - `INSERT INTO milestones (project_id, title, description, sort_order) VALUES (...)`.
  - Set `v_entity_id := v_milestone_id` (and `v_type := 'milestone'` for return).
- Extend task branch:
  - Read optional `rec.payload->>'milestone_id'` (UUID). If null/empty, read `rec.payload->>'milestone_title'`. If present, resolve: `SELECT id FROM milestones WHERE project_id = rec.project_id AND TRIM(title) = TRIM(v_milestone_title) LIMIT 1`. Use resolved or provided UUID as `in_milestone_id` for `create_task_atomic`.
  - Call `create_task_atomic(..., in_milestone_id)` (8-arg version) with the resolved or provided milestone id (or NULL).
- Return object: include `type` as `'task' | 'note' | 'milestone'` so the client can revalidate and link correctly.

**4.3.2 Server action `approveProposal`** (`app/context/[projectId]/copilot/actions.ts`)

- Return type: `ApproveProposalResult.data.type` extended to `'task' | 'note' | 'milestone'`.
- After success: `revalidatePath(\`/context/${projectId}/milestones\`)`.
- If using context cache, invalidate `{ type: 'milestones', projectId }` so the Hitos tab refreshes when the user navigates there.

---

### Phase 4 — UI: proposal cards and links

**4.4.1 `CopilotProposalCard`** (`components/context/copilot/CopilotProposalCard.tsx`)

- Support `proposal.type === 'milestone'` and payload as `MilestoneProposalPayload`.
- Display: icon (e.g. Flag), label "Milestone" (i18n), title, optional description snippet.
- Approve/Reject: same pattern as task/note.
- On approved: `createdLink` for milestone → `/context/${projectId}/milestones` (or deep-link to the new milestone if we add fragment/query later).
- i18n: e.g. `copilot.proposal_milestone`, `copilot.created_view_milestones`.

**4.4.2 i18n** (`locales/en.json`, `locales/es.json`)

- Add keys under `copilot.*` for milestone proposal label and "View in Milestones" (or equivalent).

---

### Phase 5 — Order of approval and resolution rules

**5.1 Resolution of `milestone_title` for tasks**

- When the user approves a **task** that has `milestone_title` and no `milestone_id`:
  - Backend looks up `milestones` by `project_id` and trimmed title (exact match or ilike, product choice).
  - If found: use that `id` as `in_milestone_id`.
  - If not found: create the task without a milestone (and optionally log or surface a warning so the user can assign later from the board).

**5.2 Order of proposals in one message**

- The AI should list milestone proposals before tasks that reference them. The user can approve in any order; if they approve a task whose `milestone_title` is not yet created, the task is created without a milestone.

---

## 5. File checklist

| Area    | File(s)                                              | Action                                                                                                         |
| ------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| DB      | New migration                                        | Add `milestone` to `copilot_proposals.type` CHECK                                                              |
| DB      | New migration                                        | Replace `approve_copilot_proposal_atomic` with milestone branch + task milestone_id/milestone_title resolution |
| Schema  | `lib/copilot/schema.ts`                              | Add `MilestoneProposalPayload`, extend `TaskProposalPayload`, extend `ProposalType`                            |
| Parser  | `lib/copilot/parser.ts`                              | Parse milestone; parse task `milestone_id` / `milestone_title`                                                 |
| Context | `lib/copilot/context.ts`                             | Fetch milestones, add milestone section to system prompt, extend <<PROPOSALS>> rules and examples              |
| Actions | `app/context/[projectId]/copilot/actions.ts`         | Extend `ApproveProposalResult`, revalidate milestones path, invalidate milestones cache                        |
| UI      | `components/context/copilot/CopilotProposalCard.tsx` | Render and approve milestone proposals; link to Hitos                                                          |
| i18n    | `locales/en.json`, `locales/es.json`                 | Copilot milestone strings                                                                                      |
| Tests   | `lib/copilot/parser.test.ts`                         | Cases for milestone and task with milestone_id / milestone_title                                               |
| Docs    | `docs/project-copilot/contracts/` or prompts         | Update contract/prompt doc with new proposal shapes                                                            |

---

## 6. Testing strategy

- **Parser:** Unit tests for valid/invalid milestone payloads and tasks with `milestone_id` / `milestone_title`.
- **RPC:** Integration test or manual: approve milestone proposal → milestone row exists; approve task with `milestone_title` → task has correct `milestone_id`.
- **E2E (Playwright):** Happy path: open Copilot, send message that triggers AI to propose one milestone and one task under it; approve milestone then task; verify milestone appears in Hitos and task appears on board with that milestone.

---

## 7. Risks and mitigations

| Risk                                           | Mitigation                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| AI sends invalid UUID or wrong milestone title | Validate in RPC; on resolution failure for task, create task without milestone and optionally return a warning. |
| Token usage increase (milestones in context)   | Keep milestone list short (e.g. id + title only, last N or all if &lt; 20).                                     |
| User approves task before milestone            | Supported: task is created without milestone; user can assign from board later.                                 |

---

## 8. Success criteria

- User can ask the Copilot to create a project plan with milestones and tasks.
- Copilot can propose one or more milestones (title, optional description).
- Copilot can propose tasks with an optional milestone (by id or by title).
- User approves milestone → milestone is created and visible in Hitos.
- User approves task with milestone → task is created with correct `milestone_id` (resolved from title if needed).
- Revalidation and cache invalidation ensure Hitos and board stay in sync after approvals.

---

## 9. References

- Milestones module: `docs/milestones/implementation-plan.md`, `app/actions/milestones.ts`, `app/context/[projectId]/milestones/`
- Copilot blueprint: `docs/project-copilot/blueprint/project-copilot-implementation-blueprint.md`
- Copilot contracts: `docs/project-copilot/contracts/project-copilot-json-contract.md`
- `create_task_atomic`: `supabase/migrations/20260306170002_create_task_atomic_milestone_id.sql`
- `approve_copilot_proposal_atomic`: `supabase/migrations/20260306140000_approve_copilot_proposal_atomic.sql`
