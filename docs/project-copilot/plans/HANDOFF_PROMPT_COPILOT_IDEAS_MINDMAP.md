# Handoff: Copilot → Ideas (mind maps) + prompt para el chat

**Dos cosas:** (1) Texto para pegar en el chat del Copilot. (2) Prompt para Claude Code que diseña y ejecuta el plan.

---

#

---

## 2. Prompt para Claude Code (diseñar plan + ejecutar)

Copia y pega el bloque siguiente en una nueva sesión de Claude Code para que **diseñe el plan** (o refine el existente en docs/project-copilot/plans/copilot-ideas-mindmap-plan.md) y **luego lo ejecute**.

```
You are working on the ClearQueue project (Next.js, Supabase, TypeScript). Your task has two parts:

**Part 1 — Design (or refine) the plan**
Read docs/project-copilot/plans/copilot-ideas-mindmap-plan.md. The goal is: the Project Copilot can propose **mind maps** (idea boards with nodes and connections) so that what the user says and what the Copilot connects can be represented as a **mind map / roadmap**. The **Ideas module** must be **fed from Copilot**: when the user approves a mind map proposal, the system creates an idea board in the Ideas module (same model: idea_boards, ideas, idea_board_items, idea_connections) so the user sees the roadmap in the Ideas tab and can edit it there.

If anything in the plan is vague or missing (e.g. exact payload shape, RPC name, how to resolve temp_id to idea ids), decide it and document it in the plan or in code comments. Then proceed to Part 2.

**Part 2 — Implement**
Execute the plan:

1. **DB:** Migration to add proposal type `mind_map` (or `idea_board`) to copilot_proposals.type CHECK.
2. **Schema (lib/copilot/schema.ts):** Add MindMapProposalPayload (board_name, board_description?, project_id, nodes with temp_id/title/description/x/y, edges with from/to temp_id and type). Extend ProposalType and CopilotProposal.payload union.
3. **Parser (lib/copilot/parser.ts):** Parse and validate mind_map proposals; validate nodes and edges structure.
4. **System prompt (lib/copilot/context.ts):** When the user asks for a roadmap, a mind map, or a visual plan, the AI can emit a mind_map proposal with nodes and edges (use temp_id in nodes and reference them in edges). Document the payload format in the prompt.
5. **Approve flow:** Implement creation of the mind map from an approved proposal. Prefer an atomic RPC (e.g. create_mind_map_from_copilot_atomic) that: creates the board with project_id; creates each idea; creates idea_board_items (board_id, idea_id, x, y); creates idea_connections (from_idea_id, to_idea_id, type) using resolved idea ids from temp_id order. If RPC is too heavy, use a server action that runs the same steps in sequence (createBoardWithProjectAction or equivalent, then create ideas, add board items, create connections) and updates the proposal status. Revalidate Ideas paths and invalidate Ideas cache for the project.
6. **approveProposal (app/context/[projectId]/copilot/actions.ts):** When type is mind_map, call the new RPC or server action instead of the create RPC; then mark proposal approved and set created_entity_id to the new board id.
7. **CopilotProposalCard:** For type mind_map, show board name and summary (e.g. "X nodes, Y connections"). Approve/Reject. On approved, link to /context/${projectId}/ideas/board/${boardId}.
8. **i18n:** copilot.proposal_mind_map, copilot.created_view_ideas (or similar) in en and es.

Follow .cursorrules and AGENTS.md. Use explicit .select(), requireAuth(), revalidatePath. Run npx prettier on changed files and fix lint.

**Key references:**
- Plan: docs/project-copilot/plans/copilot-ideas-mindmap-plan.md
- Idea schema: supabase/migrations/20260119200000_idea_graph.sql, 20260216000000_idea_boards_project_and_edit.sql
- idea_boards has project_id. idea_board_items: board_id, idea_id, x, y. idea_connections: from_idea_id, to_idea_id, type.
- app/actions/idea-boards.ts (createBoardWithProjectAction), app/actions/ideas.ts, lib/idea-graph/

**Output:** (1) Short summary of design decisions if you changed the plan. (2) Summary of what was implemented. (3) List of files changed/created. (4) How to test (user flow). (5) Follow-ups if any.
```
