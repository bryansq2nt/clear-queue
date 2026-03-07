# Project Copilot: Mutations (delete/edit with authorization) and scroll-to-bottom

**Created:** 2026-03-06  
**Status:** Planning  
**Goals:**

1. Give the Copilot the ability to **propose deletions and edits** (milestones, tasks, notes). The user **must always approve** before any mutation runs — no execution without authorization.
2. When entering the Copilot chat, **scroll the conversation to the end** so the user sees where the conversation left off.

---

## Part A — Mutations (delete and edit with authorization)

### A.1. Requirement

Today the Copilot can only **propose new** entities (task, note, milestone). The user asks "can you delete the milestones you created?" and the AI correctly says it cannot — it has no way to propose a _mutation_ that the user can approve.

**Goal:** The Copilot can propose **actions** such as:

- Delete milestone X
- Edit task Y (e.g. set status to done, or set milestone_id to Z)
- Delete task Y
- Edit note Y (e.g. update title or content)
- Delete note Y

Each proposal is shown as a card with a clear description (e.g. "Eliminar hito: Phase 1" or "Marcar tarea 'Setup repo' como completada"). The user clicks **Approve** (authorization) and only then does the system execute the delete or update. **No mutation runs without explicit user approval.**

### A.2. Design overview

| Concept               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mutation proposal** | A proposal whose type is a mutation: `delete_milestone`, `update_milestone`, `delete_task`, `update_task`, `delete_note`, `update_note`. Payload includes at least `entity_id`; for updates, payload includes the fields to change.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Authorization**     | Same as today: the user sees the proposal card and must click Approve (or Reject). Only on Approve do we call the existing server action (e.g. `deleteMilestone`, `updateTask`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Entity ids**        | The AI needs entity ids to propose mutations. With **standard** context it has milestone ids (already in prompt). For tasks and notes it only has titles in standard context — so either (1) we only allow mutation proposals when the AI has **full** context (where we include task/note ids), or (2) we allow "edit task by title" and resolve id server-side (risky if duplicate titles). Recommended: (1) — mutation proposals for tasks/notes are only valid when the AI has been given full context (or we include ids in standard context for the last 10 tasks / 5 notes). For milestones we can allow delete/update with standard context since we already send milestone ids. |

### A.3. Proposal types and payloads

Extend `copilot_proposals.type` to allow (in addition to `task`, `note`, `milestone`):

- `delete_milestone` — payload: `{ entity_id: string }` (milestone id)
- `update_milestone` — payload: `{ entity_id: string, title?: string, description?: string | null }`
- `delete_task` — payload: `{ entity_id: string }`
- `update_task` — payload: `{ entity_id: string, status?: string, priority?: number, milestone_id?: string | null, title?: string, notes?: string | null, tags?: string | null, due_date?: string | null }` (only include fields to change)
- `delete_note` — payload: `{ entity_id: string }`
- `update_note` — payload: `{ entity_id: string, title?: string, content?: string }`

All mutations require `entity_id`. The AI must have received that id in the system prompt (milestones are always sent with id; for tasks/notes, full context or a small id list in standard context).

### A.4. System prompt changes

- Tell the AI it can **propose** deletions and updates, not only creations. It must never execute them — it only emits proposal blocks. The user approves in the UI.
- When proposing a mutation, the AI must include the correct `type` and `payload` with `entity_id` and (for update) the fields to change.
- Example for delete milestone: `{ "type": "delete_milestone", "entity_id": "<uuid>" }`. Example for update task: `{ "type": "update_task", "entity_id": "<uuid>", "status": "done" }`.
- Extend the <<PROPOSALS>> rules: valid types include `delete_milestone`, `update_milestone`, `delete_task`, `update_task`, `delete_note`, `update_note` with the payload shapes above. The AI should only propose mutations when it has the entity id (from context).

### A.5. Backend

- **Migration:** Extend `copilot_proposals.type` CHECK to include the new types (or use a single CHECK that allows all of them).
- **Approve flow:** When the user approves a proposal:
  - If type is create (`task`, `note`, `milestone`): keep current behavior (existing RPC or actions).
  - If type is mutation: do **not** call the create RPC. Instead, call the existing server action:
    - `delete_milestone` → `deleteMilestone(payload.entity_id)` from `app/actions/milestones.ts`
    - `update_milestone` → `updateMilestone(payload.entity_id, { title, description })` from `app/actions/milestones.ts`
    - `delete_task` → `deleteTask(payload.entity_id)` (or the existing delete task action)
    - `update_task` → `updateTask(payload.entity_id, FormData built from payload)` from `app/actions/tasks.ts`
    - `delete_note` → existing delete note action
    - `update_note` → existing update note action
  - After success: mark proposal as approved, set `created_entity_id` to the entity id (for delete we can set it to the deleted id for consistency), revalidate paths (board, notes, milestones).
- **Implementation options:** (1) Extend the existing `approveProposal` and the RPC `approve_copilot_proposal_atomic` to handle mutation types (the RPC would call different logic per type). (2) Or: keep the RPC for creates only; add a new server action `approveCopilotMutationProposal(proposalId)` that reads the proposal, checks type, and calls the corresponding delete/update action. Option (2) avoids touching the atomic RPC and reuses existing actions; option (1) keeps one approval path. Recommendation: (1) — extend the RPC so one "Approve" flow handles everything. The RPC would have branches: if type in ('task','note','milestone') then create as now; elsif type = 'delete_milestone' then call delete on milestones; etc. But RPC cannot call another RPC or app code easily — it's SQL. So we do (2): in the **server action** `approveProposal`, when the proposal type is a mutation, we don't call the RPC; we fetch the proposal row, then call `deleteMilestone` / `updateTask` / etc., then update the proposal row to approved. So we need two paths in the client: approve create (existing) vs approve mutation (new). Or we keep one button: approveProposal(proposalId). In the server action we first fetch the proposal; if type is mutation we call the right action and then update the proposal status; if type is create we call the existing RPC. So one entry point, different backend behavior.

### A.6. Parser and schema

- **Schema** (`lib/copilot/schema.ts`): Add payload types for each mutation (e.g. `DeleteMilestonePayload`, `UpdateTaskPayload`) and extend `ProposalType` and `CopilotProposal.payload` union.
- **Parser** (`lib/copilot/parser.ts`): In `parseProposals`, handle the new types; validate `entity_id` (UUID) and for updates the allowed fields. Push validated mutation proposals into the result array.
- **Saving proposals:** Same as today — when we save proposals after the assistant message, we insert rows with type and payload. The DB allows the new types.

### A.7. UI (proposal cards)

- **CopilotProposalCard:** For mutation types, show a different label and summary:
  - `delete_milestone`: "Eliminar hito: [title]" (we need to show title — either from payload if we ask the AI to include it, or fetch milestone by id; simpler: AI includes `title` in payload for display: `{ entity_id, title }`).
  - `update_milestone`: "Editar hito: [title] → ..."
  - `delete_task`: "Eliminar tarea: [title]"
  - `update_task`: "Actualizar tarea: [title] → estado = done" (or list changed fields)
  - Same for note.
- So mutation payloads should include an optional **display** field like `entity_title` so the card can show "Eliminar hito: Phase 1" without an extra fetch. The AI can copy the title from context.
- Approve/Reject buttons work the same; on Approve we call the same `approveProposal(proposalId)` which now handles mutations in the server action.

### A.8. File checklist (mutations)

| File                                                 | Action                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration                                            | Extend `copilot_proposals.type` CHECK to include `delete_milestone`, `update_milestone`, `delete_task`, `update_task`, `delete_note`, `update_note`.                                                                               |
| `lib/copilot/schema.ts`                              | Add mutation payload types and extend `ProposalType` and payload union.                                                                                                                                                            |
| `lib/copilot/parser.ts`                              | Parse and validate mutation proposals (entity_id required; for update, allowed fields only).                                                                                                                                       |
| `lib/copilot/context.ts`                             | Extend system prompt: AI can propose mutations; document payload shapes and that entity_id must come from context.                                                                                                                 |
| `app/context/[projectId]/copilot/actions.ts`         | In `approveProposal`: if proposal type is mutation, fetch proposal, call the corresponding server action (deleteMilestone, updateTask, etc.), then update proposal status to approved and set created_entity_id. Revalidate paths. |
| `components/context/copilot/CopilotProposalCard.tsx` | For mutation types, render label and description (e.g. "Eliminar hito: …"); use payload.entity_title or entity_id for display. Same Approve/Reject.                                                                                |
| `locales`                                            | i18n for mutation labels (e.g. copilot.proposal_delete_milestone, copilot.proposal_update_task).                                                                                                                                   |

### A.9. Security and validation

- Server must verify that the entity (milestone/task/note) belongs to the same project as the proposal and the user owns the project. Existing actions (deleteMilestone, updateTask, etc.) already scope by ownership; we only pass entity_id. So no extra check if we use those actions.
- Validate payload: entity_id must be UUID; for update_task, status must be valid, priority 1–5, etc. Use the same validation as the existing update actions.

---

## Part B — Scroll to bottom when entering the chat

### B.1. Requirement

When the user opens the Copilot tab or switches to a session that already has messages, the chat view should **scroll to the bottom** so the end of the conversation is visible. Today, auto-scroll only runs when `messages` or `streamingContent` change and the user is "near the bottom" (within 120px). On initial load with many messages, the view can stay at the top.

### B.2. Design

- **When to scroll:** (1) On initial mount of the chat window when there are messages (or when the selected session / messages array is first set). (2) Optionally when the user switches to a different session and messages are replaced.
- **How:** In `CopilotChatWindow`, use a `useEffect` that runs when `messages` (or the key that represents "this conversation") first has length > 0. In that effect, after a brief tick (so the DOM has rendered), set `containerRef.current.scrollTop = containerRef.current.scrollHeight` or call `bottomRef.current?.scrollIntoView({ behavior: 'auto' })`. Use `behavior: 'auto'` on initial load so it doesn’t animate; we can use `smooth` only when new content streams in (already done).
- **Dependency:** The effect should run when `messages.length` or `selectedSessionId` (or equivalent) changes in a way that means "we just loaded a conversation". So dependencies: e.g. `[messages.length, sessionKey]` or a prop like `scrollToBottomKey` that the parent sets when the session changes. Simplest: run when `messages` reference or length changes and it’s not streaming — but that would also run after every new message. So: run once when the component mounts with messages.length > 0, and optionally when the parent passes a "session changed" key so we scroll when switching sessions.

**Recommended implementation:**

- In `CopilotChatWindow`, add a `useEffect` with dependencies `[messages.length]` (or the list of message ids if we want to scroll when messages are replaced, e.g. session switch). Inside: if `messages.length > 0 && !isStreaming`, use `requestAnimationFrame` or `setTimeout(..., 0)` then `bottomRef.current?.scrollIntoView({ behavior: 'auto' })`. This way when we first render with messages (e.g. after loading a session), we scroll to bottom. When the user sends a new message and the list updates, we might scroll again — that’s acceptable. To scroll only on "enter" or "session change", the parent can pass a prop like `scrollToBottomTrigger: number` (incremented when session changes or on first load) and the effect depends on that.
- Simpler: effect with `[messages.length, isStreaming]`. When `messages.length` goes from 0 to N, or when we have messages and we're not streaming, scroll to bottom. That covers "entered chat with existing messages". When a new message is appended, messages.length changes and we scroll — which is the same as current "scroll when near bottom" but we might always scroll. To avoid scrolling on every new assistant message when the user has scrolled up, we could only run the "scroll to bottom" when the container was already near the bottom (current behavior) for streaming, and for the initial load use a separate effect that runs once when `messages.length > 0` on mount. So: two behaviors: (1) On mount / session change: scroll to bottom once. (2) During streaming / new content: scroll only if user is near bottom (existing logic). Implement (1) with an effect that runs when a "conversation key" or initial messages load; (2) keep as is.

**Minimal change:** In `CopilotChatWindow`, add an effect that runs when `messages` (by reference or by a stable "session id" + length) indicates we just loaded this conversation. For example, the parent could pass `sessionId` as a key or as a prop. When `sessionId` or the first time we have `messages.length > 0`, scroll to bottom. Implementation: `useEffect(() => { if (messages.length > 0 && !isStreaming) { const t = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 100); return () => clearTimeout(t); } }, [sessionId, messages.length, isStreaming]);` — but we don't have sessionId in CopilotChatWindow. So the parent ContextCopilotClient passes `sessionId` to CopilotChatWindow; when sessionId or messages.length changes, we scroll. So add prop `sessionId?: string` to CopilotChatWindow and effect deps `[sessionId, messages.length, isStreaming]`. When the user switches session, sessionId changes and we scroll to bottom of the new conversation. When they first load and messages.length becomes > 0, we scroll.

### B.3. File checklist (scroll)

| File                                                       | Action                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/context/copilot/CopilotChatWindow.tsx`         | Add prop `sessionId?: string` (or `scrollToBottomTrigger?: number`). Add `useEffect` that runs when `sessionId` or `messages.length` changes and `messages.length > 0` and `!isStreaming`: after a short delay, `bottomRef.current?.scrollIntoView({ behavior: 'auto' })`. |
| `app/context/[projectId]/copilot/ContextCopilotClient.tsx` | Pass `sessionId={session?.id}` (or equivalent) to `CopilotChatWindow`.                                                                                                                                                                                                     |

### B.4. Edge cases

- Empty conversation: no scroll (no bottomRef needed).
- Streaming in progress: don’t override scroll with "initial" scroll; the existing "scroll if near bottom" handles streaming. So the initial scroll only runs when `!isStreaming`.

---

## References

- Existing proposals: `lib/copilot/schema.ts` (ProposalType, payloads), `lib/copilot/parser.ts`, `CopilotProposalCard.tsx`.
- Approve flow: `app/context/[projectId]/copilot/actions.ts` (`approveProposal`), RPC `approve_copilot_proposal_atomic`.
- Milestone/task/note actions: `app/actions/milestones.ts` (deleteMilestone, updateMilestone), `app/actions/tasks.ts` (updateTask, deleteTask), notes actions.
- Chat window: `components/context/copilot/CopilotChatWindow.tsx` (bottomRef, containerRef, scroll effect).
