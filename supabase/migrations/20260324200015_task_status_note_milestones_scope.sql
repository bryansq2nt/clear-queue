-- =============================================================================
-- 1. Add status_note to task_activity_log
--    Stores the optional note the assignee writes when changing task status.
--
-- 2. Add created_by to milestones for read-scope enforcement.
--    team_member (own scope) sees only milestones they created.
--    team_manager (team scope) sees milestones from their team's members.
--    owner / project_manager (project scope) see all milestones.
-- =============================================================================

-- 1. task_activity_log — optional human note for status_changed events
ALTER TABLE public.task_activity_log
  ADD COLUMN IF NOT EXISTS status_note TEXT;

COMMENT ON COLUMN public.task_activity_log.status_note IS
  'Optional note written by the assignee when changing task status.';

-- 2. milestones — track creator for read-scope enforcement
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS created_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.milestones.created_by IS
  'User who created the milestone. Used to scope milestone visibility by role.';

-- Backfill: existing milestones are attributed to the project owner.
UPDATE public.milestones m
SET created_by = p.owner_id
FROM public.projects p
WHERE p.id = m.project_id
  AND m.created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_milestones_project_created_by
  ON public.milestones (project_id, created_by);
