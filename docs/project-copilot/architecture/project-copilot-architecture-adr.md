# Project Copilot — Architecture Decision Record (V1)

**Version:** 1.0
**Status:** Pre-implementation — decisions locked for V1
**Date:** 2026-03-06
**Related:** `docs/project-copilot/blueprint/project-copilot-implementation-blueprint.md`

---

## Overview

This document records the key architectural decisions for Project Copilot V1 and the reasoning behind each. It is written for future engineers who will maintain or extend the module and need to understand why the architecture looks the way it does.

Each decision includes: the context, the options considered, the decision made, the reasoning, and the consequences.

---

## ADR-001: Use a Route Handler for AI streaming, not a Server Action

### Context

ClearQueue uses Next.js 14 Server Actions (`'use server'`) for all data access and mutations. There is no existing streaming API pattern anywhere in the repo. Project Copilot requires streaming token-by-token responses from the AI model for acceptable UX — waiting for a complete response before rendering anything is not acceptable for a planning assistant where responses can be 500–1,000 tokens long.

### Options considered

**Option A: Server Action (existing pattern)**
Server Actions in Next.js 14 are based on a POST-based RPC protocol. They can return data, but they use the standard request/response cycle. They cannot stream tokens back to the client.

**Option B: Route Handler (`app/api/.../route.ts`) — new pattern for this repo**
Route Handlers in Next.js 14 App Router return standard Web API `Response` objects and support streaming via `ReadableStream`. `@anthropic-ai/sdk`'s `messages.stream()` returns a stream that can be piped directly into a `Response`.

**Option C: WebSocket connection**
A persistent WebSocket could stream tokens bidirectionally. This is the most flexible option but requires additional infrastructure (a WebSocket server or Supabase Realtime) and is significant over-engineering for a one-way token stream.

### Decision

**Option B: Route Handler at `app/api/copilot/[projectId]/chat/route.ts`.**

### Reasoning

- Server Actions cannot stream tokens back to the client in Next.js 14. This is a technical constraint, not a preference.
- Route Handlers have first-class streaming support via the Web Streams API.
- `@anthropic-ai/sdk`'s `messages.stream()` returns a `ReadableStream` that works directly as a Route Handler `Response` body.
- WebSockets add operational complexity (connection management, reconnect logic) that is not justified for a one-directional token stream.
- The existing Route Handler in `app/api/documents/[fileId]/view/route.ts` establishes that Route Handlers are already understood and used in the repo.

### Consequences

- Positive: Clean streaming with no workarounds; AI SDK integrates naturally.
- Positive: Route Handler enforces auth independently — `requireAuth()` still works identically.
- Negative: This is a new pattern for this codebase. The route must include a comment block explaining the streaming pattern and why a Server Action cannot be used, so future engineers don't try to "simplify" it back to a Server Action.
- Negative: The Route Handler cannot directly call Server Actions. This means the assistant message save (after stream completes) must happen either in the Route Handler itself (using the Supabase client directly) or via a client-side follow-up Server Action call after `onFinish`. The recommended approach is client-side follow-up to keep the Route Handler focused on streaming.

---

## ADR-002: Use `@anthropic-ai/sdk` (Anthropic's official SDK) directly

### Context

Project Copilot needs to call the Anthropic Claude API to generate AI responses. There are multiple ways to integrate with Anthropic's API. The codebase has zero existing AI packages — this is greenfield.

### Options considered

**Option A: `@anthropic-ai/sdk` — Anthropic's official SDK (chosen)**
The official SDK published by Anthropic. Provides a fully typed client for the Messages API, native streaming support via `messages.stream()`, automatic retries, and access to every Anthropic feature (vision, tool use, streaming, token counting) as soon as Anthropic releases it. One package, maintained by the model provider itself.

**Option B: `ai` (Vercel AI SDK) + `@ai-sdk/anthropic` adapter**
A third-party abstraction layer that wraps `@anthropic-ai/sdk` under the hood. Adds convenience helpers (`streamText`, `StreamingTextResponse`) at the cost of an extra dependency and an API surface that is not maintained by Anthropic. Useful for projects that need to swap providers frequently; unnecessary here.

**Option C: Direct HTTP calls to the Anthropic API**
Raw `fetch()` calls to `api.anthropic.com`. Maximum flexibility, zero dependencies. Requires manually parsing SSE streaming, handling retries, and maintaining type definitions. Not appropriate for an initial implementation.

### Decision

**Option A: `@anthropic-ai/sdk` — Anthropic's official SDK.**

### Reasoning

- Anthropic maintains this SDK directly. Every new Claude model, feature, and API capability is available in it on day one — no waiting for a third-party adapter to catch up.
- Native streaming is first-class: `client.messages.stream(...)` returns a typed stream that can be piped directly into a `ReadableStream` for the Route Handler response.
- One dependency instead of two. No adapter layer that can fall out of sync with the underlying SDK.
- Switching between Claude models (Sonnet, Opus, Haiku) requires changing only the `model` string — no adapter configuration needed.
- The SDK handles retries, error parsing, and request validation out of the box.

### Usage pattern in the Route Handler

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Inside the POST route handler:
const stream = client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: systemPrompt,
  messages: conversationHistory,
});

return new Response(stream.toReadableStream(), {
  headers: { 'Content-Type': 'text/event-stream' },
});
```

### Consequences

- Positive: One dependency, maintained by Anthropic. Zero abstraction layers.
- Positive: Every new Anthropic API capability is available immediately without waiting for adapter updates.
- Positive: Switching Claude models requires changing only the `model` string.
- Negative: If the project ever needs to support a non-Anthropic model (OpenAI, Gemini), a different SDK would need to be added. This is not a V1 concern.
- Negative: The client-side streaming token rendering must parse the SSE events from the Anthropic stream format. This is straightforward but requires knowing the Anthropic SSE event structure (`content_block_delta`, `message_stop`, etc.).

---

## ADR-003: Use DB-counted rate limiting, not edge middleware or Redis

### Context

Project Copilot is the first feature in ClearQueue that incurs real monetary cost per user interaction. Without rate limiting, a single user can exhaust the API budget in one session. The codebase has zero existing rate limiting infrastructure.

### Options considered

**Option A: Edge middleware rate limiting (e.g., Upstash Redis + Vercel Edge Middleware)**
Middleware-level rate limiting intercepts requests before they reach the route handler. Upstash Redis provides a serverless-compatible Redis store for maintaining request counts.

**Option B: DB-counted check in the route handler**
Before calling the model, execute a `COUNT` query on `copilot_messages` where `owner_id = user.id AND created_at >= NOW() - INTERVAL '24 hours'`. If count >= limit, return 429. No external infrastructure needed.

**Option C: In-memory rate limiting (in-process counter)**
A JavaScript `Map` keyed by user ID in the Next.js process memory. Simple but does not work across multiple serverless instances and does not survive restarts.

**Option D: No rate limiting for V1**
Accept the risk for internal launch and add rate limiting before public release.

### Decision

**Option B: DB-counted check in the route handler.**

### Reasoning

- No external infrastructure required. No Redis instance, no Upstash account, no additional cost or operational surface.
- Consistent with how the rest of the app handles data — everything goes through Supabase. The rate limit check is just a `SELECT COUNT` on the same `copilot_messages` table that already exists.
- Auditable — the counts are derivable from the same table that stores message history. No separate counter store to get out of sync.
- Edge middleware has limitations: it runs before auth resolves fully, making per-user rate limiting harder to implement correctly.
- In-memory counters don't work in serverless deployments.
- The DB count adds ~5–10ms to the request, which is invisible compared to model latency (which is 1,000–5,000ms for a streaming response).
- Option D is ruled out: rate limiting is a P1 requirement for any AI endpoint with real cost exposure, per the rate limit strategy document.

### Consequences

- Positive: Zero new infrastructure.
- Positive: Rate limit data is auditable from the existing DB.
- Positive: Limit adjustments (e.g., 30 messages/day → 50 messages/day) require only a code change, not infrastructure configuration.
- Negative: Two additional DB queries per request (daily count + hourly count). Acceptable in V1 given model latency dwarfs this overhead.
- Negative: Not suitable for very high traffic scenarios where DB query overhead matters. Post-V1, if this becomes a bottleneck, migrate to Upstash or Vercel's KV store.

---

## ADR-004: Do not use the ContextDataCache for chat history

### Context

All other context tabs in ClearQueue (`notes`, `board`, `links`, `ideas`, `budgets`, `calendar`) use `ContextDataCache` to avoid refetching data when the user switches between tabs. The cache is an in-memory JavaScript object that lives in `app/context/layout.tsx` and survives tab switches within a session. All `*FromCache` components follow this pattern.

Project Copilot has a `ContextCopilotFromCache.tsx` component that follows the same structural pattern — but it must handle caching differently.

### Options considered

**Option A: Cache conversation history in `ContextDataCache` (standard pattern)**
Load messages once, store in cache, serve from cache on subsequent tab visits. Consistent with all other modules.

**Option B: Fetch from DB on every tab visit (exception to standard pattern)**
On each visit to the Copilot tab, load the session and messages from the database. No in-memory cache for messages.

### Decision

**Option B: Fetch from DB on every tab visit for message history.**

### Reasoning

- Chat history grows with every user message. Unlike a task list (which changes occasionally) or a note list (which is typically small), the message array can grow to 50–100 messages in a single session. Caching this in memory indefinitely would increase the memory footprint of the cache and make cache invalidation complex.
- The session cache is ephemeral — it lives only as long as the current browser session. Message history must be persistent across page reloads and browser restarts. The database is the source of truth.
- The cache does not have a TTL or size limit. A large message history would never be evicted.
- DB fetches for message history are fast: a `SELECT` on `copilot_messages` by `session_id` with a `created_at ASC` order and a limit of 50 messages is sub-10ms on Supabase.
- The standard pattern exists for performance. For Copilot, the alternative — always fetching from DB — is both correct and fast enough.

### Consequences

- Positive: Simpler cache invalidation. No risk of stale message history.
- Positive: Message history survives page reloads and browser restarts.
- Negative: One additional DB round-trip per Copilot tab visit compared to the cached pattern. Acceptable given the latency profile of the feature.
- **Critical:** `ContextCopilotFromCache.tsx` must include a prominent comment block at the top of the file explaining why it does not use `ContextDataCache`. Without this, a future engineer will "fix" it to follow the standard pattern and introduce a regression. This comment is mandatory.

---

## ADR-005: Store raw assistant message content (including `<<PROPOSALS>>` blocks)

### Context

The AI model returns a response that is a mix of conversational text and an embedded `<<PROPOSALS>>` JSON block. When saving the assistant message to `copilot_messages.content`, there are two options: store the raw content (including the proposals block) or strip the proposals block and store only the display text.

### Options considered

**Option A: Store raw content including `<<PROPOSALS>>` blocks**
The full response string, as returned by the model, is stored in `content`. The client strips the proposals block before rendering the conversational text.

**Option B: Strip proposals block before storing; save proposals separately**
Parse the proposals out of the response immediately, save them to `copilot_proposals`, and save only the clean conversational text to `copilot_messages.content`.

### Decision

**Option A: Store raw content in `copilot_messages.content`.**

### Reasoning

- The raw content is the source of truth. If the parser is updated (e.g., a bug fix changes how proposals are extracted), stored messages can be re-parsed to produce different results. This is impossible if the proposals block has already been stripped.
- Stripping at save time tightly couples the save operation to the parser. If the parser throws during save, no message would be stored at all.
- The proposals block is parseable from raw content at any time. Storing the full string adds a few hundred bytes per message — negligible.
- The client already needs to handle rendering the assistant message without showing the raw `<<PROPOSALS>>` JSON to the user, so the stripping logic is needed on the client regardless.

### Consequences

- Positive: Messages are self-contained and re-parseable. Parser bugs can be corrected retroactively.
- Positive: Save operation has no dependency on the parser succeeding.
- Negative: The client must filter out the `<<PROPOSALS>>` block from the displayed message content. This is a simple string operation (remove everything between the delimiters), but it must be done correctly to avoid showing raw JSON to users.

---

## ADR-006: Delimiter-based structured output, not tool calling or JSON mode

### Context

The AI model needs to return structured data (task and note proposals) alongside conversational text. There are several ways to achieve structured output from the Anthropic Claude API.

### Options considered

**Option A: Tool calling / function calling**
The Anthropic API supports tool use, where the model can call predefined functions with structured arguments. This is the most typed approach — the model's proposals arrive in a well-defined tool-call format.

**Option B: JSON mode / structured output schema**
Force the model to return only JSON. Some providers support a JSON schema parameter that constrains the entire response to a valid JSON structure.

**Option C: Delimiter-based embedded JSON block (recommended)**
The model returns conversational text with an optional `<<PROPOSALS>>` / `<</PROPOSALS>>` block containing a JSON array. The parser extracts the JSON from between the delimiters.

### Decision

**Option C: Delimiter-based embedded JSON block.**

### Reasoning

- **Tool calling breaks conversational UX.** When a model uses tool calling, it pauses the text response to emit a structured call. This means the user sees either only JSON or only text, but not a natural conversation with embedded proposals. Project Copilot needs both.
- **JSON mode eliminates conversational text.** Pure JSON responses are not appropriate for a planning assistant that needs to explain its reasoning, ask clarifying questions, and provide context around its suggestions.
- **Delimiters are the standard approach for mixed-content responses.** This pattern is widely used and well-understood: the model generates text freely and indicates structured sections with delimiters. The parser extracts only what it needs.
- **Simpler implementation.** The parser (`lib/copilot/parser.ts`) is a straightforward regex + JSON.parse operation. No SDK-specific tool calling infrastructure needed.
- **Safe fallback.** If the model omits the proposals block, the response is still a valid conversational message. The parser returns `[]` and no proposals are shown. This is correct and graceful.

### Consequences

- Positive: Natural conversational UX with embedded structured output.
- Positive: Parser is simple and testable with hardcoded strings (no live model calls needed in tests).
- Positive: Conversational responses without proposals are valid and useful.
- Negative: The model is not guaranteed to produce valid JSON in the proposals block on every call. The parser must be robust: catch all JSON parse errors, return `[]`, and log to Sentry.
- Negative: The prompt must be explicit about the delimiter format and JSON schema, or the model will produce malformed blocks. Prompt design is critical.

---

## ADR-007: Proposal approval uses `approve_copilot_proposal_atomic` RPC

### Context

When a user approves a proposal, the system must: (1) validate the proposal payload, (2) create the entity (task or note), (3) update the proposal status to `'approved'`, and (4) store the `created_entity_id`. These are multiple writes that must succeed or fail together.

### Options considered

**Option A: Server action with sequential writes and manual compensating logic**
A `'use server'` action executes each write step in sequence with try/catch. If step 3 fails after step 2 succeeds, the compensating logic deletes the created entity.

**Option B: Postgres RPC (`approve_copilot_proposal_atomic`)**
A stored function executes all writes inside a single DB transaction. If any step fails, the entire transaction rolls back.

### Decision

**Option B: Postgres RPC (`approve_copilot_proposal_atomic`).**

### Reasoning

- **Atomicity invariant.** AGENTS.md is explicit: "Any multi-step write must be atomic via a Postgres RPC." This is an architectural law of the codebase.
- **Compensating logic is fragile.** Manually written compensating actions in a Server Action are error-prone. If the compensating action itself fails (e.g., network issue during the compensating delete), the system is in an inconsistent state.
- **DB transactions are the correct tool.** The database has first-class support for transactions. Using it as intended is the correct approach.
- **Consistent with existing patterns.** `create_task_atomic`, `move_task_atomic`, `duplicate_budget_atomic` — all multi-step writes in this codebase use this pattern.

### Consequences

- Positive: Guaranteed atomicity — no partial state is ever possible.
- Positive: Consistent with existing codebase conventions.
- Negative: Requires writing a Postgres function in a migration file, which is more friction than a pure TypeScript solution.
- Negative: The RPC must handle both `'task'` and `'note'` type proposals — it needs conditional logic (INSERT INTO tasks vs INSERT INTO notes based on proposal type). This is straightforward in PL/pgSQL but must be designed carefully.

---

## ADR-008: `copilot` module is disabled by default

### Context

The module registry allows modules to be `defaultEnabled: true` or `defaultEnabled: false`. The `board` module is enabled by default for all new projects. Optional modules (`owner`, `media`, `calendar`, `documents`) are disabled by default and must be enabled by the user in the module settings drawer.

### Decision

**`copilot` module is `defaultEnabled: false`.**

### Reasoning

- Consistent with the optional module pattern. Users who want Copilot enable it deliberately.
- An AI assistant tab appearing by default on all projects without user consent could be perceived as intrusive.
- Rate limiting is per-user, not per-project. A user with 20 projects would have 20 Copilot tabs potentially appearing, increasing the surface area for accidental or habitual usage that consumes quota.
- The module can be promoted through onboarding flows or feature announcements rather than being forced on every project.

### Consequences

- Positive: Users who don't use Copilot don't see it.
- Positive: Consistent with existing optional module behavior.
- Negative: Reduces initial discoverability. Must be mitigated by a settings drawer upsell or in-app promotion.

---

## Summary Table

| Decision                 | Choice                                         | Key Reason                                         |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------- |
| Streaming implementation | Route Handler (`route.ts`)                     | Server Actions cannot stream tokens                |
| AI client library        | `@anthropic-ai/sdk` (Anthropic's official SDK) | One dep, maintained by Anthropic, native streaming |
| Rate limiting mechanism  | DB-counted check in route handler              | No external infrastructure; auditable              |
| Chat history caching     | No cache; always fetch from DB                 | History grows unbounded; DB is source of truth     |
| Message storage          | Raw content including proposals block          | Re-parseable if parser is updated                  |
| Structured output format | Delimiter-based embedded JSON                  | Preserves conversational UX                        |
| Approval atomicity       | Postgres RPC `_atomic`                         | AGENTS.md policy; no partial state                 |
| Default module state     | Disabled by default                            | Consistent with optional modules pattern           |
