# Project Copilot — Issues Index

**Status:** Pre-implementation planning — no issues created yet
**Related:** `docs/project-copilot/blueprint/project-copilot-implementation-blueprint.md`

---

## Overview

This file is the issue planning index for Project Copilot. It defines the expected set of GitHub issues (or equivalent tracking items) for each phase of implementation, their dependencies, and the suggested execution order.

Issues are not created yet. This document exists to plan the issue breakdown before implementation begins, so that work can be parallelized correctly and dependencies are clear.

---

## Dependency Flow

```
Phase 0 (no dependencies)
  └── Phase 1 (depends on Phase 0 complete)
        └── Phase 2 (depends on Phase 1 complete)
              └── Phase 3 (depends on Phase 2 complete)
                    └── Phase 4 (depends on Phase 3 + milestone table migration)
```

Within each phase, some issues can be parallelized (marked below). Issues with dependencies are listed in the order they should be started.

---

## Phase 0 — Prerequisites

These issues have no upstream dependencies. They can be started immediately.

### P0-1: Install AI SDK

**Scope:** Install `@anthropic-ai/sdk` (Anthropic's official SDK) as a production dependency. Verify `npm run build` passes.

**Files changed:** `package.json`, `package-lock.json` (or equivalent lockfile)

**Acceptance criteria:**

- `import { streamText } from 'ai'` does not produce a TypeScript error
- `npm run build` passes

**Can parallel with:** P0-2, P0-3 (no code dependencies between them)

---

### P0-2: Add `'copilot'` to ModuleKey and MODULE_REGISTRY

**Scope:** Add `'copilot'` to the `ModuleKey` union in `lib/modules/registry.ts`. Add the `copilot` entry to `MODULE_REGISTRY` with `defaultEnabled: false`, `lock: false`, `order: 11`.

**Files changed:** `lib/modules/registry.ts`

**Acceptance criteria:**

- `ModuleKey` includes `'copilot'`
- The copilot tab can be enabled in the module settings drawer (even if the route 404s)
- `npm run build` passes
- `npm run lint` passes

**Can parallel with:** P0-1, P0-3, P0-4

**Note:** Ship this as a standalone PR. It unblocks tab bar and routing work for all developers immediately.

---

### P0-3: Add `copilot` cache key to ContextDataCache

**Scope:** Add `{ type: 'copilot'; projectId: string }` to the `CacheKey` union in `app/context/ContextDataCache.tsx`. Add the string key format to `cacheKeyToString`.

**Files changed:** `app/context/ContextDataCache.tsx`

**Acceptance criteria:**

- TypeScript compiles with the new cache key type
- `npm run build` passes

**Note:** Even though Copilot does not use the session cache for messages (see ADR-004), the `CacheKey` union must be consistent. Adding the type prevents TypeScript errors if `invalidateProject` iterates over all known cache keys.

**Can parallel with:** P0-1, P0-2

---

### P0-4: Write three DB migrations

**Scope:** Write three migration files:

1. `YYYYMMDDHHMMSS_copilot_sessions.sql` — table, RLS (4 policies), `updated_at` trigger, compound index on `(project_id, created_at DESC)`
2. `YYYYMMDDHHMMSS_copilot_messages.sql` — table, RLS (4 policies), index on `(session_id, created_at ASC)`, compound index on `(project_id, created_at DESC)`
3. `YYYYMMDDHHMMSS_copilot_proposals.sql` — table, RLS (4 policies), `updated_at` trigger, index on `(session_id, status)`, compound index on `(project_id, created_at DESC)`

All three tables must use the project ownership join pattern for RLS:

```sql
EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
```

**Files changed:** `supabase/migrations/` (3 new files)

**Reference:** `supabase/migrations/20260302120000_project_modules.sql` (RLS pattern), `supabase/migrations/20260224100000_document_hub.sql` (complete migration template)

**Acceptance criteria:**

- All three migrations apply cleanly via `supabase db push` (or equivalent local apply)
- RLS verified: user A cannot SELECT from user B's sessions
- CASCADE delete verified: deleting a project cascades to sessions, messages, proposals
- `updated_at` trigger fires on UPDATE for sessions and proposals

**Can parallel with:** P0-1, P0-2, P0-3

---

### P0-5: Update `lib/supabase/types.ts`

**Scope:** Add TypeScript type definitions for the three new tables: `CopilotSession`, `CopilotMessage`, `CopilotProposal`.

**Files changed:** `lib/supabase/types.ts`

**Depends on:** P0-4 (tables must exist before types can be written)

**Note:** Use `(supabase as any)` cast in server actions for these tables until `types.ts` is regenerated from Supabase schema, consistent with the pattern in `app/actions/modules.ts`.

---

### P0-6: Define TypeScript types in `lib/copilot/schema.ts`

**Scope:** Create `lib/copilot/schema.ts` with:

- `CopilotSession` type
- `CopilotMessage` type (role: `'user' | 'assistant'`)
- `CopilotProposal` type (status: `'pending' | 'approved' | 'rejected'`)
- `ProposalType` union (`'task' | 'note'`)
- `TaskProposalPayload` type (maps to `tasks.Insert` shape: title, status, priority, notes, tags, due_date)
- `NoteProposalPayload` type (maps to `notes.Insert` shape: title, content)

**Files changed:** `lib/copilot/schema.ts` (new file)

**Depends on:** P0-5

---

### P0-7: Design and validate system prompt

**Scope:** Write the system prompt draft following the spec in `docs/project-copilot/prompts/project-copilot-master-prompt.md`. Validate manually using raw API calls (not code). Test against 3+ representative project types. Iterate until all acceptance criteria in the prompt document pass.

**Files changed:** None (manual validation only)

**Output:** A validated prompt string ready to be implemented in `lib/copilot/context.ts` in Phase 1.

**Acceptance criteria:** All 9 items in the "Acceptance criteria for manual validation" section of the master prompt document pass.

**Can parallel with:** P0-1 through P0-6

---

## Phase 1 — Module Shell and Contextual Chat

All Phase 0 issues must be complete before starting Phase 1.

### P1-1: Implement `lib/copilot/context.ts`

**Scope:** `buildProjectContext(projectId)` function. Fetches project data, assembles the system prompt string from the template validated in P0-7. Enforces token budget: max 10 tasks, 5 note titles, 300-char truncation of project notes field.

**Files changed:** `lib/copilot/context.ts` (new file)

**Depends on:** P0-5, P0-6, P0-7

**Tests required:** Vitest unit tests — output under token budget, includes project name, task counts, handles zero tasks/notes gracefully.

---

### P1-2: Build streaming API route

**Scope:** `app/api/copilot/[projectId]/chat/route.ts` — POST handler. Steps: `requireAuth()`, validate `projectId` ownership, validate input (sessionId UUID, messages array max 20, user message max 2,000 chars), rate limit check (DB-counted daily + hourly), call `buildProjectContext`, call `streamText`, return SSE stream.

**Files changed:** `app/api/copilot/[projectId]/chat/route.ts` (new file)

**Depends on:** P1-1

**Reference:** `app/api/documents/[fileId]/view/route.ts` (Route Handler auth pattern)

**Acceptance criteria:**

- `curl` POST to the route with valid auth returns a streaming response
- Request without auth returns 401
- Request from a user who doesn't own the project returns 403
- User message > 2,000 chars returns 400
- User at daily message limit returns 429 with `resetAt` timestamp
- All error paths call `captureWithContext` with `module: 'copilot'`

---

### P1-3: Build server actions in `actions.ts`

**Scope:** `app/context/[projectId]/copilot/actions.ts` with:

- `getCopilotSession(projectId)` — returns active session or null
- `createCopilotSession(projectId)` — creates new session, returns it
- `getCopilotMessages(sessionId)` — returns messages ordered by `created_at ASC`
- `saveCopilotMessage(sessionId, role, content, tokenCount?)` — persists a message

**Files changed:** `app/context/[projectId]/copilot/actions.ts` (new file)

**Depends on:** P0-5, P0-6

**Note:** All actions follow standard patterns: `requireAuth()` first, explicit `.select()` columns, `revalidatePath` after mutations, return `{ data?, error? }`.

---

### P1-4: Build UI components

**Scope:**

- `components/context/copilot/CopilotChatWindow.tsx` — scrollable message list, auto-scroll to bottom
- `components/context/copilot/CopilotMessageBubble.tsx` — renders user or assistant message
- `components/context/copilot/CopilotInputBar.tsx` — textarea + send button, disabled during streaming
- `components/skeletons/SkeletonCopilot.tsx` — shimmer skeleton

**Files changed:** 4 new component files

**Depends on:** P0-6 (for TypeScript types)

**Can start in parallel with:** P1-2, P1-3

---

### P1-5: Build tab page and wire everything together

**Scope:**

- `app/context/[projectId]/copilot/page.tsx` — `requireAuth()` + `<ContextCopilotFromCache>`
- `app/context/[projectId]/copilot/ContextCopilotFromCache.tsx` — loads session + messages from DB; explicitly does NOT use session cache (with comment explaining why per ADR-004); shows `SkeletonCopilot` on load
- `app/context/[projectId]/copilot/ContextCopilotClient.tsx` — owns streaming state, calls API route, renders messages

**Files changed:** 3 new files

**Depends on:** P1-2, P1-3, P1-4

---

### P1-6: Add i18n strings

**Scope:** Add all `copilot.*` keys to `locales/en.json` and `locales/es.json`:

- `copilot.title` — "Project Copilot" / "Copiloto del proyecto"
- `copilot.input_placeholder` — "Describe your project goals..." / "Describe los objetivos de tu proyecto..."
- `copilot.send` — "Send" / "Enviar"
- `copilot.thinking` — "Thinking..." / "Pensando..."
- `copilot.empty_state` — "Start by describing your project..." / "Empieza describiendo tu proyecto..."
- `copilot.rate_limit_daily` — "Daily message limit reached. Resets at {time}." / ...
- `copilot.rate_limit_hourly` — "Hourly limit reached. Try again in {time}." / ...
- `copilot.error_message` — "Something went wrong. Please try again." / ...

**Files changed:** `locales/en.json`, `locales/es.json`

**Can parallel with:** P1-4, P1-5

---

### P1-7: Playwright happy-path test for Phase 1

**Scope:** Test that covers: enable Copilot module → open tab → send a message → verify streaming response appears → navigate to notes tab and back → verify message history persists.

**Files changed:** `tests/copilot-phase1.spec.ts` (or equivalent)

**Depends on:** P1-5, P1-6

---

## Phase 2 — Structured Planning Drafts

All Phase 1 issues must be complete before starting Phase 2.

### P2-1: Build `lib/copilot/parser.ts`

**Scope:** `parseProposals(content: string): CopilotProposal[]`. Extracts JSON from between `<<PROPOSALS>>` and `<</PROPOSALS>>` delimiters. Attempts `JSON.parse`. Validates that result is an array. Filters out unknown types. Returns `[]` on any failure. Calls `captureWithContext` on parse errors.

**Files changed:** `lib/copilot/parser.ts` (new file)

**Tests required (Vitest):**

- Valid single proposal → returns 1-item array
- Valid mixed proposals (task + note) → returns both
- Malformed JSON → returns `[]`
- Missing opening delimiter → returns `[]`
- Missing closing delimiter → returns `[]`
- Unknown proposal type `"milestone"` → filtered out, valid types still returned
- Empty array block → returns `[]`
- No proposals block at all → returns `[]`

---

### P2-2: Build `lib/validation/copilot.ts` (client-side validators)

**Scope:** Client-side proposal shape validators:

- `validateTaskProposal(proposal)` — checks required fields, status enum, priority range
- `validateNoteProposal(proposal)` — checks required fields, non-empty content

**Files changed:** `lib/validation/copilot.ts` (new file)

**Reference:** `lib/validation/profile.ts` (validation style — no Zod, use trim + allowlists)

---

### P2-3: Update system prompt for structured output

**Scope:** Update the system prompt in `lib/copilot/context.ts` to include the `<<PROPOSALS>>` block format instructions, JSON schema for task and note proposals, and explicit rules about when to emit proposals.

**Files changed:** `lib/copilot/context.ts`

**Reference:** `docs/project-copilot/contracts/project-copilot-json-contract.md`

---

### P2-4: Add proposal server actions

**Scope:** Add to `app/context/[projectId]/copilot/actions.ts`:

- `saveCopilotProposals(sessionId, messageId, proposals[])` — persists proposals with status `'pending'`
- `rejectProposal(proposalId)` — sets status to `'rejected'`, `reviewed_at` to now

---

### P2-5: Build `CopilotProposalCard.tsx`

**Scope:** `components/context/copilot/CopilotProposalCard.tsx` — displays a proposal with pending and rejected states. Approve button visible but disabled (Phase 3 activates it). Reject button active.

**Depends on:** P2-2 (for type definitions used in props)

---

### P2-6: Wire proposals into `ContextCopilotClient.tsx`

**Scope:** After stream completes, call `parseProposals` on the assistant message content. If proposals found, call `saveCopilotProposals`. Render `CopilotProposalCard` components below the assistant message.

**Depends on:** P2-1, P2-3, P2-4, P2-5

---

### P2-7: Add proposal i18n strings

**Scope:** Add proposal-related keys to both locale files:

- `copilot.proposal_task`, `copilot.proposal_note`
- `copilot.approve`, `copilot.reject`
- `copilot.proposal_rejected`

---

### P2-8: Playwright test for Phase 2

**Scope:** Send a planning prompt that triggers proposals → verify proposal cards appear → reject one → verify card changes state.

---

## Phase 3 — Validated Write Actions

All Phase 2 issues must be complete before starting Phase 3.

### P3-1: Add server-side validators to `lib/validation/copilot.ts`

**Scope:** Strict server-side validators (distinct from the client-side validators in P2-2). These run inside `approveProposal` and must be stricter: trim all strings, enforce required fields, reject empty titles after trim, enforce valid status enum values, check character limits.

---

### P3-2: Write `approve_copilot_proposal_atomic` Postgres RPC

**Scope:** Migration file containing the RPC. Steps inside the transaction:

1. Lock and load the proposal row; verify `status = 'pending'`
2. Validate the payload (title non-empty, type-specific field checks)
3. If `type = 'task'`: INSERT into `tasks` with payload fields + project_id from proposal row
4. If `type = 'note'`: INSERT into `notes` with payload fields + project_id + owner_id from proposal row
5. UPDATE `copilot_proposals` SET status = 'approved', created_entity_id = <new entity id>, reviewed_at = now()
6. Return the created entity id and type

**Files changed:** `supabase/migrations/YYYYMMDDHHMMSS_approve_copilot_proposal_atomic.sql`

**Reference:** `supabase/migrations/20260216010000_atomic_todo_and_task_creation.sql` (RPC pattern)

---

### P3-3: Implement `approveProposal` server action

**Scope:** `approveProposal(proposalId)` in `actions.ts`. Steps: `requireAuth()`, validate ownership, call `approve_copilot_proposal_atomic` RPC, on success call `revalidatePath` for board and notes, call `invalidateProject(projectId)` to flush session cache for affected tabs, return `{ ok: true, createdEntityId, entityType }`.

**Depends on:** P3-1, P3-2

---

### P3-4: Activate approve button in `CopilotProposalCard.tsx`

**Scope:** Wire the approve button to `approveProposal`. Show loading state during the action. On success, show "Created" state with navigation link to the created entity (board for tasks, notes for notes).

**Depends on:** P3-3

---

### P3-5: Integration tests for Phase 3

**Scope:**

- Propose task → approve → verify task in `tasks` table → verify board tab reflects new task
- Propose note → approve → verify note in `notes` table
- Approve an already-approved proposal → verify `{ ok: false, error: 'already_approved' }`
- Approve with invalid payload → verify validation error, no entity created

---

## Phase 4 — Session Management (deferred)

Phase 4 is not scoped in detail. The following issues are expected but will be defined at Phase 3 exit.

### Expected issues (tentative)

- P4-1: Session selector UI (multiple sessions per project)
- P4-2: Session archival action
- P4-3: "Start fresh" button (creates new session, archives current)
- P4-4: Auto-generate session title from first message
- P4-5: Milestone table migration (prerequisite for milestone proposals)
- P4-6: Add milestone proposal type to parser and validator (depends on P4-5)

---

## Cross-Phase Issues

### CX-1: Update AGENTS.md with Copilot patterns

**Scope:** Document the two key exceptions to standard patterns:

1. Copilot uses a Route Handler for streaming (not a Server Action)
2. `ContextCopilotFromCache` does not use the session cache (with rationale)

Add to the "Known exceptions" or "Pattern deep-dives" section so future engineers understand the intentional deviation.

**When to do:** After Phase 1 is complete and the patterns are stable.

---

### CX-2: Add Copilot to the docs index

**Scope:** Update `docs/project-copilot/` README or any top-level documentation index to reflect the completed implementation. Update status markers from "Pre-implementation" to "V1 complete" in relevant docs.

**When to do:** After Phase 3 ships.

---

## Execution Order Summary

The following is the recommended sequential start order. Items on the same line can be started in parallel.

```
Phase 0:
  P0-1, P0-2, P0-3, P0-4, P0-7  ← all parallel
  P0-5  ← after P0-4
  P0-6  ← after P0-5

Phase 1:
  P1-1  ← after all Phase 0
  P1-2  ← after P1-1
  P1-3, P1-4  ← parallel, after Phase 0
  P1-5  ← after P1-2, P1-3, P1-4
  P1-6  ← parallel with P1-4, P1-5
  P1-7  ← after P1-5, P1-6

Phase 2:
  P2-1, P2-2, P2-3  ← parallel, after Phase 1
  P2-4, P2-5  ← parallel, after P2-2
  P2-6  ← after P2-1, P2-3, P2-4, P2-5
  P2-7  ← parallel with P2-6
  P2-8  ← after P2-6, P2-7

Phase 3:
  P3-1, P3-2  ← parallel, after Phase 2
  P3-3  ← after P3-1, P3-2
  P3-4  ← after P3-3
  P3-5  ← after P3-4
```

---

## Issue Count Summary

| Phase       | Issue count | Parallelizable          |
| ----------- | ----------- | ----------------------- |
| Phase 0     | 7           | 5 can start in parallel |
| Phase 1     | 7           | 3 can run in parallel   |
| Phase 2     | 8           | 3 can start in parallel |
| Phase 3     | 5           | 2 can start in parallel |
| Cross-phase | 2           | As available            |
| **Total**   | **29**      |                         |
