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

| Missing                                                       | Why needed                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Chat UI component (`CopilotChatWindow`)                       | No chat interface exists anywhere in the codebase                                     |
| Streaming text rendering                                      | No component currently handles chunked/streamed text responses                        |
| `SkeletonCopilot` shimmer component                           | Required by AGENTS.md for all loading states                                          |
| Action proposal card UI                                       | UI for presenting structured AI outputs (tasks, notes) before user approval           |
| Approval/reject flow UX                                       | User must be able to accept or discard each AI-proposed entity before it writes to DB |
| Copilot tab page (`app/context/[projectId]/copilot/page.tsx`) | Route does not exist                                                                  |
| `ContextCopilotFromCache.tsx`                                 | Cache wrapper does not exist                                                          |
| `ContextCopilotClient.tsx`                                    | Client component does not exist                                                       |
| i18n keys for Copilot                                         | `locales/en.json` and `locales/es.json` have no `copilot.*` section                   |

### Backend

| Missing                                                           | Why needed                                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AI SDK package (`@anthropic-ai/sdk` or `ai`)                      | Zero AI packages in `package.json` — nothing can call the model                                                       |
| Streaming API route (`app/api/copilot/[projectId]/chat/route.ts`) | Server Actions in Next.js 14 are not designed for streaming responses; SSE or chunked streaming needs a Route Handler |
| `app/context/[projectId]/copilot/actions.ts` server actions       | Read actions (fetch history, fetch context), write actions (save message, approve proposal)                           |
| AI context builder function (`lib/copilot/context.ts`)            | Logic to assemble a structured prompt from project data (name, tasks, notes, resources)                               |
| Structured output parser (`lib/copilot/parser.ts`)                | Parse model JSON into typed proposal objects before they reach the write layer                                        |
| Proposal validation (`lib/validation/copilot.ts`)                 | Validate AI-generated task/note proposals before write                                                                |
| AI orchestration layer                                            | Conversation history, system prompt management, structured output schema                                              |

### Database

| Missing                   | Why needed                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copilot_sessions` table  | Persistent planning session tied to `project_id` and `owner_id`                                                                                                              |
| `copilot_messages` table  | Individual turns (role: `user` / `assistant`), including raw content and `created_at`                                                                                        |
| `copilot_proposals` table | Structured proposed actions (type: `task`, `note`; status: `pending`, `approved`, `rejected`; payload: JSONB)                                                                |
| Milestones table          | AI can propose milestones, but there is nowhere to store them — confirmed absent in `lib/supabase/types.ts` and all migrations. This is a hard dependency for Phase 4+ only. |
| RLS on all new tables     | Required — must scope by `project_id → projects.owner_id = auth.uid()` consistent with existing patterns                                                                     |

### AI Orchestration

| Missing                         | Why needed                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| System prompt template          | The model needs structured instructions defining its role, output format, and constraints |
| Conversation history management | Token budget management for long sessions; history truncation strategy                    |
| Structured output schema        | JSON schema for proposals so the model returns parseable, typed outputs                   |
| Token cost tracking             | No metering infrastructure exists                                                         |

### Security

| Gap                                     | Risk                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| No rate limiting on AI endpoints        | A single user could run up unbounded API costs — P1 risk                                  |
| No input sanitization beyond basic trim | AI input should be validated for length limits before being sent to the model             |
| No AI output sanitization               | Proposals returned from the model must be validated against schema before touching the DB |
| No per-project AI usage cap             | Without this, a project can exhaust the API budget                                        |

### UX

| Gap                                        | Risk                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| No conversation history scroll             | Sessions could be long; mobile needs a specific scroll container pattern |
| No session reset affordance                | Users need to start fresh without destroying history                     |
| No feedback mechanism for bad AI responses | No thumbs up/down or regeneration UX exists                              |

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

Next.js 14 Server Actions use a POST-based RPC protocol. They can return data, but they were not designed for streaming tokens back to the client. The canonical pattern for streaming AI responses in Next.js App Router is a Route Handler (`route.ts`) that returns a `ReadableStream` or uses the Vercel AI SDK's `streamText` helper. This is a technical requirement, not a stylistic preference.

The existing Server Actions in `app/actions/` are still used for non-streaming operations: saving messages to DB, fetching session history, approving/rejecting proposals. Only the model call itself goes through the API route.

### Recommended AI SDK

Vercel AI SDK (`ai` + `@anthropic-ai/sdk`). The `ai` package's `streamText` function handles streaming, token counting, and structured output in a way that composes cleanly with Next.js App Router. It also makes swapping models trivial.

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

### Table: `copilot_messages`

```sql
CREATE TABLE public.copilot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL,
  owner_id    UUID NOT NULL,
  role        TEXT NOT NULL,       -- 'user' | 'assistant'
  content     TEXT NOT NULL,
  token_count INTEGER,
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
  type               TEXT NOT NULL,                    -- 'task' | 'note'
  payload            JSONB NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_entity_id  UUID,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

**All three tables need:**

- RLS using `EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid())`
- `updated_at` trigger using `update_updated_at_column()` (sessions and proposals only)
- Compound index on `(project_id, created_at DESC)`
- Index on `(session_id, created_at ASC)` for messages

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
  3. Rate limit check
  4. Call buildProjectContext(projectId) -> system prompt
  5. Call AI SDK streamText with context + messages
  6. Pipe response stream to client
```

### Server Actions: `app/context/[projectId]/copilot/actions.ts`

```
getCopilotSession(projectId)                             -> SerializableCopilotSession | null
getCopilotMessages(sessionId)                            -> CopilotMessage[]
createCopilotSession(projectId)                          -> CopilotSession
saveCopilotMessage(sessionId, role, content, tokenCount) -> CopilotMessage
saveCopilotProposals(sessionId, messageId, proposals[])  -> CopilotProposal[]
approveProposal(proposalId)                              -> { ok, createdEntityId }
rejectProposal(proposalId)                               -> { ok }
```

---

## G. Suggested Implementation Phases

### Phase 0 — Prerequisites

- Install AI SDK, add ModuleKey, write migrations, define TypeScript types, validate system prompt manually

### Phase 1 — Contextual chat (no writes)

- Working streaming chat tab with project-aware AI responses and message persistence

### Phase 2 — Structured planning drafts

- AI generates task/note proposal cards; user can reject; nothing writes to system yet

### Phase 3 — Validated write actions

- Approve proposal → creates real task or note via existing write pipeline

### Phase 4 — Session management and iteration (deferred)

- Named sessions, session history, plan revision, milestone proposals (requires milestone table)

---

## H. Risks and Unknowns

### Architecture risks

- Streaming requires Route Handler — new pattern for this repo, must be documented
- Session cache is wrong for chat history — Copilot must explicitly NOT use `ContextDataCache` for messages
- `getProjectResources` delegates auth to inner getters — safe but must be verified before building on top of it

### AI hallucination risks

- Model will invent plausible-sounding data — the proposal → approval flow is the control mechanism
- Structured output parsing is fragile — `parser.ts` must return empty array on any failure, never throw

### Data consistency risks

- `approveProposal` is a multi-step write — must be atomic via `approve_copilot_proposal_atomic` RPC
- No milestone table — milestone proposals cannot exist until a separate migration creates the table

### Performance and cost concerns

- Unbounded context tokens — cap at 10 tasks, 5 note titles in `buildProjectContext`
- No rate limiting — DB-counted check is required before production launch
- Initial tab load: 2 DB calls (session + messages) — within the 3 round-trip budget

### Maintainability risks

- Prompt drift — treat system prompt as code, not config; Vitest snapshot tests on context builder
- Over-engineering — start with hard-coded `task` and `note` support only
- Session cache exclusion — must be documented in the component and in AGENTS.md

---

## I. Final Recommendation

The codebase is ready for this module, but not immediately. Phase 0 must complete first (SDK, migrations, types, prompt validation). No existing code needs to be refactored. The path to a working Phase 1 is clear and bounded.

The single most important pre-implementation action is: **write and test the system prompt before writing any code**. The prompt is the highest-leverage variable in the entire module. If it is poorly designed, Phases 1–3 will feel broken regardless of code quality.
