-- ============================================================
-- Migration: add nullable attribution columns
-- tasks:            created_by, assigned_to, updated_by
-- milestones:       created_by, completed_by
-- copilot_proposals: approved_by, rejected_by
-- All columns are nullable FKs to auth.users — zero data loss.
-- ============================================================

-- tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_assigned_to ON public.tasks (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- milestones
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- copilot_proposals
ALTER TABLE public.copilot_proposals
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
