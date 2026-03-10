'use client';

import type React from 'react';
import {
  CheckSquare,
  FileText,
  Flag,
  Folder,
  FolderPlus,
  GitFork,
  Trash2,
  Pencil,
  Link2,
  ListTodo,
  CheckSquare2,
  Receipt,
  Wallet,
  User,
} from 'lucide-react';

type LucideIcon = React.ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

export interface ProposalTypeConfig {
  labelKey: string;
  Icon: LucideIcon;
  cardVariant: 'create' | 'delete' | 'update' | 'graph';
  /** Returns the link to navigate to after approval, or null if none. */
  getViewLink?: (
    projectId: string,
    createdEntityId: string | null
  ) => string | null;
  viewLinkLabelKey?: string;
  /** Returns the display title from the payload. Defaults: mutation → entity_title, create → title. */
  getTitle?: (payload: unknown) => string;
}

const FALLBACK_CONFIG: ProposalTypeConfig = {
  labelKey: '',
  Icon: FileText,
  cardVariant: 'create',
};

export const PROPOSAL_TYPE_CONFIG: Record<string, ProposalTypeConfig> = {
  task: {
    labelKey: 'copilot.proposal_task',
    Icon: CheckSquare,
    cardVariant: 'create',
    getViewLink: (projectId) => `/context/${projectId}/board`,
    viewLinkLabelKey: 'copilot.created_view_board',
  },
  note: {
    labelKey: 'copilot.proposal_note',
    Icon: FileText,
    cardVariant: 'create',
    getViewLink: (projectId, entityId) =>
      entityId
        ? `/context/${projectId}/notes/${entityId}`
        : `/context/${projectId}/notes`,
    viewLinkLabelKey: 'copilot.created_view_notes',
  },
  milestone: {
    labelKey: 'copilot.proposal_milestone',
    Icon: Flag,
    cardVariant: 'create',
    getViewLink: (projectId) => `/context/${projectId}/milestones`,
    viewLinkLabelKey: 'copilot.created_view_milestones',
  },
  delete_milestone: {
    labelKey: 'copilot.proposal_delete_milestone',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/milestones`,
    viewLinkLabelKey: 'copilot.created_view_milestones',
  },
  update_milestone: {
    labelKey: 'copilot.proposal_update_milestone',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/milestones`,
    viewLinkLabelKey: 'copilot.created_view_milestones',
  },
  delete_task: {
    labelKey: 'copilot.proposal_delete_task',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/board`,
    viewLinkLabelKey: 'copilot.created_view_board',
  },
  update_task: {
    labelKey: 'copilot.proposal_update_task',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/board`,
    viewLinkLabelKey: 'copilot.created_view_board',
  },
  delete_note: {
    labelKey: 'copilot.proposal_delete_note',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/notes`,
    viewLinkLabelKey: 'copilot.created_view_notes',
  },
  update_note: {
    labelKey: 'copilot.proposal_update_note',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/notes`,
    viewLinkLabelKey: 'copilot.created_view_notes',
  },
  note_folder: {
    labelKey: 'copilot.proposal_note_folder',
    Icon: FolderPlus,
    cardVariant: 'create',
    getTitle: (payload) => (payload as { name: string }).name,
    getViewLink: (projectId) => `/context/${projectId}/notes`,
    viewLinkLabelKey: 'copilot.created_view_notes',
  },
  update_note_folder: {
    labelKey: 'copilot.proposal_update_note_folder',
    Icon: Pencil,
    cardVariant: 'update',
    getTitle: (payload) =>
      (payload as { entity_title?: string }).entity_title ??
      (payload as { name?: string }).name ??
      '',
    getViewLink: (projectId) => `/context/${projectId}/notes`,
    viewLinkLabelKey: 'copilot.created_view_notes',
  },
  delete_note_folder: {
    labelKey: 'copilot.proposal_delete_note_folder',
    Icon: Trash2,
    cardVariant: 'delete',
    getTitle: (payload) =>
      (payload as { entity_title?: string }).entity_title ?? '',
    getViewLink: (projectId) => `/context/${projectId}/notes`,
    viewLinkLabelKey: 'copilot.created_view_notes',
  },
  mind_map: {
    labelKey: 'copilot.proposal_mind_map',
    Icon: GitFork,
    cardVariant: 'graph',
    getTitle: (payload) => (payload as { board_name: string }).board_name,
    getViewLink: (projectId, entityId) =>
      entityId
        ? `/context/${projectId}/ideas/board/${entityId}`
        : `/context/${projectId}/ideas`,
    viewLinkLabelKey: 'copilot.created_view_ideas',
  },
  link: {
    labelKey: 'copilot.proposal_link',
    Icon: Link2,
    cardVariant: 'create',
    getViewLink: (projectId) => `/context/${projectId}/links`,
    viewLinkLabelKey: 'copilot.created_view_links',
  },
  delete_link: {
    labelKey: 'copilot.proposal_delete_link',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/links`,
    viewLinkLabelKey: 'copilot.created_view_links',
  },
  update_link: {
    labelKey: 'copilot.proposal_update_link',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/links`,
    viewLinkLabelKey: 'copilot.created_view_links',
  },
  todo_item: {
    labelKey: 'copilot.proposal_todo_item',
    Icon: ListTodo,
    cardVariant: 'create',
    getTitle: (payload) =>
      (payload as { content: string; list_title?: string }).list_title
        ? `${(payload as { content: string; list_title?: string }).list_title}: ${(payload as { content: string }).content}`
        : (payload as { content: string }).content,
    getViewLink: (projectId) => `/todo/project/${projectId}`,
    viewLinkLabelKey: 'copilot.created_view_todos',
  },
  toggle_todo: {
    labelKey: 'copilot.proposal_toggle_todo',
    Icon: CheckSquare2,
    cardVariant: 'update',
    getViewLink: (projectId) => `/todo/project/${projectId}`,
    viewLinkLabelKey: 'copilot.created_view_todos',
  },
  delete_todo_item: {
    labelKey: 'copilot.proposal_delete_todo_item',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/todo/project/${projectId}`,
    viewLinkLabelKey: 'copilot.created_view_todos',
  },
  billing: {
    labelKey: 'copilot.proposal_billing',
    Icon: Receipt,
    cardVariant: 'create',
    getViewLink: (projectId) => `/context/${projectId}/billings`,
    viewLinkLabelKey: 'copilot.created_view_billings',
  },
  update_billing: {
    labelKey: 'copilot.proposal_update_billing',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/billings`,
    viewLinkLabelKey: 'copilot.created_view_billings',
  },
  delete_billing: {
    labelKey: 'copilot.proposal_delete_billing',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/billings`,
    viewLinkLabelKey: 'copilot.created_view_billings',
  },
  billing_category: {
    labelKey: 'copilot.proposal_billing_category',
    Icon: Folder,
    cardVariant: 'create',
    getTitle: (payload) => (payload as { name: string }).name,
    getViewLink: (projectId) => `/context/${projectId}/billings`,
    viewLinkLabelKey: 'copilot.created_view_billings',
  },
  update_billing_category: {
    labelKey: 'copilot.proposal_update_billing_category',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/billings`,
    viewLinkLabelKey: 'copilot.created_view_billings',
  },
  delete_billing_category: {
    labelKey: 'copilot.proposal_delete_billing_category',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/billings`,
    viewLinkLabelKey: 'copilot.created_view_billings',
  },
  budget: {
    labelKey: 'copilot.proposal_budget',
    Icon: Wallet,
    cardVariant: 'create',
    getTitle: (payload) => (payload as { name: string }).name,
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  update_budget: {
    labelKey: 'copilot.proposal_update_budget',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  delete_budget: {
    labelKey: 'copilot.proposal_delete_budget',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  budget_category: {
    labelKey: 'copilot.proposal_budget_category',
    Icon: Folder,
    cardVariant: 'create',
    getTitle: (payload) => (payload as { name: string }).name,
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  update_budget_category: {
    labelKey: 'copilot.proposal_update_budget_category',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  delete_budget_category: {
    labelKey: 'copilot.proposal_delete_budget_category',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  budget_item: {
    labelKey: 'copilot.proposal_budget_item',
    Icon: ListTodo,
    cardVariant: 'create',
    getTitle: (payload) => (payload as { name: string }).name,
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  update_budget_item: {
    labelKey: 'copilot.proposal_update_budget_item',
    Icon: Pencil,
    cardVariant: 'update',
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  delete_budget_item: {
    labelKey: 'copilot.proposal_delete_budget_item',
    Icon: Trash2,
    cardVariant: 'delete',
    getViewLink: (projectId) => `/context/${projectId}/budgets`,
    viewLinkLabelKey: 'copilot.created_view_budgets',
  },
  client: {
    labelKey: 'copilot.proposal_client',
    Icon: User,
    cardVariant: 'create',
    getViewLink: () => `/clients`,
    viewLinkLabelKey: 'copilot.created_view_clients',
  },
};

export function getProposalTypeConfig(type: string): ProposalTypeConfig {
  return PROPOSAL_TYPE_CONFIG[type] ?? { ...FALLBACK_CONFIG, labelKey: type };
}
