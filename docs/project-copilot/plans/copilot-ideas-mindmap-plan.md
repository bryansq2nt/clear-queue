# Project Copilot: Mind maps from Copilot → Ideas module

**Created:** 2026-03-06  
**Status:** Planning  
**Goal:** The Copilot can propose **mind maps** (idea boards with nodes and connections) so that what the user says and what the Copilot connects can be **represented as a mind map / roadmap**. The Ideas module is **fed from Copilot**: when the user approves a mind map proposal, a new board (or existing board) gets the ideas, positions, and connections created in the Ideas module — same format as when the user creates a mind map manually.

---

## 1. User and product intent

- The user asks the Copilot for things like: "I want to finish the Teams module: invite users, create teams, assign tasks to teams or specific people, create roles in a team. Help me design the roadmap." Or: "Represent this plan as a mind map."
- The Copilot should be able to **propose a mind map**: a set of **nodes** (ideas: title, optional description) and **connections** (from node A to node B, with optional type), optionally with **positions** (x, y) for layout. On **approve**, the system creates (or updates) an **idea board** in the Ideas module with those ideas and connections — so the user sees the roadmap or plan as a visual mind map in Ideas, and can edit it there.
- So: **Ideas module can be fed from Copilot.** Same data model (idea_boards, ideas, idea_board_items, idea_connections); the only new part is the Copilot proposal type and the approve flow that creates these entities.

---

## 2. Current Ideas / mind map model (brief)

- **idea_boards:** id, owner_id, name, description. A "mind map" in the UI is one board.
- **ideas:** id, owner_id, title, description. Each node on the mind map is an idea.
- **idea_board_items:** board_id, idea_id, x, y. Places an idea on a board at position (x, y).
- **idea_connections:** from_idea_id, to_idea_id, type. Edge between two ideas (same owner).
- **idea_board_project_links** (or similar): links a board to a project so it appears under that project's Ideas tab. See `createBoardWithProjectAction` and idea_boards.project_id if present.
- Actions: createBoard, createIdea, createBoardWithProjectAction, add idea to board (idea_board_items), createConnection. See `app/actions/idea-boards.ts`, `app/actions/ideas.ts`, `lib/idea-graph/`, `app/actions/idea-canvas-connection.ts`, `app/actions/idea-canvas-batch.ts`.

---

## 3. Design overview

| Concept               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mind map proposal** | A new proposal type, e.g. `mind_map` or `idea_board`. Payload describes one board and its content: board name (and optional description), list of nodes (each: title, optional description, optional x/y for layout), list of edges (from_idea_id by reference — e.g. index or temp id — to_idea_id, type).                                                                                                                                                                                                                                                                                                                                                        |
| **Approval**          | When the user approves, the server: (1) creates the board (with project_id so it appears in the project's Ideas tab); (2) creates each idea (title, description); (3) creates idea_board_items (board_id, idea_id, x, y); (4) creates idea_connections (from_idea_id, to_idea_id, type). Order matters: ideas must exist before we can reference them in board_items and connections. So: create board → create all ideas → add all board_items → add all connections. This is multi-step; use an **atomic RPC** (e.g. `create_mind_map_from_copilot_atomic`) or a server action that runs in sequence and rolls back on failure (or RPC preferred for atomicity). |
| **AI output**         | The Copilot emits a proposal block with type `mind_map` and a payload that the parser can validate. The AI must have been instructed (system prompt) to output this structure when the user asks for a roadmap, a mind map, or a visual plan.                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 4. Payload shape (mind_map proposal)

Example structure (to be refined in implementation):

```json
{
  "type": "mind_map",
  "board_name": "Teams module roadmap",
  "board_description": "Optional description of the board",
  "project_id": "<uuid of current project>",
  "nodes": [
    {
      "temp_id": "n1",
      "title": "Teams module",
      "description": null,
      "x": 0,
      "y": 0
    },
    {
      "temp_id": "n2",
      "title": "Invite users",
      "description": null,
      "x": -100,
      "y": 50
    },
    {
      "temp_id": "n3",
      "title": "Create teams",
      "description": null,
      "x": 100,
      "y": 50
    }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "type": "includes" },
    { "from": "n1", "to": "n3", "type": "includes" }
  ]
}
```

- **temp_id** is a string key (e.g. "n1", "n2") used only within the payload to reference nodes in edges. On approve, we create ideas in order, then map temp_id → real idea id, then create connections using real ids.
- **x, y** can be optional; if missing, the canvas or a layout algorithm can assign default positions later (or 0,0 and let the user drag).

---

## 5. Implementation plan (high level)

1. **Schema & parser:** Add proposal type `mind_map` (or `idea_board`). Define `MindMapProposalPayload` with board_name, board_description?, project_id, nodes[], edges[]. Parser validates and extracts. DB: extend `copilot_proposals.type` CHECK to include the new type.
2. **System prompt:** Instruct the AI that when the user asks for a roadmap, a mind map, or a visual plan of connected items, it can emit a `mind_map` proposal with nodes (title, optional description, optional x/y) and edges (from temp_id, to temp_id, type). List valid connection types if the app has a fixed set.
3. **Approve flow:** Option A — new RPC `create_mind_map_from_copilot_atomic`: in one transaction, insert board (with project_id), insert ideas, insert idea_board_items (with resolved idea ids), insert idea_connections (with resolved idea ids). Option B — server action that calls existing createBoardWithProjectAction, then createIdea for each node, then add items to board, then createConnection for each edge (and update proposal status). Option B is simpler but not atomic; Option A is preferred for consistency. If the codebase has no RPC for "create board + ideas + items + connections", add one.
4. **UI:** CopilotProposalCard for type `mind_map`: show board name and a short summary (e.g. "X nodes, Y connections"). Approve/Reject as usual. On approve, redirect or link to the new board in Ideas (`/context/${projectId}/ideas/board/${boardId}`).
5. **Ideas module:** No change to the Ideas UI itself — it already displays boards and canvases. The new board created from Copilot will appear in the list like any other board.
6. **i18n:** Labels for "Mind map" / "Mapa mental" proposal and "View in Ideas" link.

---

## 6. File checklist (summary)

| Area                           | Action                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration                      | Extend copilot_proposals.type to include `mind_map` (or `idea_board`).                                                                                     |
| Schema (lib/copilot/schema.ts) | Add MindMapProposalPayload; extend ProposalType and payload union.                                                                                         |
| Parser                         | Parse and validate mind_map payload (nodes with temp_id, title; edges from/to temp_id, type).                                                              |
| Context/prompt                 | Instruct AI to emit mind_map when user asks for roadmap / mind map / visual plan.                                                                          |
| Approve flow                   | New RPC or server action: create board (with project), create ideas, create board_items, create connections; update proposal. Revalidate Ideas cache/path. |
| CopilotProposalCard            | Render mind_map proposal (board name, summary); Approve/Reject; link to board on success.                                                                  |
| i18n                           | copilot.proposal_mind_map, copilot.created_view_ideas (or similar).                                                                                        |

---

## 7. References

- Idea schema: supabase/migrations/20260119200000_idea_graph.sql (ideas, idea_connections, idea_boards, idea_board_items).
- Actions: app/actions/idea-boards.ts (createBoardWithProjectAction), app/actions/ideas.ts (createIdea), idea-canvas-connection.ts, idea-canvas-batch.ts.
- Ideas UI: app/context/[projectId]/ideas/, IdeaGraphCanvas, ContextIdeasClient.
- Copilot proposals: lib/copilot/schema.ts, parser.ts, approve flow in actions.ts and RPC approve_copilot_proposal_atomic.
