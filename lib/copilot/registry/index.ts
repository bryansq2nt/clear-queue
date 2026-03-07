import { tasksCapabilities } from './modules/tasks';
import { notesCapabilities } from './modules/notes';
import { milestonesCapabilities } from './modules/milestones';
import { ideasCapabilities } from './modules/ideas';
import { linksCapabilities } from './modules/links';
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
  ].map((c) => [c.type, c])
);
