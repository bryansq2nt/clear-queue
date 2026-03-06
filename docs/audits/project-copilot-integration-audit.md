# Project Copilot Integration Audit

**Date:** 2026-03-06
**Auditor:** Claude Code (claude-sonnet-4-6)
**Scope:** Architecture and product integration audit for the proposed Project Copilot module. No implementation — findings and recommendations only.

---

## A. Executive Summary

**Overall viability:** High. The product architecture is well-structured and the modular system is mature enough to host Project Copilot as a first-class module. However, there is **zero existing AI infrastructure** — no packages, no API routes, no data models, no streaming patterns. The entire AI layer must be built from scratch.

**Readiness score: 6 / 10**

The 4-point deduction comes entirely from missing infrastructure, not from architectural immaturity. The existing codebase is disciplined and clean. Once AI foundations are laid, integration will be smooth.

**Key blockers (must be resolved before Phase 1):**

1. No AI SDK installed (`@anthropic-ai/sdk` or `ai` Vercel SDK — neither exists in `package.json`)
2. No streaming API route pattern (current API routes are all request/response, no SSE or chunked streaming)
3. No conversation or message persistence tables
4. No planning draft or action proposal storage model
5. `ModuleKey` type in `lib/modules/registry.ts` does not include `'copilot'` — the tab cannot exist yet

**Key enablers (already working):**

1. Module system is fully operational — `lib/modules/registry.ts` + `project_modules` table + `getProjectModules`/`setProjectModuleEnabled` in `app/actions/modules.ts`
2. The `*FromCache → *Client` context tab pattern is fully proven and just needs a new instance
3. `getProjectResources` in `app/actions/projects.ts:515` already aggregates tasks, notes, budgets, boards, and todo lists for a project — this is the AI context seed
4. `createTask` (via `create_task_atomic` RPC) and `createNote` are battle-tested write paths the AI can eventually call
5. `captureWithContext` from `lib/sentry.ts` is ready for AI error observability
6. `requireAuth()` enforces auth at the server boundary — every AI call will be auth-gated automatically

---

## B. What Already Exists That Helps

### Module system (`lib/modules/registry.ts`, `app/actions/modules.ts`, migration `20260302120000_project_modules.sql`)

The registry pattern is the cleanest enabler in the whole codebase. Adding Copilot requires:

- One new `ModuleKey` value: `'copilot'`
- One entry in `MODULE_REGISTRY`
- The tab bar, settings drawer toggle, and enabled-key lookup all pick it up automatically

No structural changes to the module infrastructure are needed. It was designed to be extended.

### Context tab infrastructure

The `*FromCache → *Client` pattern (`app/context/[projectId]/calendar/` is the most recent example) means the module page scaffold is fully understood and copy-pasteable. The cache key type in `ContextDataCache.tsx` needs one new entry: `{ type: 'copilot'; projectId: string }`.

### Project context aggregation

`getProjectResources` (`app/actions/projects.ts:515`) already fetches notes, budgets, boards, and todo lists for a project in a single parallel call. This function is the natural starting point for building an AI system prompt that includes current project state. It returns typed `ProjectResources` — notes, budgets, boards, todoLists — which can be serialized into an AI context payload.

### Write actions (existing, safe, audited)

The write pipeline that AI would eventually need to call already exists and is well-tested:

| What AI wants to create | Existing server action                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| Task                    | `createTask` in `app/actions/tasks.ts` (delegates to `create_task_atomic` RPC) |
| Note                    | `createNote` in `app/actions/notes.ts`                                         |
| Calendar event          | `createCalendarEvent` in `app/actions/calendar.ts`                             |

These are the exact functions a "create from AI proposal" action would call after user approval.

### Security boundary

`requireAuth()` at the top of every server action means any AI orchestration server action will be auth-gated. RLS on all tables means even if an AI action had a bug that passed the wrong project ID, the DB would reject it. The defense-in-depth security model is already in place.

### Observability

`captureWithContext` from `lib/sentry.ts` accepts `module`, `action`, `userIntent`, `expected` — precisely the fields needed to trace AI pipeline errors. There is no new observability infrastructure needed.

---

## C. What Is Missing

### Frontend

| Missing                                                       | Why needed                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Chat UI component (`CopilotChatWindow`)                       | No chat interface exists anywhere in the codebase                                            |
| Streaming text rendering                                      | No component currently handles chunked/streamed text responses                               |
| `SkeletonCopilot` shimmer component                           | Required by AGENTS.md for all loading states                                                 |
| Action proposal card UI                                       | UI for presenting structured AI outputs (tasks, milestones) before user approval             |
| Approval/reject flow UX                                       | User must be able to accept, edit, or discard each AI-proposed entity before it writes to DB |
| Copilot tab page (`app/context/[projectId]/copilot/page.tsx`) | Route does not exist                                                                         |
| `ContextCopilotFromCache.tsx`                                 | Cache wrapper does not exist                                                                 |
| `ContextCopilotClient.tsx`                                    | Client component does not exist                                                              |
| i18n keys for Copilot                                         | `locales/en.json` and `locales/es.json` have no `copilot.*` section                          |

### Backend

| Missing                                                           | Why needed                                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AI SDK package (`@anthropic-ai/sdk` or `ai`)                      | Zero AI packages in `package.json` — nothing can call the model                                                       |
| Streaming API route (`app/api/copilot/[projectId]/chat/route.ts`) | Server Actions in Next.js 14 are not designed for streaming responses; SSE or chunked streaming needs a Route Handler |
| `app/actions/copilot.ts` server actions                           | Read actions (fetch history, fetch context), write actions (save message, approve proposal)                           |
| AI context builder function (`lib/copilot/context.ts`)            | Logic to assemble a structured prompt from project data (name, tasks, notes, resources)                               |
| Structured output parser (`lib/copilot/parser.ts`)                | Parse model JSON into typed proposal objects before they reach the write layer                                        |
| Proposal validation (`lib/validation/copilot.ts`)                 | Validate AI-generated task/note/milestone proposals before write                                                      |
| AI orchestration layer                                            | Conversation history, system prompt management, tool/function definitions                                             |

### Database

| Missing                                 | Why needed                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `copilot_sessions` table                | Persistent planning session tied to `project_id` and `user_id`                                                                 |
| `copilot_messages` table                | Individual turns (role: `user` / `assistant`), including raw content and `created_at`                                          |
| `copilot_proposals` table               | Structured proposed actions (type: `task`, `note`, `milestone`; status: `pending`, `approved`, `rejected`; payload: JSONB)     |
| Milestones table (optional for Phase 3) | AI can propose milestones, but there is nowhere to store them — confirmed absent in `lib/supabase/types.ts` and all migrations |
| RLS on all new tables                   | Required — must scope by `project_id → projects.owner_id = auth.uid()` consistent with existing patterns                       |

### AI Orchestration

| Missing                         | Why needed                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| System prompt template          | The model needs structured instructions defining its role, output format, and constraints |
| Conversation history management | Token budget management for long sessions; history truncation strategy                    |
| Structured output schema        | JSON schema for proposals so the model returns parseable, typed outputs                   |
| Tool/function definitions       | If using Anthropic tool use or OpenAI function calling for write actions                  |
| Token cost tracking             | No metering infrastructure exists                                                         |

### Security

| Gap                                     | Risk                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| No rate limiting on AI endpoints        | A single user could run up unbounded API costs — this is a real P1 risk                   |
| No input sanitization beyond basic trim | AI input should be validated for length limits before being sent to the model             |
| No AI output sanitization               | Proposals returned from the model must be validated against schema before touching the DB |
| No per-project AI usage cap             | Without this, a project can exhaust the API budget                                        |

### UX

| Gap                                        | Risk                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| No conversation history scroll             | Sessions could be long; mobile will need a specific scroll container pattern |
| No "session reset" affordance              | Users need to start fresh without destroying history                         |
| No feedback mechanism for bad AI responses | No thumbs up/down or regeneration UX exists                                  |

---

## D. Recommended Target Architecture

Project Copilot should be a **self-contained context tab module** with a dedicated streaming API route and a thin server-action layer for persistence.

```
app/
  api/
    copilot/
      [projectId]/
        chat/
          route.ts          <- POST: receives messages[], returns SSE stream
  context/
    [projectId]/
      copilot/
        page.tsx            <- requireAuth + <ContextCopilotFromCache>
        ContextCopilotFromCache.tsx
        ContextCopilotClient.tsx
        actions.ts          <- getCopilotSession, saveCopilotMessage, approveProposal, rejectProposal

lib/
  copilot/
    context.ts              <- buildProjectContext(projectId): assembles system prompt from project data
    parser.ts               <- parseProposals(rawText): extracts structured proposals from AI response
    schema.ts               <- TypeScript types: CopilotMessage, CopilotProposal, ProposalType

components/
  context/
    copilot/
      CopilotChatWindow.tsx
      CopilotMessageBubble.tsx
      CopilotProposalCard.tsx
      CopilotInputBar.tsx
  skeletons/
    SkeletonCopilot.tsx

supabase/migrations/
  YYYYMMDDHHMMSS_copilot_sessions.sql
  YYYYMMDDHHMMSS_copilot_messages.sql
  YYYYMMDDHHMMSS_copilot_proposals.sql
```

### Why a streaming API Route, not a Server Action?

Next.js 14 Server Actions use a POST-based RPC protocol. They can return data, but they were not designed for streaming tokens back to the client. The canonical pattern for streaming AI responses in Next.js App Router is a Route Handler (`route.ts`) that returns a `ReadableStream` or uses the Vercel AI SDK's `streamText` helper. This is not a stylistic preference — it is a technical requirement for token streaming.

The existing Server Actions in `app/actions/` are still used for non-streaming operations: saving messages to DB, fetching session history, approving/rejecting proposals. Only the model call itself goes through the API route.

### Recommended AI SDK

Vercel AI SDK (`ai` + `@anthropic-ai/sdk`). The `ai` package's `streamText` function handles streaming, token counting, tool definitions, and structured output in a way that composes cleanly with Next.js App Router. It also makes swapping models trivial.

---

## E. Suggested Data Model Changes

### Table: `copilot_sessions`

```sql
CREATE TABLE public.copilot_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'active', -- active | archived
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

One session per planning conversation. A project can have multiple sessions over time.

### Table: `copilot_messages`

```sql
CREATE TABLE public.copilot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL,
  owner_id    UUID NOT NULL,
  role        TEXT NOT NULL,       -- 'user' | 'assistant'
  content     TEXT NOT NULL,
  token_count INTEGER,             -- optional, for cost tracking
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

### Table: `copilot_proposals`

```sql
CREATE TABLE public.copilot_proposals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  message_id         UUID REFERENCES public.copilot_messages(id) ON DELETE SET NULL,
  project_id         UUID NOT NULL,
  owner_id           UUID NOT NULL,
  type               TEXT NOT NULL,                    -- 'task' | 'note' | 'milestone' | 'stage'
  payload            JSONB NOT NULL,                   -- raw proposed data matching target entity shape
  status             TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_entity_id  UUID,                             -- filled when approved + created
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

`payload` is JSONB intentionally — it stores the AI's proposed structure before validation. Validation happens server-side when the user approves. `created_entity_id` links back to the actual row created in `tasks` or `notes` after approval.

**All three tables need:**

- RLS using `EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid())`
- `updated_at` trigger using `update_updated_at_column()`
- Compound index on `(project_id, created_at DESC)` for the common query pattern

---

## F. Suggested Service/Action Boundaries

### API Route: `app/api/copilot/[projectId]/chat/route.ts`

```
POST /api/copilot/[projectId]/chat

Input:  { sessionId: string, messages: CopilotMessage[] }
Output: SSE stream of tokens

Responsibilities:
  1. requireAuth() / getUser() — first line
  2. Validate projectId ownership (getProjectById scoped to user)
  3. Call buildProjectContext(projectId) -> system prompt
  4. Call AI SDK streamText with context + messages
  5. Pipe response stream to client
  6. On completion: save final assistant message to DB
```

### Server Actions: `app/context/[projectId]/copilot/actions.ts`

```
getCopilotSessions(projectId)                            -> SerializableCopilotSession[]
getCopilotMessages(sessionId)                            -> CopilotMessage[]
createCopilotSession(projectId)                          -> CopilotSession
saveCopilotMessage(sessionId, role, content, tokenCount) -> CopilotMessage
saveCopilotProposals(sessionId, messageId, proposals[])  -> CopilotProposal[]
approveProposal(proposalId)                              -> { ok, createdEntityId }
rejectProposal(proposalId)                               -> { ok }
```

`approveProposal` is the critical write path. It:

1. Loads the proposal row and validates payload against the type-specific schema
2. Calls the appropriate existing action (`createTask`, `createNote`, etc.)
3. Updates `copilot_proposals.status = 'approved'` and stores `created_entity_id`
4. Calls `revalidatePath` for the affected tab (board, notes, etc.)
5. Returns the created entity so the UI can update without a refetch

Note: this is a multi-step write and must follow the `_atomic` RPC policy — implement as `approve_copilot_proposal_atomic` in Postgres or handle rollback carefully in the server action.

### Domain: `lib/copilot/context.ts`

```
buildProjectContext(projectId: string): Promise<string>
  - Calls getProjectById, getTasksByProjectId, getNotes
  - Assembles a structured system prompt with project name, category,
    task counts by status, recent note titles, etc.
  - Returns a string under a defined token budget
  - Caps included data: max N tasks (most recent), max N note titles
```

### Domain: `lib/copilot/parser.ts`

```
parseProposals(content: string): CopilotProposal[]
  - Parses structured JSON blocks from AI response
  - Returns validated typed proposals
  - Returns empty array on parse failure (never throws)
```

---

## G. Suggested Implementation Phases

### Phase 1 — Contextual chat, read-only, no writes

**Scope:** User can open the Copilot tab, start a conversation, get AI responses aware of the project context. No proposals, no DB writes other than message history.

**Deliverables:**

- `'copilot'` added to `ModuleKey` in `lib/modules/registry.ts`
- `copilot_sessions` and `copilot_messages` migrations
- `app/api/copilot/[projectId]/chat/route.ts` (streaming)
- `lib/copilot/context.ts` (project context assembler)
- `app/context/[projectId]/copilot/` (page + FromCache + Client)
- `CopilotChatWindow`, `CopilotMessageBubble`, `CopilotInputBar` components
- `SkeletonCopilot` component
- i18n keys for `copilot.*` in both locales
- Rate limiting on the API route (max N requests per user per hour via DB count)
- Vitest: `lib/copilot/context.ts` context builder
- Playwright: happy path — open Copilot tab, send a message, receive a response

**Success criteria:** The AI can answer contextual questions about the project ("how many tasks are blocked?", "what stage is this project in?") based on real data.

---

### Phase 2 — Structured planning outputs (draft proposals)

**Scope:** AI can generate structured proposals (task suggestions, stage breakdowns, notes). Proposals appear as cards in the UI that the user can review. No automatic writes — user must explicitly approve each proposal.

**Deliverables:**

- `copilot_proposals` migration
- AI prompt updated with structured output instructions (JSON blocks for proposals)
- `lib/copilot/parser.ts` (proposal extractor)
- `lib/validation/copilot.ts` (proposal payload validators per type)
- `CopilotProposalCard` component (shows proposed entity, approve/reject buttons)
- `saveCopilotProposals` server action
- `rejectProposal` server action
- Proposals persisted to DB in `pending` state after each AI turn that produces them

**Success criteria:** After "propose 5 tasks for the development phase," the user sees 5 proposal cards. Each can be individually rejected. None are written to the system yet.

---

### Phase 3 — Validated write actions (approve to create)

**Scope:** Approving a proposal runs the existing write pipeline and creates the real entity in the system. The board, notes tab, etc. reflect the new data.

**Deliverables:**

- `approveProposal` server action (validates payload -> calls `createTask`/`createNote` -> marks proposal approved -> stores `created_entity_id` -> revalidates affected paths)
- Proposal card update: shows "Created" state with a link to the created entity after approval
- Sentry instrumentation on `approveProposal` with full `captureWithContext` context
- Integration test: approve -> create -> verify entity exists in DB

**Success criteria:** User approves a proposed task, the board tab reflects the new task, the proposal card shows "Created — view on board."

---

### Phase 4 — Session management and iterative planning

**Scope:** Named planning sessions, session history, ability to start fresh or continue an old session. Richer AI behaviors: gap detection, plan regeneration, revision mode.

**Deliverables:**

- Session list/select UI in the Copilot tab
- `getCopilotSessions` and `createCopilotSession` surfaced in UI
- System prompt enriched with existing proposal history to enable "revise the plan" conversations
- AI-detected gaps ("you have tasks but no milestones defined") as gentle suggestions
- Milestone table (if not already added)

**Success criteria:** A user can pick up a planning conversation from last week, review what was proposed, and continue or revise.

---

## H. Risks and Unknowns

### Architecture risks

**Streaming in Next.js 14 Server Actions is not supported cleanly.**
Server Actions use the POST body protocol and do not support streaming SSE. A Route Handler is required. This is a technical constraint confirmed by inspecting the current API routes — all are standard response routes with no streaming precedent in the repo. A new streaming pattern must be established.

**The session cache (`ContextDataCache.tsx`) is in-memory and ephemeral.**
If the user navigates away from the Copilot tab and comes back, the cache strategy used for all other tabs doesn't work well for chat — messages accumulate and the cache grows unbounded, or you lose new messages on tab switch. Recommendation: always load from DB via server action on tab focus (no session cache for Copilot), since chat history is the source of truth.

**`getProjectResources` (`app/actions/projects.ts:515`) is not directly auth-guarded itself — it delegates to cached getters.**
The underlying cached getters (`getNotes`, `getBudgets`, `listBoards`, `getTodoLists`) all call `requireAuth()` internally, so this is safe. But verify this assumption before building the AI context layer on top of it.

### AI hallucination risks

**The model will invent tasks and milestones that sound plausible but don't correspond to reality.**
This is not a failure mode to prevent — it is a feature to manage. The proposal -> approval flow is the exact mechanism that keeps AI suggestions from entering the DB without human review. Never auto-approve.

**Structured output parsing is fragile at the boundary.**
If the model is asked to return JSON proposals and produces malformed JSON, `lib/copilot/parser.ts` must handle this gracefully and return an empty proposal set without crashing. Invest in defensive parsing from the start.

### Data consistency risks

**`approveProposal` must be atomic.**
If the server action creates the task but then fails to mark the proposal as `approved`, the user sees the proposal card still in `pending` state but the task already exists. This is a multi-step write — it needs a Postgres RPC (`approve_copilot_proposal_atomic`) per the AGENTS.md atomic write policy.

**No milestone table today.**
AI will want to propose milestones as core to the product vision. There is no `milestones` table anywhere in the codebase — confirmed by `lib/supabase/types.ts` inspection and `docs/audits/milestone-feasibility-audit.md`. If Phase 3 includes milestone proposals, the milestone table must be built first as an independent dependency.

### Performance and cost concerns

**Unbounded token costs.**
`buildProjectContext` will include task lists, note titles, etc. A project with 200 tasks and 50 notes could easily produce a 4,000+ token system prompt. At Anthropic pricing this is manageable per call, but at scale across users, monthly costs will be significant. Build token budget awareness into `context.ts` from the start: cap at N tasks (most recent), N note titles.

**No rate limiting infrastructure exists.**
The current codebase has zero rate limiting. For a free or low-cost tier product, a single user running long AI planning sessions could exceed the monthly API budget. A DB-counted rate limit (e.g. max 50 AI messages per user per day) must be in place before production launch.

**Context tab initial load round-trip budget.**
The Copilot tab's initial load should fetch the most recent session and last N messages — 2 DB calls, within the 3 round-trip budget. Do not add project resource fetching on tab open. That should happen lazily or only at session creation time.

### Maintainability risks

**Over-engineering the proposal model early.**
There is a strong temptation to build a generic "AI action executor" framework. Resist this. Build specific support for tasks first (`type: 'task'`), confirm it works end-to-end, then add notes. Keep `lib/copilot/` small and focused in Phases 1–2.

**Prompt engineering is code.**
System prompts in `lib/copilot/context.ts` will drift. They must be treated as first-class code: version-controlled, reviewed, and tested (Vitest snapshot tests on context builder output are practical). Do not let prompts become inline string literals scattered across the codebase.

**The session cache exclusion.**
If Copilot does not use `ContextDataCache`, this must be documented clearly in the `ContextCopilotFromCache.tsx` file header and in AGENTS.md. Otherwise future developers will add caching and break the freshness guarantee of conversation history.

### UX risks

**Mobile chat layout is non-trivial.**
The current project context layout uses `fixed inset-0` with a scrollable tab area. A chat input bar pinned to the bottom that stays above the iOS/Android keyboard requires specific CSS (`env(safe-area-inset-bottom)`, scroll container sizing). This warrants a dedicated UX investigation before implementation.

**The structured planning assistant UX is harder than a chatbot UX.**
A chatbot shows messages and replies. A planning assistant that shows proposal cards inline requires messages interspersed with actionable cards, approval state management, and link-back to created entities. Do not underestimate the UI complexity. Phase 2 is the hardest UX phase.

---

## I. Final Recommendation

**The codebase is ready for this module, but not immediately.**

The architecture is sound and well-documented. The module system, context tab pattern, server action conventions, RLS, and Sentry observability are all production-quality and ready to host Project Copilot cleanly. No foundational cleanup is required before starting.

However, **the AI layer is a greenfield build**. None of the packages, API patterns, data models, or UI surfaces needed for AI chat exist yet. Phase 1 alone requires installing an AI SDK, establishing a new streaming Route Handler pattern, building two new DB tables with migrations and RLS, building a context assembly function, and creating an entirely new UI surface.

### Recommended pre-work before Phase 1

1. Decide on AI SDK (`ai` + `@anthropic-ai/sdk` recommended) and install as a `dependency`
2. Define the `CopilotProposal` TypeScript type and the schema for each proposal type (`task`, `note`) — this drives everything else
3. Write the first draft of the system prompt and test it manually with raw API calls before writing any code
4. Add `'copilot'` to `ModuleKey` in `lib/modules/registry.ts` and add the registry entry — this unblocks routing and tab bar work immediately
5. Create the milestone table migration (separate PR) since the AI will want to propose milestones and there is nowhere to store them

### Mistakes to avoid in Phase 1

- Do not implement auto-approval of any AI proposal. Proposal -> approval -> write must always require an explicit user action.
- Do not use Server Actions for the streaming chat endpoint.
- Do not build a generic "tool execution framework" — start with hard-coded support for `task` and `note` only.
- Do not skip rate limiting — even a simple DB-counted check prevents runaway cost before launch.

The product vision for Project Copilot is coherent and well-matched to what the system already stores. The path from the current codebase to a working Phase 1 is clear, bounded, and implementable without touching any existing module's code.
