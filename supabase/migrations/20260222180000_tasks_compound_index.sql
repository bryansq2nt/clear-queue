-- TD-15: Add compound index on tasks(project_id, status, order_index).
-- Kanban column queries filter by project_id + status and sort by order_index.
-- move_task_atomic peer-shift UPDATEs also filter on all three columns.
-- Without this index Postgres performs a full RLS-filtered scan + sort on every
-- column load and every drag-and-drop reorder.

CREATE INDEX IF NOT EXISTS idx_tasks_project_status_order
  ON public.tasks (project_id, status, order_index);
