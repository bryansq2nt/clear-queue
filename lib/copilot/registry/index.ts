import { tasksCapabilities } from './modules/tasks';
import { notesCapabilities } from './modules/notes';
import { milestonesCapabilities } from './modules/milestones';
import { ideasCapabilities } from './modules/ideas';
import { linksCapabilities } from './modules/links';
import { todosCapabilities } from './modules/todos';
import { billingsCapabilities } from './modules/billings';
import { budgetsCapabilities } from './modules/budgets';
import { clientsCapabilities } from './modules/clients';
import type { CopilotModuleCapability } from './types';

export type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from './types';

/**
 * Central registry of all Copilot module capabilities.
 * Keyed by proposal type string (e.g. 'task', 'delete_note').
 *
 * To add a new module:
 * 1. Create lib/copilot/registry/modules/<name>.ts
 * 2. Import and spread it here
 */
export const COPILOT_REGISTRY = new Map<string, CopilotModuleCapability>(
  [
    ...tasksCapabilities,
    ...notesCapabilities,
    ...milestonesCapabilities,
    ...ideasCapabilities,
    ...linksCapabilities,
    ...todosCapabilities,
    ...billingsCapabilities,
    ...budgetsCapabilities,
    ...clientsCapabilities,
  ].map((c) => [c.type, c])
);
