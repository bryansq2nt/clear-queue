-- Add in_milestone_id to create_task_atomic so new tasks can be linked to a milestone.
-- See docs/milestones/README.md

DROP FUNCTION IF EXISTS public.create_task_atomic(uuid, text, public.task_status, integer, date, text, text);

CREATE OR REPLACE FUNCTION public.create_task_atomic(
  in_project_id uuid,
  in_title text,
  in_status public.task_status DEFAULT 'next',
  in_priority integer DEFAULT 3,
  in_due_date date DEFAULT NULL,
  in_notes text DEFAULT NULL,
  in_tags text DEFAULT NULL,
  in_milestone_id uuid DEFAULT NULL
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
    SELECT 1
    FROM public.projects p
    WHERE p.id = in_project_id
      AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Project not found or not owned by authenticated user';
  END IF;

  IF in_milestone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.milestones m
    WHERE m.id = in_milestone_id AND m.project_id = in_project_id
  ) THEN
    RAISE EXCEPTION 'Milestone not found or does not belong to project';
  END IF;

  INSERT INTO public.tasks (
    project_id,
    title,
    status,
    priority,
    due_date,
    notes,
    tags,
    milestone_id,
    order_index
  )
  VALUES (
    in_project_id,
    BTRIM(in_title),
    in_status,
    COALESCE(in_priority, 3),
    in_due_date,
    NULLIF(BTRIM(in_notes), ''),
    NULLIF(BTRIM(in_tags), ''),
    in_milestone_id,
    (
      SELECT COALESCE(MIN(t.order_index), 0) - 1
      FROM public.tasks t
      WHERE t.project_id = in_project_id
        AND t.status = in_status
    )
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_atomic(uuid, text, public.task_status, integer, date, text, text, uuid) TO authenticated;
