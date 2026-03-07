# Handoff prompt: Ejecutar todos los planes del Copilot

**Copia y pega el bloque siguiente en una nueva sesión de Claude Code (o Cursor) para que implemente todo el plan.**

---

## Prompt para Claude (copiar desde aquí)

```
You are continuing work on the ClearQueue project (Next.js, Supabase, TypeScript). Your task is to implement the full Copilot plan in two parts, in this order.

## Repo rules (mandatory)

- Read and follow: .cursorrules, AGENTS.md, CONVENTIONS.md (repo root). Read docs/patterns/ as needed.
- Server actions: 'use server', requireAuth() first, revalidatePath after mutations. No createClient() in components or *Client.tsx.
- i18n: all new UI strings under copilot.* in locales/en.json and locales/es.json.
- After edits: npx prettier --write on changed files; fix lint errors.

## What already exists

- Copilot: app/context/[projectId]/copilot/ (ContextCopilotClient, ContextCopilotFromCache). POST /api/copilot/[projectId]/chat with { sessionId, messages }. buildProjectContext(projectId) in lib/copilot/context.ts (10 tasks, 5 notes, 8 milestones). Proposals: task, note, milestone (create only). approveProposal calls RPC approve_copilot_proposal_atomic. CopilotProposalCard, CopilotChatWindow, parser in lib/copilot/parser.ts. Existing actions: deleteMilestone, updateMilestone, updateTask, deleteTask, notes CRUD in app/actions/.

---

## PART 1 — Context permission + scroll to bottom

Follow: **docs/project-copilot/plans/copilot-context-permission-plan.md**

1. **Backend context scope:** buildProjectContext(projectId, options?: { scope?: 'standard' | 'full' }). When scope === 'full': up to 80 tasks (title, status, milestone_id), 20 notes, all milestones. Add line "You have FULL visibility...". Chat route: read body.contextScope, pass to buildProjectContext.

2. **Prompt when standard:** When scope is 'standard', add instructions: you only see 10 tasks and 5 notes; when user needs full list (e.g. which tasks belong to a milestone), explain and emit <<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>> at end of response. When scope is full, do not add this.

3. **Client:** parseContextRequest(content) in lib/copilot/parser.ts (or context-request.ts) to parse <<REQUEST_CONTEXT>>(...)<</REQUEST_CONTEXT>>. stripContextRequestFromContent for display. ContextCopilotClient: after saving assistant message, if parseContextRequest returns non-null set contextRequestMessageId. Handler onRetryWithFullContext: send same contextMessages (ending with last user message) with contextScope: 'full'; stream; append new assistant message; clear contextRequestMessageId. CopilotChatWindow: when contextRequestMessageId === msg.id show banner + button (i18n: context_request_banner, context_request_btn); on click call onRetryWithFullContext. Strip REQUEST_CONTEXT block from displayed content.

4. **i18n:** copilot.context_request_banner, copilot.context_request_btn (en + es).

5. **Scroll to bottom on enter:** CopilotChatWindow: add prop sessionId?: string. useEffect deps [sessionId, messages.length, isStreaming]: when messages.length > 0 && !isStreaming, after ~100ms bottomRef.current?.scrollIntoView({ behavior: 'auto' }). ContextCopilotClient: pass sessionId={session?.id} to CopilotChatWindow.

6. **Test:** Unit test for parseContextRequest. Run lint and build.

---

## PART 2 — Mutations (delete/edit with authorization) + scroll

Follow: **docs/project-copilot/plans/copilot-mutations-and-scroll-plan.md**

If scroll was already done in Part 1, skip Part B below; otherwise do Part B first.

**Part B — Scroll (if not done):** Same as step 5 above (sessionId prop + useEffect scroll).

**Part A — Mutations:**

1. **Migration:** Extend copilot_proposals.type CHECK to include: delete_milestone, update_milestone, delete_task, update_task, delete_note, update_note. See 20260306200000_copilot_proposals_add_milestone_type.sql for current CHECK.

2. **Schema (lib/copilot/schema.ts):** Payload types for each mutation (entity_id required; update_* with optional fields). Extend ProposalType and payload union. Optional entity_title for display.

3. **Parser (lib/copilot/parser.ts):** In parseProposals handle new types; validate entity_id (UUID); for updates validate allowed fields.

4. **System prompt (lib/copilot/context.ts):** AI can propose mutations (delete/update); document payload shapes; entity_id must come from context. Example delete_milestone: { "type": "delete_milestone", "entity_id": "<uuid>", "entity_title": "Phase 1" }.

5. **Approve flow (app/context/[projectId]/copilot/actions.ts):** In approveProposal: if type is mutation (delete_*, update_*), do NOT call create RPC. Fetch proposal, then call existing server action (deleteMilestone, updateMilestone, updateTask, deleteTask, deleteNote, updateNote). Then update proposal row: status = 'approved', reviewed_at = now(), created_entity_id = entity_id. Revalidate paths. For update_task build FormData from payload and call updateTask.

6. **CopilotProposalCard:** For mutation types show label/body (e.g. "Eliminar hito: [entity_title]"). Same Approve/Reject; on Approve same onApproveProposal(proposalId).

7. **i18n:** copilot.proposal_delete_milestone, copilot.proposal_update_milestone, copilot.proposal_delete_task, copilot.proposal_update_task, copilot.proposal_delete_note, copilot.proposal_update_note (en + es).

---

## Key file references

- Plans: docs/project-copilot/plans/copilot-context-permission-plan.md, docs/project-copilot/plans/copilot-mutations-and-scroll-plan.md
- lib/copilot/context.ts, lib/copilot/parser.ts, lib/copilot/schema.ts
- app/api/copilot/[projectId]/chat/route.ts
- app/context/[projectId]/copilot/ContextCopilotClient.tsx, actions.ts
- components/context/copilot/CopilotChatWindow.tsx, CopilotProposalCard.tsx
- app/actions/milestones.ts, app/actions/tasks.ts, app/actions/notes.ts
- supabase/migrations: 20260306120002_copilot_proposals.sql, 20260306200000_copilot_proposals_add_milestone_type.sql

## Output format

When done: (1) Summary of what was implemented in Part 1 and Part 2; (2) Full list of files changed/created; (3) How to test each feature (user flows); (4) Any follow-ups deferred.
```

---

## Cómo usarlo

1. Abre este archivo: `docs/project-copilot/plans/HANDOFF_PROMPT_FULL_COPILOT_PLANS.md`
2. Copia **todo** el contenido que está entre las líneas que empiezan por ``` (incluidas las dos líneas de ```).
3. Pégalo como **primer mensaje** en una nueva conversación de Claude Code.
4. Claude ejecutará primero Part 1 (contexto expandible + scroll) y luego Part 2 (mutaciones + scroll si faltaba).
5. Al final pedirá: resumen, archivos tocados, cómo probar y follow-ups.
