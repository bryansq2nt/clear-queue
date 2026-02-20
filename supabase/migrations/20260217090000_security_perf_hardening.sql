-- Security/perf hardening: project-scoped task ordering, transactional business cascade,
-- and composite indexes for dominant dashboard/billing queries.

CREATE OR REPLACE FUNCTION public.create_task_atomic(
  in_project_id uuid,
  in_title text,
  in_status public.task_status DEFAULT 'next',
  in_priority integer DEFAULT 3,
  in_due_date date DEFAULT NULL,
  in_notes text DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_row public.tasks%ROWTYPE;
BEGIN
  IF in_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF COALESCE(BTRIM(in_title), '') = '' THEN
    RAISE EXCEPTION 'title is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = in_project_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Project not found or not owned by authenticated user';
  END IF;

  INSERT INTO public.tasks (project_id,title,status,priority,due_date,notes,order_index)
  VALUES (
    in_project_id,
    BTRIM(in_title),
    in_status,
    COALESCE(in_priority, 3),
    in_due_date,
    NULLIF(BTRIM(in_notes), ''),
    (
      SELECT COALESCE(MAX(t.order_index), -1) + 1
      FROM public.tasks t
      WHERE t.project_id = in_project_id
        AND t.status = in_status
    )
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_task_atomic(
  in_task_id uuid,
  in_new_status public.task_status,
  in_new_order_index integer
)
RETURNS public.tasks
LANGUAGE plpgsql
AS $$
DECLARE
  current_task public.tasks%ROWTYPE;
  result_task public.tasks%ROWTYPE;
BEGIN
  SELECT t.* INTO current_task
  FROM public.tasks t
  JOIN public.projects p ON p.id = t.project_id
  WHERE t.id = in_task_id
    AND p.owner_id = auth.uid();

  IF current_task.id IS NULL THEN
    RAISE EXCEPTION 'Task not found or not owned by authenticated user';
  END IF;

  IF current_task.status <> in_new_status THEN
    UPDATE public.tasks
    SET order_index = order_index - 1, updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = current_task.status
      AND order_index > current_task.order_index;

    UPDATE public.tasks
    SET order_index = order_index + 1, updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index >= in_new_order_index
      AND id <> current_task.id;
  ELSIF in_new_order_index > current_task.order_index THEN
    UPDATE public.tasks
    SET order_index = order_index - 1, updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index > current_task.order_index
      AND order_index <= in_new_order_index
      AND id <> current_task.id;
  ELSIF in_new_order_index < current_task.order_index THEN
    UPDATE public.tasks
    SET order_index = order_index + 1, updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index >= in_new_order_index
      AND order_index < current_task.order_index
      AND id <> current_task.id;
  END IF;

  UPDATE public.tasks
  SET status = in_new_status,
      order_index = in_new_order_index,
      updated_at = NOW()
  WHERE id = current_task.id
  RETURNING * INTO result_task;

  RETURN result_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_business_client_atomic(
  in_business_id uuid,
  in_owner_id uuid,
  in_new_client_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = in_business_id
      AND b.owner_id = in_owner_id
  ) THEN
    RAISE EXCEPTION 'Business not found or not owned by authenticated user';
  END IF;

  UPDATE public.businesses
  SET client_id = in_new_client_id, updated_at = NOW()
  WHERE id = in_business_id
    AND owner_id = in_owner_id;

  UPDATE public.projects
  SET client_id = in_new_client_id, updated_at = NOW()
  WHERE business_id = in_business_id
    AND owner_id = in_owner_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_business_client_atomic(uuid, uuid, uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_tasks_project_status_order
  ON public.tasks(project_id, status, order_index);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_due
  ON public.tasks(owner_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_priority_updated
  ON public.tasks(owner_id, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_billings_owner_status_due
  ON public.billings(owner_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_projects_owner_category_updated
  ON public.projects(owner_id, category, updated_at DESC);
