# Handoff prompt: Copilot context permission (expand context on request)

**Use this prompt in a new Claude Code (or Cursor) session to implement the feature.**

---

## Copy-paste block for the AI

```
You are continuing work on the ClearQueue project (Next.js, Supabase, TypeScript). Your task is to implement the "Copilot context permission" feature: when the AI needs more project data to answer accurately (e.g. which existing tasks belong to a milestone), it can request permission; the user grants it with a button; the Copilot then receives full context and answers again.

## Repo rules (mandatory)

- Read and follow: .cursorrules, AGENTS.md, CONVENTIONS.md (repo root).
- Read docs/patterns/ as needed (server-actions, data-loading). Server actions: 'use server', requireAuth() first, revalidatePath after mutations. No createClient() in components or *Client.tsx.
- i18n: all new UI strings under copilot.* in locales/en.json and locales/es.json.
- After edits: npx prettier --write on changed files; fix lint errors.

## What is already in place

- Copilot chat: app/context/[projectId]/copilot/ (ContextCopilotClient, ContextCopilotFromCache). Messages sent to POST /api/copilot/[projectId]/chat with body { sessionId, messages }. buildProjectContext(projectId) in lib/copilot/context.ts builds the system prompt with 10 most recent tasks, 5 notes, 8 milestones. Streamed response is persisted as assistant message; parseProposals(fullText) extracts <<PROPOSALS>> and saves proposals. CopilotChatWindow and CopilotMessageBubble render messages and proposal cards.

## What you must implement

Follow the authoritative plan in this repo:

**docs/project-copilot/plans/copilot-context-permission-plan.md**

Execute in this order:

1. **Phase 1 — Backend: context scope and API**
   - lib/copilot/context.ts: Add optional second argument to buildProjectContext: `options?: { scope?: 'standard' | 'full' }`. Default scope 'standard' keeps current behavior (10 tasks, 5 notes, 8 milestones). When scope === 'full': include up to 80 tasks (title, status, milestone_id) sorted by updated_at desc; up to 20 notes; all milestones. Add a line in the context block when scope is full: "You have FULL visibility of the project: all tasks listed below with their status and milestone (if any). Use this to suggest which existing tasks belong to which milestone."
   - app/api/copilot/[projectId]/chat/route.ts: Parse request body for optional `contextScope: 'standard' | 'full'`. Call buildProjectContext(projectId, { scope: contextScope || 'standard' }).

2. **Phase 2 — System prompt: when to request context**
   - In lib/copilot/context.ts, when scope is 'standard', add to the context block (or SYSTEM_PROMPT_BASE) instructions for the AI: you only see 10 most recent tasks and 5 notes; when the user asks which existing tasks belong to a milestone or needs the full list, explain you have limited visibility and emit at the end of your response: <<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>> (or {"tasks":true,"notes":true} if notes are needed). Do not invent data. When scope is 'full', do not add this; the full-context block already says "You have FULL visibility".

3. **Phase 3 — Client: parse REQUEST_CONTEXT and grant button**
   - Add a parser for the new block: in lib/copilot/parser.ts (or a small lib/copilot/context-request.ts) add parseContextRequest(content: string): { tasks?: boolean; notes?: boolean } | null. Match <<REQUEST_CONTEXT>>(...)<</REQUEST_CONTEXT>> and JSON.parse the inner content. Optionally add stripContextRequestFromContent(content) to remove the block for display.
   - ContextCopilotClient: After streaming completes and assistant message is saved, run parseContextRequest on that message's content. If non-null, set state e.g. contextRequestMessageId = msg.id. Add a handler onRetryWithFullContext: build contextMessages as the same array that was used for the last request (last 20 messages ending with the last user message — do not include the assistant reply that requested context). POST to the chat API with { sessionId, messages: contextMessages, contextScope: 'full' }. Stream the response; when done, persist the new assistant message and append to messages; clear contextRequestMessageId.
   - CopilotChatWindow (or wherever assistant bubbles are rendered): For each assistant message, if contextRequestMessageId === msg.id, show below the bubble a banner (i18n: copilot.context_request_banner) and a button (i18n: copilot.context_request_btn). On click, call the handler passed from ContextCopilotClient (onRetryWithFullContext). When displaying assistant content, strip the <<REQUEST_CONTEXT>> block so the user doesn't see raw JSON.
   - Ensure the retry sends the same conversation history (ending with the user message that triggered the "need more context" reply); the API does not need the assistant message in the body.

4. **Phase 4 — i18n**
   - locales/en.json and locales/es.json: Add copilot.context_request_banner and copilot.context_request_btn (see plan for suggested text).

5. **Scroll to bottom on enter (same plan doc, section 8)**
   - CopilotChatWindow: Add prop sessionId?: string. useEffect with deps [sessionId, messages.length, isStreaming]: when messages.length > 0 && !isStreaming, after ~100ms call bottomRef.current?.scrollIntoView({ behavior: 'auto' }). ContextCopilotClient: pass sessionId={session?.id} to CopilotChatWindow.

6. **Tests and polish**
   - Add a unit test for parseContextRequest (valid block, invalid/missing block). Run npm run lint and npm run build.

## Key file references

- Plan: docs/project-copilot/plans/copilot-context-permission-plan.md
- buildProjectContext: lib/copilot/context.ts
- Chat route: app/api/copilot/[projectId]/chat/route.ts
- Client send and stream: app/context/[projectId]/copilot/ContextCopilotClient.tsx (fetch, stream, saveCopilotMessage, parseProposals)
- Parser: lib/copilot/parser.ts (parseProposals pattern for <<PROPOSALS>>)
- CopilotChatWindow: components/context/copilot/CopilotChatWindow.tsx

## Output format

When done, provide: (1) Summary of what was implemented; (2) List of files changed/created; (3) How to test (user flow); (4) Any follow-ups deferred.
```
