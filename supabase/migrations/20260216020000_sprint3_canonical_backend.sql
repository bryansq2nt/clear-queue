-- Sprint 3: canonical task movement and efficient todo aggregation.

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
  IF in_task_id IS NULL THEN
    RAISE EXCEPTION 'task_id is required';
  END IF;

  IF in_new_status IS NULL THEN
    RAISE EXCEPTION 'new_status is required';
  END IF;

  IF in_new_order_index IS NULL OR in_new_order_index < 0 THEN
    RAISE EXCEPTION 'new_order_index must be >= 0';
  END IF;

  SELECT t.*
    INTO current_task
  FROM public.tasks t
  JOIN public.projects p ON p.id = t.project_id
  WHERE t.id = in_task_id
    AND p.owner_id = auth.uid();

  IF current_task.id IS NULL THEN
    RAISE EXCEPTION 'Task not found or not owned by authenticated user';
  END IF;

  IF current_task.status <> in_new_status THEN
    UPDATE public.tasks
    SET order_index = order_index - 1,
        updated_at = NOW()
    WHERE status = current_task.status
      AND order_index > current_task.order_index;

    UPDATE public.tasks
    SET order_index = order_index + 1,
        updated_at = NOW()
    WHERE status = in_new_status
      AND order_index >= in_new_order_index
      AND id <> current_task.id;
  ELSIF in_new_order_index > current_task.order_index THEN
    UPDATE public.tasks
    SET order_index = order_index - 1,
        updated_at = NOW()
    WHERE status = in_new_status
      AND order_index > current_task.order_index
      AND order_index <= in_new_order_index
      AND id <> current_task.id;
  ELSIF in_new_order_index < current_task.order_index THEN
    UPDATE public.tasks
    SET order_index = order_index + 1,
        updated_at = NOW()
    WHERE status = in_new_status
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

CREATE OR REPLACE FUNCTION public.get_project_todo_summary()
RETURNS TABLE (
  project_id uuid,
  project_name text,
  pending_count bigint,
  preview_items jsonb
)
LANGUAGE sql
STABLE
AS $$
  WITH scoped_lists AS (
    SELECT tl.id, tl.project_id
    FROM public.todo_lists tl
    WHERE tl.owner_id = auth.uid()
      AND tl.is_archived = false
      AND tl.project_id IS NOT NULL
  ),
  pending_counts AS (
    SELECT sl.project_id, COUNT(*)::bigint AS pending_count
    FROM scoped_lists sl
    JOIN public.todo_items ti ON ti.list_id = sl.id
    WHERE ti.owner_id = auth.uid()
      AND ti.is_done = false
    GROUP BY sl.project_id
  )
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    COALESCE(pc.pending_count, 0) AS pending_count,
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(x))
        FROM (
          SELECT ti.*
          FROM public.todo_items ti
          JOIN scoped_lists sl2 ON sl2.id = ti.list_id
          WHERE sl2.project_id = p.id
            AND ti.owner_id = auth.uid()
          ORDER BY ti.position ASC, ti.created_at DESC
          LIMIT 3
        ) x
      ),
      '[]'::jsonb
    ) AS preview_items
  FROM public.projects p
  JOIN (
    SELECT DISTINCT project_id
    FROM scoped_lists
  ) used ON used.project_id = p.id
  LEFT JOIN pending_counts pc ON pc.project_id = p.id
  WHERE p.owner_id = auth.uid()
  ORDER BY p.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.move_task_atomic(uuid, public.task_status, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_todo_summary() TO authenticated;
