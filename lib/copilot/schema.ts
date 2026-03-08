// Copilot module TypeScript types.
// Contract version: 2.0
// Tables: copilot_sessions, copilot_messages, copilot_proposals
// See docs/project-copilot/contracts/project-copilot-json-contract.md

export type CopilotSessionStatus = 'active' | 'archived';
export type CopilotMessageRole = 'user' | 'assistant';
export type CopilotProposalStatus = 'pending' | 'approved' | 'rejected';
export type ProposalType =
  | 'task'
  | 'note'
  | 'milestone'
  | 'delete_milestone'
  | 'update_milestone'
  | 'delete_task'
  | 'update_task'
  | 'delete_note'
  | 'update_note'
  | 'mind_map';

export interface CopilotSession {
  id: string;
  project_id: string;
  owner_id: string;
  title: string | null;
  status: CopilotSessionStatus;
  created_at: string;
  updated_at: string;
}

export interface CopilotMessage {
  id: string;
  session_id: string;
  project_id: string;
  owner_id: string;
  role: CopilotMessageRole;
  content: string;
  token_count: number | null;
  created_at: string;
}

export interface CopilotProposal {
  id: string;
  session_id: string;
  message_id: string | null;
  project_id: string;
  owner_id: string;
  type: ProposalType;
  payload:
    | TaskProposalPayload
    | NoteProposalPayload
    | MilestoneProposalPayload
    | DeleteMilestonePayload
    | UpdateMilestonePayload
    | DeleteTaskPayload
    | UpdateTaskPayload
    | DeleteNotePayload
    | UpdateNotePayload
    | MindMapProposalPayload;
  status: CopilotProposalStatus;
  created_entity_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Create payloads ──────────────────────────────────────────────────────────

// Task proposal payload — maps to tasks.Insert (project_id and owner_id injected server-side)
export interface TaskProposalPayload {
  type: 'task';
  title: string;
  status?: string;
  priority?: number;
  notes?: string | null;
  tags?: string | null;
  due_date?: string | null;
  milestone_id?: string | null;
  milestone_title?: string | null;
}

// Note proposal payload — maps to notes.Insert (project_id and owner_id injected server-side)
export interface NoteProposalPayload {
  type: 'note';
  title: string;
  content: string;
}

// Milestone proposal payload — maps to milestones.Insert (project_id injected server-side)
export interface MilestoneProposalPayload {
  type: 'milestone';
  title: string;
  description?: string | null;
}

// ─── Mutation payloads ────────────────────────────────────────────────────────

export interface DeleteMilestonePayload {
  type: 'delete_milestone';
  entity_id: string;
  entity_title?: string;
}

export interface UpdateMilestonePayload {
  type: 'update_milestone';
  entity_id: string;
  entity_title?: string;
  title?: string;
  description?: string | null;
}

export interface DeleteTaskPayload {
  type: 'delete_task';
  entity_id: string;
  entity_title?: string;
}

export interface UpdateTaskPayload {
  type: 'update_task';
  entity_id: string;
  entity_title?: string;
  title?: string;
  status?: string;
  priority?: number;
  milestone_id?: string | null;
  notes?: string | null;
  tags?: string | null;
  due_date?: string | null;
}

export interface DeleteNotePayload {
  type: 'delete_note';
  entity_id: string;
  entity_title?: string;
}

export interface UpdateNotePayload {
  type: 'update_note';
  entity_id: string;
  entity_title?: string;
  title?: string;
  content?: string;
}

// ─── Mind map payload ─────────────────────────────────────────────────────────

/** A single node in a mind map proposal. temp_id is a local key used only to reference this node in edges. */
export interface MindMapNode {
  temp_id: string;
  title: string;
  description?: string | null;
  /** Optional canvas position. Defaults to a radial layout when absent. */
  x?: number;
  y?: number;
}

/** A directed edge between two nodes, referenced by temp_id. */
export interface MindMapEdge {
  from: string;
  to: string;
  /** Connection type string (e.g. "relates_to", "includes", "depends_on"). Defaults to "relates_to". */
  type?: string;
}

/**
 * Mind map proposal — creates an idea board with nodes (ideas) and connections.
 * On approve: board → ideas → idea_board_items → idea_connections are all created.
 */
export interface MindMapProposalPayload {
  type: 'mind_map';
  board_name: string;
  board_description?: string | null;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

// ─── Todo payloads ────────────────────────────────────────────────────────────

/** Create a new todo item in a specific list. list_id must be a UUID from the todos context. */
export interface TodoItemProposalPayload {
  type: 'todo_item';
  list_id: string;
  list_title?: string;
  content: string;
  due_date?: string | null;
}

export interface ToggleTodoPayload {
  type: 'toggle_todo';
  entity_id: string;
  entity_title?: string;
  /** Current done state before toggling — used for display only. */
  is_done?: boolean;
}

export interface DeleteTodoItemPayload {
  type: 'delete_todo_item';
  entity_id: string;
  entity_title?: string;
}

// ─── Links payload ────────────────────────────────────────────────────────────

/** Valid values for the link_type field (mirrors project_link_type_enum). */
export type CopilotLinkType =
  | 'environment'
  | 'tool'
  | 'resource'
  | 'social'
  | 'reference'
  | 'other';

/** Create a new project link. category_name is resolved to category_id server-side. */
export interface LinkProposalPayload {
  type: 'link';
  title: string;
  url: string;
  category_name?: string | null;
  description?: string | null;
  link_type?: CopilotLinkType | null;
}

export interface DeleteLinkPayload {
  type: 'delete_link';
  entity_id: string;
  entity_title?: string;
}

export interface UpdateLinkPayload {
  type: 'update_link';
  entity_id: string;
  entity_title?: string;
  title?: string;
  url?: string;
  category_name?: string | null;
  description?: string | null;
}

// ─── ParsedProposal union ─────────────────────────────────────────────────────

/** Union of all validated proposal payload types returned by the parser. */
export type ParsedProposal =
  | TaskProposalPayload
  | NoteProposalPayload
  | MilestoneProposalPayload
  | DeleteMilestonePayload
  | UpdateMilestonePayload
  | DeleteTaskPayload
  | UpdateTaskPayload
  | DeleteNotePayload
  | UpdateNotePayload
  | MindMapProposalPayload
  | LinkProposalPayload
  | DeleteLinkPayload
  | UpdateLinkPayload
  | TodoItemProposalPayload
  | ToggleTodoPayload
  | DeleteTodoItemPayload;

// ─── Shared types ─────────────────────────────────────────────────────────────

// Shape of a message sent to the API route from the client
export interface CopilotChatMessage {
  role: CopilotMessageRole;
  content: string;
}

// Rate limit error response from the API route
export interface RateLimitError {
  error: 'rate_limit_exceeded';
  limitType: 'daily' | 'hourly';
  resetAt: string;
}
