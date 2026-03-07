/**
 * Milestone types for UI and server actions.
 * DB table: public.milestones (see supabase/migrations/20260306170000_milestones.sql).
 */

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: MilestoneStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneWithProgress extends Milestone {
  tasks_total: number;
  tasks_done: number;
}

export interface CreateMilestoneInput {
  title: string;
  description?: string | null;
  sort_order?: number;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string | null;
  sort_order?: number;
  status?: MilestoneStatus;
}
