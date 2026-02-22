-- Fix: move_task_atomic was missing project_id scope on all peer-reorder UPDATEs.
-- Without it, every drag-and-drop on the Kanban board corrupted order_index values
-- for tasks in all other projects owned by the same user.
-- All four peer-shift UPDATE statements now include AND project_id = current_task.project_id.

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
    -- Close the gap in the old column: shift everything after the moved task down by 1.
    UPDATE public.tasks
    SET order_index = order_index - 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = current_task.status
      AND order_index > current_task.order_index;

    -- Open a slot in the new column: shift everything at or after the target position up by 1.
    UPDATE public.tasks
    SET order_index = order_index + 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index >= in_new_order_index
      AND id <> current_task.id;

  ELSIF in_new_order_index > current_task.order_index THEN
    -- Moving down within the same column: shift the tasks in between down by 1.
    UPDATE public.tasks
    SET order_index = order_index - 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index > current_task.order_index
      AND order_index <= in_new_order_index
      AND id <> current_task.id;

  ELSIF in_new_order_index < current_task.order_index THEN
    -- Moving up within the same column: shift the tasks in between up by 1.
    UPDATE public.tasks
    SET order_index = order_index + 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index >= in_new_order_index
      AND order_index < current_task.order_index
      AND id <> current_task.id;
  END IF;

  -- Place the task at its new position.
  UPDATE public.tasks
  SET status = in_new_status,
      order_index = in_new_order_index,
      updated_at = NOW()
  WHERE id = current_task.id
  RETURNING * INTO result_task;

  RETURN result_task;
END;
$$;
