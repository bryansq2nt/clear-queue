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
