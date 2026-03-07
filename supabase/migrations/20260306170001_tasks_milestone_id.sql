-- Link tasks to milestones. ON DELETE SET NULL so deleting a milestone unlinks its tasks.
-- See docs/milestones/README.md

ALTER TABLE public.tasks
  ADD COLUMN milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_milestone_id
  ON public.tasks (milestone_id);
