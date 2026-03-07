# Handoff prompt: Implement Copilot + Milestones

**Use this prompt in a new Claude Code (or Cursor) session so it can implement the feature from scratch.**

---

## Instructions for the AI

Copy the entire block below into your next message to the AI that will implement the feature.

---

```
You are continuing work on the ClearQueue project (Next.js, Supabase, TypeScript). Your task is to implement the "Copilot + Milestones" feature so the AI Project Copilot can create milestones from chat and assign tasks to milestones.

## Repo rules (mandatory)

- Read and follow: .cursorrules, AGENTS.md, CONVENTIONS.md (in repo root).
- Before implementing: read the relevant pattern from docs/patterns/ (server-actions.md, database-queries.md, transactions.md, context-session-cache.md as needed).
- Server actions: 'use server', requireAuth() first, explicit .select() columns, revalidatePath after mutations, verb-first names without "Action" suffix.
- Multi-step writes: use a Postgres RPC with _atomic suffix; no client-side multi-step writes.
- No createClient() from @/lib/supabase/client in components or *Client.tsx; use server actions only.
- Loading states: shimmer skeletons, no spinners or "Loading...".
- i18n: all new UI strings under copilot.* in locales/en.json and locales/es.json.
- After edits: run npx prettier --write on changed files; fix any lint errors.

## What is already done (do not redo)

- **Milestones module:** Table milestones exists; tasks.milestone_id exists. CRUD in app/actions/milestones.ts. UI: app/context/[projectId]/milestones/ (ContextMilestonesClient, create/edit/delete/complete/reopen). create_task_atomic (8-arg) accepts in_milestone_id. RPCs: complete_milestone_atomic, reopen_milestone_atomic.
- **Copilot (current):** Chat in app/context/[projectId]/copilot/. Proposals are task or note only. Parser: lib/copilot/parser.ts (parseProposals, <<PROPOSALS>> block). Schema: lib/copilot/schema.ts (TaskProposalPayload, NoteProposalPayload, ProposalType = 'task' | 'note'). Approve flow: approveProposal in app/context/[projectId]/copilot/actions.ts calls RPC approve_copilot_proposal_atomic (supabase/migrations/20260306140000_approve_copilot_proposal_atomic.sql). UI: components/context/copilot/CopilotProposalCard.tsx shows task/note only. System prompt: lib/copilot/context.ts buildProjectContext (no milestones in context yet).

## What you must implement

Follow the **authoritative plan** in this repo:

**docs/project-copilot/plans/copilot-milestones-feature-plan.md**

Execute in this order:

1. **Phase 1 — Schema and DB**
   - New migration: allow type = 'milestone' in copilot_proposals (ALTER CHECK to include 'milestone'). See existing CHECK in supabase/migrations/20260306120002_copilot_proposals.sql.
   - lib/copilot/schema.ts: Add MilestoneProposalPayload; add ProposalType 'milestone'; extend TaskProposalPayload with optional milestone_id and milestone_title; update CopilotProposal.payload union.
   - lib/copilot/parser.ts: Add validateMilestoneShape; in parseProposals handle type === 'milestone'; in validateTaskShape add optional milestone_id (UUID string) and milestone_title (string). Cap title/description lengths in milestone validation (e.g. 200 / 2000).

2. **Phase 2 — AI context and prompt**
   - lib/copilot/context.ts: In buildProjectContext, fetch milestones (use listMilestones from app/actions/milestones.ts — it's cached). Add a "Project milestones" section to the system prompt with id and title per milestone (or "No milestones yet."). Extend the <<PROPOSALS>> example and rules in SYSTEM_PROMPT_BASE to include: (a) milestone proposal format { "type": "milestone", "title": "...", "description": "..." }; (b) task with optional "milestone_id" or "milestone_title"; (c) rule that milestone proposals can be included and tasks may reference milestones by title or id.

3. **Phase 3 — Backend: RPC and actions**
   - New migration: replace approve_copilot_proposal_atomic so it: (a) has a branch for type = 'milestone': validate title, get next sort_order for project, INSERT into milestones (project_id, title, description, sort_order), set created_entity_id to new milestone id, return type 'milestone'; (b) in the task branch: read optional payload->>'milestone_id' (UUID); if null, read payload->>'milestone_title' and SELECT id FROM milestones WHERE project_id = rec.project_id AND TRIM(title) = TRIM(v_milestone_title) LIMIT 1; pass resolved or provided UUID to create_task_atomic as 8th arg (in_milestone_id). Use the 8-arg create_task_atomic signature from supabase/migrations/20260306170002_create_task_atomic_milestone_id.sql.
   - app/context/[projectId]/copilot/actions.ts: Extend ApproveProposalResult so data.type is 'task' | 'note' | 'milestone'. After successful approve, revalidatePath for /context/${projectId}/milestones. If the client uses ContextDataCache, invalidate { type: 'milestones', projectId } (see ContextBoardClient for how cache.invalidate is used).

4. **Phase 4 — UI**
   - components/context/copilot/CopilotProposalCard.tsx: Handle proposal.type === 'milestone' and payload as MilestoneProposalPayload. Show icon (e.g. Flag), label "Milestone", title, optional description. Approve/Reject same as task/note. When approved, createdLink to /context/${proposal.project_id}/milestones. Add i18n keys: copilot.proposal_milestone, copilot.created_view_milestones (or similar) in en and es.

5. **Tests and polish**
   - lib/copilot/parser.test.ts: Add tests for parsing milestone proposals (valid/invalid) and tasks with milestone_id and milestone_title.
   - Run npm run lint and npm run build; fix any errors.

## Key file references

- Plan (full detail): docs/project-copilot/plans/copilot-milestones-feature-plan.md
- Proposals table: supabase/migrations/20260306120002_copilot_proposals.sql
- Approve RPC: supabase/migrations/20260306140000_approve_copilot_proposal_atomic.sql
- create_task_atomic (8 args): supabase/migrations/20260306170002_create_task_atomic_milestone_id.sql
- listMilestones: app/actions/milestones.ts
- Context cache: app/context/ContextDataCache.tsx (CacheKey type includes milestones)
- Copilot actions: app/context/[projectId]/copilot/actions.ts

## Output format

When you finish, provide: (1) Summary of what was implemented; (2) List of all files changed/created; (3) How to test (steps); (4) Any follow-ups or optional items from the plan you deferred.
```

---

## After pasting

- The AI should open and follow **docs/project-copilot/plans/copilot-milestones-feature-plan.md** as the single source of truth for phases and file checklist.
- If the AI asks for clarification, point it to the plan doc and to the key file references listed above.
- You can add: "Implement phase by phase and confirm after each phase before moving to the next," if you want incremental checkpoints.
