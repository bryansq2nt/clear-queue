-- =============================================================================
-- Phase 3: Task activity log
--
-- Append-only audit trail: who changed what on each task and when.
-- Records are written by server actions after every task mutation.
--
-- Design:
--   action      — event type (created, updated, status_changed, assigned, unassigned, deleted)
--   changed_fields — JSONB: { "field": { "from": oldValue, "to": newValue } }
--                  NULL for events where there are no field deltas (created, deleted).
-- =============================================================================

CREATE TABLE public.task_activity_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id),
  action         TEXT        NOT NULL
                   CHECK (action IN (
                     'created', 'updated', 'status_changed',
                     'assigned', 'unassigned', 'deleted'
                   )),
  changed_fields JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by task (e.g. show task history)
CREATE INDEX idx_task_activity_log_task
  ON public.task_activity_log (task_id, created_at DESC);

-- Project-level reporting (e.g. recent activity feed)
CREATE INDEX idx_task_activity_log_project
  ON public.task_activity_log (project_id, created_at DESC);

ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

-- Project members can read the log
CREATE POLICY "task_activity_log_select"
  ON public.task_activity_log FOR SELECT
  USING (public.is_project_member(project_id));

-- Any authenticated user can insert (write path goes through server actions only)
-- Server actions call requireCan() before writing, so this policy is the
-- DB-level backstop — auth.uid() must be non-null.
CREATE POLICY "task_activity_log_insert"
  ON public.task_activity_log FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- No UPDATE or DELETE policies — this is an append-only audit trail.
-- Rows are only removed via ON DELETE CASCADE from tasks/projects.
