-- Atomic mutations for task/todo creation and todo toggle.

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
    order_index
  )
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
      WHERE t.status = in_status
    )
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_todo_item_atomic(
  in_list_id uuid,
  in_content text,
  in_due_date date DEFAULT NULL
)
RETURNS public.todo_items
LANGUAGE plpgsql
AS $$
DECLARE
  owner_uuid uuid;
  inserted_row public.todo_items%ROWTYPE;
BEGIN
  IF in_list_id IS NULL THEN
    RAISE EXCEPTION 'list_id is required';
  END IF;

  IF COALESCE(BTRIM(in_content), '') = '' THEN
    RAISE EXCEPTION 'content is required';
  END IF;

  SELECT tl.owner_id
    INTO owner_uuid
  FROM public.todo_lists tl
  WHERE tl.id = in_list_id
    AND tl.owner_id = auth.uid();

  IF owner_uuid IS NULL THEN
    RAISE EXCEPTION 'Todo list not found or not owned by authenticated user';
  END IF;

  INSERT INTO public.todo_items (
    owner_id,
    list_id,
    content,
    due_date,
    position
  )
  VALUES (
    owner_uuid,
    in_list_id,
    BTRIM(in_content),
    in_due_date,
    (
      SELECT COALESCE(MAX(ti.position), -1) + 1
      FROM public.todo_items ti
      WHERE ti.list_id = in_list_id
    )
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_todo_item_atomic(in_item_id uuid)
RETURNS public.todo_items
LANGUAGE plpgsql
AS $$
DECLARE
  updated_row public.todo_items%ROWTYPE;
BEGIN
  IF in_item_id IS NULL THEN
    RAISE EXCEPTION 'item_id is required';
  END IF;

  UPDATE public.todo_items ti
  SET is_done = NOT ti.is_done,
      updated_at = NOW()
  WHERE ti.id = in_item_id
    AND ti.owner_id = auth.uid()
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Todo item not found or not owned by authenticated user';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_atomic(uuid, text, public.task_status, integer, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_todo_item_atomic(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_todo_item_atomic(uuid) TO authenticated;
