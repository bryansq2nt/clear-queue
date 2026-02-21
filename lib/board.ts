import type { Database } from '@/lib/supabase/types';

export type TaskStatus = Database['public']['Tables']['tasks']['Row']['status'];

/** Board column statuses; must match KanbanBoard STATUSES. */
export const BOARD_STATUSES: TaskStatus[] = [
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
];

export const INITIAL_TASKS_PER_COLUMN = 5;
export const LOAD_MORE_TASKS_PER_COLUMN = 5;

export type BoardInitialData = {
  project: Database['public']['Tables']['projects']['Row'];
  counts: Record<TaskStatus, number>;
  tasksByStatus: Record<
    TaskStatus,
    Database['public']['Tables']['tasks']['Row'][]
  >;
};

const MAX_TAGS = 3;

/** Parse task.tags string into array of up to 3 trimmed non-empty tags. */
export function parseTaskTags(tags: string | null): string[] {
  if (!tags || typeof tags !== 'string') return [];
  return tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

/** Normalize user input to stored tags string: trim, split by comma, take max 3, rejoin. */
export function normalizeTagsForSave(input: string): string {
  const arr = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);
  return arr.join(', ');
}
