-- Add tags column to tasks (max 3 tags, stored as comma-separated text; no separate table).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS tags text DEFAULT NULL;

COMMENT ON COLUMN public.tasks.tags IS 'Up to 3 tags, comma-separated (e.g. bug, dev, new feature).';

-- Replace create_task_atomic with 7-arg version (add in_tags). Drop old 6-arg version first.
DROP FUNCTION IF EXISTS public.create_task_atomic(uuid, text, public.task_status, integer, date, text);

CREATE OR REPLACE FUNCTION public.create_task_atomic(
  in_project_id uuid,
  in_title text,
  in_status public.task_status DEFAULT 'next',
  in_priority integer DEFAULT 3,
  in_due_date date DEFAULT NULL,
  in_notes text DEFAULT NULL,
  in_tags text DEFAULT NULL
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

  INSERT INTO public.tasks (
    project_id,
    title,
    status,
    priority,
    due_date,
    notes,
    tags,
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
    (
      SELECT COALESCE(MAX(t.order_index), -1) + 1
      FROM public.tasks t
      WHERE t.status = in_status
    )
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_atomic(uuid, text, public.task_status, integer, date, text, text) TO authenticated;
