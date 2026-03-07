# Handoff prompt: Copilot mutations (delete/edit) + scroll to bottom

**Use this prompt in a Claude Code (or Cursor) session to implement mutations and scroll.**

---

## Copy-paste block for the AI

```
You are continuing work on the ClearQueue project (Next.js, Supabase, TypeScript). Your task is to implement two things for the Project Copilot:

1. **Mutations with authorization:** The Copilot can propose **deletions and edits** (milestones, tasks, notes). Each proposal is shown as a card; the user must click Approve before any mutation runs. No execution without authorization.

2. **Scroll to bottom on enter:** When the user opens the Copilot chat or switches to a session, the conversation view must scroll to the bottom so the end of the conversation is visible.

## Repo rules (mandatory)

- Follow .cursorrules, AGENTS.md, CONVENTIONS.md. Server actions: requireAuth() first, revalidatePath after mutations. No createClient() in components.
- i18n: all new UI strings under copilot.* in locales (en + es).
- Run npx prettier on changed files; fix lint errors.

## What already exists

- Copilot proposals for create: task, note, milestone. Schema in lib/copilot/schema.ts; parser in lib/copilot/parser.ts; approveProposal in app/context/[projectId]/copilot/actions.ts (calls RPC approve_copilot_proposal_atomic for creates). CopilotProposalCard shows task/note/milestone and Approve/Reject.
- Existing server actions: deleteMilestone, updateMilestone (app/actions/milestones.ts); updateTask, deleteTask (app/actions/tasks.ts); delete note, update note (app/actions/notes.ts or equivalent).
- CopilotChatWindow has bottomRef and containerRef; auto-scroll only when new content and user near bottom. ContextCopilotClient passes messages, streamingContent, etc. to CopilotChatWindow.

## What you must implement

Follow the plan in this repo:

**docs/project-copilot/plans/copilot-mutations-and-scroll-plan.md**

### Part B — Scroll to bottom (do this first, it's small)

- CopilotChatWindow: Add optional prop `sessionId?: string`. Add useEffect with deps `[sessionId, messages.length, isStreaming]`: when `messages.length > 0 && !isStreaming`, after a short delay (setTimeout 100ms or requestAnimationFrame) call `bottomRef.current?.scrollIntoView({ behavior: 'auto' })`. So when we first load messages or switch session, we scroll to the end.
- ContextCopilotClient: Pass `sessionId={session?.id}` (or session?.id if session is the object) to CopilotChatWindow.

### Part A — Mutations (delete/edit with authorization)

1. **Migration:** Extend copilot_proposals.type CHECK to include: delete_milestone, update_milestone, delete_task, update_task, delete_note, update_note. See existing CHECK in supabase/migrations/20260306200000_copilot_proposals_add_milestone_type.sql (or 20260306120002_copilot_proposals.sql).

2. **Schema** (lib/copilot/schema.ts): Add payload types for each mutation (entity_id required; for update_* include optional fields to change). Extend ProposalType and CopilotProposal.payload union.

3. **Parser** (lib/copilot/parser.ts): In parseProposals, handle the new types; validate entity_id (UUID); for update payloads validate allowed fields. Include optional entity_title in payloads for card display (AI can emit it).

4. **System prompt** (lib/copilot/context.ts): Add instructions that the AI can propose mutations (delete/update) for existing entities; document payload shapes; state that entity_id must come from context (milestone ids are in context; for task/note, full context or current list must include ids). Example: { "type": "delete_milestone", "entity_id": "<uuid>", "entity_title": "Phase 1" }.

5. **Approve flow** (app/context/[projectId]/copilot/actions.ts): In approveProposal, after fetching the proposal (or in a separate path): if type is one of the mutation types, do NOT call the create RPC. Instead, get proposal payload, verify entity_id, then call the existing server action (deleteMilestone, updateMilestone, updateTask, deleteTask, etc.). Then update the proposal row to status = 'approved', reviewed_at = now(), created_entity_id = entity_id. Revalidate paths for board, notes, milestones. For update_task build FormData from payload and call updateTask(taskId, formData). Use existing actions from app/actions/milestones.ts, app/actions/tasks.ts, app/actions/notes.ts.

6. **CopilotProposalCard:** For mutation types, render a different label and body (e.g. "Eliminar hito: [entity_title]" or "Actualizar tarea: [entity_title] → estado = done"). Use payload.entity_title if present for display. Same Approve/Reject buttons; on Approve, same onApproveProposal(proposalId).

7. **i18n:** Add keys for mutation labels (e.g. copilot.proposal_delete_milestone, copilot.proposal_update_task, etc.) in en and es.

## Key file references

- Plan: docs/project-copilot/plans/copilot-mutations-and-scroll-plan.md
- Proposals table and type: supabase/migrations/20260306120002_copilot_proposals.sql, 20260306200000_copilot_proposals_add_milestone_type.sql
- approveProposal: app/context/[projectId]/copilot/actions.ts
- deleteMilestone, updateMilestone: app/actions/milestones.ts
- updateTask, deleteTask: app/actions/tasks.ts
- Notes actions: app/actions/notes.ts (or equivalent)
- CopilotProposalCard: components/context/copilot/CopilotProposalCard.tsx
- CopilotChatWindow: components/context/copilot/CopilotChatWindow.tsx

## Output format

When done: (1) Summary; (2) List of files changed; (3) How to test (user flow for mutations and for scroll); (4) Follow-ups if any.
```
