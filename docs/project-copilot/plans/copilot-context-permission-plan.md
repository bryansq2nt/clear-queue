# Project Copilot: Context Permission (Expand Context on Request)

**Created:** 2026-03-06  
**Status:** Planning  
**Goal:** When the Copilot needs more project data to answer accurately (e.g. "which existing tasks belong to this milestone?"), it can request permission to load full context; the user grants it; the Copilot then receives the full task/list data and can answer with full understanding.

---

## 1. Problem

Today the Copilot only receives **10 most recent tasks** and **5 most recent notes** in its system prompt. When the user asks things like:

- "Which of my existing tasks should be under the Core Platform milestone?"
- "Do any of my completed tasks belong to this milestone?"

the AI correctly says it only has visibility of 10 tasks and cannot see the rest. The user has no way to grant the AI "permission" to see more so it can give a proper answer.

**Requirement:** The AI should be able to **ask for permission** to load full (or expanded) context when it needs it, and the user can **grant** that permission with one action (e.g. a button). After permission is granted, the same question is answered again with full context.

---

## 2. Design overview

| Concept              | Description                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Standard context** | Current behavior: 10 most recent tasks, 5 most recent notes, up to 8 milestones. ~1.5k tokens.                                                                                                                                                                                                                          |
| **Full context**     | Expanded: many more tasks (e.g. up to 80–100), more notes (e.g. 20), all milestones. Includes task `milestone_id` and status so the AI can suggest associations. Token budget ~4–5k.                                                                                                                                    |
| **REQUEST_CONTEXT**  | A block the AI emits in its reply when it needs more data: `<<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>>`. The client parses it and shows a "Grant permission" button.                                                                                                                                         |
| **Grant permission** | User clicks "Load full context and answer again". The client re-sends the **last user message** (with full conversation history) to the chat API with a flag `contextScope: 'full'`. The backend builds system prompt with full context. The AI streams a new reply; that reply is appended as a new assistant message. |

**Flow:**

1. User: "El hito Core Platform no tiene tareas. ¿Alguna de mis tareas existentes debería estar asociada?"
2. AI (with standard context): Explains it only sees 10 tasks, and emits `<<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>>`.
3. Client parses the reply, shows the AI text and a button: "Cargar todas las tareas y responder de nuevo".
4. User clicks the button.
5. Client calls `POST /api/copilot/:projectId/chat` with the same `messages` (conversation so far, including the last user message) and `contextScope: 'full'`.
6. Backend calls `buildProjectContext(projectId, { scope: 'full' })` and builds a richer system prompt (e.g. all tasks with title, status, milestone_id).
7. AI streams a new reply with full visibility and can suggest which tasks belong to the milestone (or propose new ones).
8. Client appends this as a new assistant message. Optionally show a small label "Con contexto completo" on that bubble.

---

## 3. Implementation plan (for Claude Code)

### Phase 1 — Backend: context scope and API

**3.1.1 `buildProjectContext(projectId, options?)`** (`lib/copilot/context.ts`)

- Signature: `buildProjectContext(projectId: string, options?: { scope?: 'standard' | 'full' }): Promise<string>`.
- Default `scope` is `'standard'` (current behavior: 10 tasks, 5 notes, 8 milestones).
- When `scope === 'full'`:
  - **Tasks:** Do not slice to 10. Take up to **80** tasks (or all if fewer), sorted by `updated_at` desc. For each task include: title, status, milestone_id (if any). Format: one line per task, e.g. `- [status] title (milestone_id: <id> or sin hito)` so the AI can suggest associations.
  - **Notes:** Take up to **20** (or all if fewer), same as now but more.
  - **Milestones:** All (no limit of 8), id + title.
  - Add a line at the top of the context block when scope is full: "You have FULL visibility of the project: all tasks listed below with their status and milestone (if any). Use this to suggest which existing tasks belong to which milestone, or to propose new tasks under a milestone."
- Keep token budget in mind: 80 tasks × ~40 chars ≈ 3.2k chars; add a short note in comments that full context may be ~4k tokens and the system prompt base + this should stay under model limits.

**3.1.2 Chat API route** (`app/api/copilot/[projectId]/chat/route.ts`)

- Parse request body for optional `contextScope: 'standard' | 'full'`. If missing, use `'standard'`.
- When building the system prompt, call `buildProjectContext(projectId, { scope: contextScope })` instead of `buildProjectContext(projectId)`.
- No other change to the route (same rate limits, same streaming).

---

### Phase 2 — System prompt: when to request context

**3.2.1** (`lib/copilot/context.ts` — inside `SYSTEM_PROMPT_BASE` or in the context block when scope is standard)

Add a short paragraph (when scope is standard only):

- "You only have visibility of the 10 most recent tasks and 5 most recent notes. When the user asks which existing tasks belong to a milestone, or whether completed/pending tasks should be associated with a milestone, or any question that requires seeing the full list of tasks, you must: (1) Explain briefly that you only see a subset; (2) Emit exactly this block at the end of your response so the user can grant you full visibility: <<REQUEST_CONTEXT>>{\"tasks\":true}<</REQUEST_CONTEXT>>. If you need full notes too, use {\"tasks\":true,\"notes\":true}. Do not invent data you cannot see."

When scope is full, do not add this paragraph; instead the context block already states "You have FULL visibility...".

---

### Phase 3 — Client: parse REQUEST_CONTEXT and show grant button

**3.3.1 Parser** (`lib/copilot/parser.ts` or new `lib/copilot/context-request.ts`)

- Add a function `parseContextRequest(content: string): { tasks?: boolean; notes?: boolean } | null`.
- Regex or string match: `<<REQUEST_CONTEXT>>([\s\S]*?)<</REQUEST_CONTEXT>>`. Parse the inner JSON (allow `{"tasks":true}`, `{"tasks":true,"notes":true}`). Return the object or null if missing/invalid.
- No need to strip this block from the message for display: we can leave it in the bubble text or strip it for a cleaner display (recommended: strip so the user doesn’t see raw JSON).

**3.3.2 Strip for display** (optional but recommended)

- When rendering assistant content, remove the block `<<REQUEST_CONTEXT>>...<</REQUEST_CONTEXT>>` (and the trailing newline if any) so the user only sees the natural language part.

**3.3.3 ContextCopilotClient** (`app/context/[projectId]/copilot/ContextCopilotClient.tsx`)

- After streaming completes and the assistant message is saved, run `parseContextRequest(fullText)` on the saved message content (or on `streamingContent` before saving — but we save first, so run on the content we saved).
- If the result is non-null, set state e.g. `contextRequestForMessageId: msg.id` (and optionally the payload `{ tasks: true }`) so the UI can show the button for that message.
- **"Load full context and answer again" button:** When the user clicks it:
  - Build `contextMessages` the same way as the initial send (last 20 messages, including the last user message). Do not include the assistant message that requested context in the messages sent to the API (the API expects alternating user/assistant; the last message must be the user message that triggered the request).
  - Call `fetch(/api/copilot/${projectId}/chat, { body: JSON.stringify({ sessionId, messages: contextMessages, contextScope: 'full' }) })`.
  - Stream the new response. When done, persist the new assistant message and append to `messages`. Clear `contextRequestForMessageId` so the button is hidden for the old message.
- Important: the `messages` array sent to the API must end with the **user** message (the one that asked the question). So when we re-send, we send the same `contextMessages` we used the first time (last 20 messages, ending with that user message). We do not include the assistant reply that contained REQUEST_CONTEXT in the request body — so the model will not see its own "I need more context" reply; it will only see the user message again and, this time, the system prompt will have full context. So the same user message gets a new, better answer.

**3.3.4 CopilotChatWindow** (or keep logic in ContextCopilotClient)

- For each assistant message, if `contextRequestForMessageId === msg.id` (or if the message content contains REQUEST_CONTEXT and we haven’t yet shown the button for a later message), show below the bubble a small banner: "El Copilot necesita más datos del proyecto para responder con precisión." and a button "Cargar contexto completo y responder de nuevo". On click, call the handler passed from ContextCopilotClient (e.g. `onRequestFullContext(lastUserMessageId)` or `onRetryWithFullContext()`). The parent must know the "last user message" that corresponds to this assistant reply (the message just before this one in the list). So when the user clicks, the parent re-sends with that conversation history and contextScope: 'full'.

**3.3.5 Implementation detail (re-send)**

- Store the last user message content (or the full contextMessages used for the last request) in a ref or state when we send. When the user clicks "Load full context and answer again", use that same contextMessages and send with contextScope: 'full'. That way we don’t have to recompute from the current messages array (which might have the assistant reply already appended). Alternatively: when building contextMessages for the retry, take `messages` from state, find the last user message, and build contextMessages = all messages up to and including that user message (excluding any assistant message after it). So contextMessages = messages.slice(0, lastUserMessageIndex + 1) in role/content form, then slice(-20). Then send. This way we use the same conversation history that led to the "I need more context" reply.

---

### Phase 4 — i18n and UX

**3.4.1 i18n** (`locales/en.json`, `locales/es.json`)

- Under `copilot.*`:
  - `context_request_banner`: "The Copilot needs more project data to answer accurately." / "El Copilot necesita más datos del proyecto para responder con precisión."
  - `context_request_btn`: "Load full context and answer again" / "Cargar contexto completo y responder de nuevo"
  - Optionally: `context_full_answer_label`: "Answer with full context" / "Respuesta con contexto completo" (to show on the second assistant bubble).

**3.4.2** Only show the "Load full context" button once per assistant message (the one that requested it). After the user clicks and a new assistant message is appended, do not show the button again for the same message (we can clear the state when we start the retry, or mark that message as "already had retry").

---

## 4. File checklist

| File                                                                         | Action                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/copilot/context.ts`                                                     | Add `options?: { scope?: 'standard' \| 'full' }` to `buildProjectContext`; when `full`, include up to 80 tasks (title, status, milestone_id), 20 notes, all milestones; add "FULL visibility" line when full; add "only 10 tasks..." and REQUEST_CONTEXT instructions when standard. |
| `app/api/copilot/[projectId]/chat/route.ts`                                  | Read `contextScope` from body; pass to `buildProjectContext(projectId, { scope: contextScope })`.                                                                                                                                                                                    |
| `lib/copilot/parser.ts` or `lib/copilot/context-request.ts`                  | Add `parseContextRequest(content: string)` returning `{ tasks?: boolean; notes?: boolean } \| null`. Optionally add `stripContextRequestFromContent(content: string)` for display.                                                                                                   |
| `app/context/[projectId]/copilot/ContextCopilotClient.tsx`                   | After saving assistant message, parse REQUEST_CONTEXT; set state for which message id has pending context request. Add handler to re-send last user message with contextScope: 'full', stream and append new assistant message. Pass handler and pending state to chat window.       |
| `components/context/copilot/CopilotChatWindow.tsx` (or CopilotMessageBubble) | For assistant messages with pending context request, show banner + button "Load full context and answer again". On click, call parent handler. Optionally strip REQUEST_CONTEXT block from displayed content.                                                                        |
| `locales/en.json`, `locales/es.json`                                         | Add `copilot.context_request_banner`, `copilot.context_request_btn`.                                                                                                                                                                                                                 |

---

## 5. Edge cases

- **Rate limit:** The retry with full context counts as one more user message for rate limiting if we send the same user message again. Decide: either (a) count it as one request (current behavior: one POST = one stream), or (b) exempt "retry with full context" from the daily/hourly count. Recommendation: (a) — one retry = one more request; keep it simple.
- **Token limit:** Full context (~80 tasks + 20 notes + milestones) might push the system prompt to ~4–5k tokens. Ensure the model’s context window is sufficient; if needed, cap tasks at 50 or 60.
- **No REQUEST_CONTEXT in reply:** If the AI forgets to emit the block, the user can still be told in the UI: "If the Copilot’s answer is incomplete, you can type 'use full context' or add a manual note." Alternatively add a generic "Load full context for next message" toggle in the Copilot UI that sets contextScope: 'full' for the next send (no AI request needed). That can be a follow-up.

---

## 6. Success criteria

- User asks a question that requires seeing many/all tasks (e.g. which tasks belong to a milestone).
- AI replies that it only sees 10 tasks and emits `<<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>>`.
- Client shows the reply (without the raw block) and a button "Cargar contexto completo y responder de nuevo".
- User clicks; client re-sends the same user message with `contextScope: 'full'`; backend builds full context; AI streams a new reply with concrete suggestions (e.g. "These tasks likely belong to Core Platform: ..." or proposals).
- New assistant message is appended; conversation remains consistent.

---

## 8. Scroll to bottom on entering chat (same deliverable)

When the user opens the Copilot tab or switches to a session with existing messages, the chat must **scroll to the bottom** so the conversation end is in view.

- **CopilotChatWindow:** Add prop `sessionId?: string`. Add a `useEffect` with deps `[sessionId, messages.length, isStreaming]`: when `messages.length > 0 && !isStreaming`, after a short delay (e.g. 100ms) call `bottomRef.current?.scrollIntoView({ behavior: 'auto' })`. This runs on initial load and when switching sessions.
- **ContextCopilotClient:** Pass `sessionId={session?.id}` to `CopilotChatWindow`.

See also **docs/project-copilot/plans/copilot-mutations-and-scroll-plan.md** (Part B) for the same scroll behavior and for the separate feature "mutations (delete/edit with authorization)".

---

## 9. References

- Current context build: `lib/copilot/context.ts` — `buildProjectContext`, recentTasks slice(0,10), recentNotes slice(0,5).
- Chat API: `app/api/copilot/[projectId]/chat/route.ts` — body `sessionId`, `messages`; call to `buildProjectContext(projectId)`.
- Client send: `app/context/[projectId]/copilot/ContextCopilotClient.tsx` — fetch with `sessionId`, `messages`; stream handling; save assistant message and parse proposals.
- Proposals parser: `lib/copilot/parser.ts` — `parseProposals` and <<PROPOSALS>> block; same pattern for <<REQUEST_CONTEXT>>.
- Mutations and scroll plan: docs/project-copilot/plans/copilot-mutations-and-scroll-plan.md.
