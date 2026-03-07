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
  | 'update_note';

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
    | UpdateNotePayload;
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
