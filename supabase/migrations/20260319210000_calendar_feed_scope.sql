-- Migration: 20260319210000_calendar_feed_scope.sql
--
-- Extends get_project_calendar_feed to:
--   1. Accept project members (not only project owners)
--   2. Accept p_owner_ids UUID[] for read-scope filtering
--      NULL  = project scope (return all records for the project)
--      array = restrict billings, todo_items, and calendar_events to these owner IDs

CREATE OR REPLACE FUNCTION public.get_project_calendar_feed(
  p_project_id  UUID,
  p_start_date  DATE,
  p_end_date    DATE,
  p_owner_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE (
  source_type TEXT,
  source_id   UUID,
  date_key    DATE,
  title       TEXT,
  status      TEXT,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  all_day     BOOLEAN,
  amount      NUMERIC,
  paid_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_project_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'project_id, start_date and end_date are required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;

  -- Allow project owner or any project member
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND owner_id = auth.uid()
  ) AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  RETURN QUERY

  -- Tasks: always project-scoped (no owner attribution)
  SELECT
    'task'::TEXT,
    t.id,
    t.due_date,
    t.title,
    t.status::TEXT,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    true,
    NULL::NUMERIC,
    NULL::TIMESTAMPTZ
  FROM public.tasks t
  WHERE t.project_id = p_project_id
    AND t.due_date IS NOT NULL
    AND t.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

  -- Billings: scope-filtered when p_owner_ids is supplied
  SELECT
    'billing'::TEXT,
    b.id,
    b.due_date,
    b.title,
    b.status,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    true,
    b.amount,
    b.paid_at
  FROM public.billings b
  WHERE b.project_id = p_project_id
    AND (p_owner_ids IS NULL OR b.owner_id = ANY(p_owner_ids))
    AND b.due_date IS NOT NULL
    AND b.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

  -- Todo items: scope-filtered via the list's owner_id
  SELECT
    'todo_item'::TEXT,
    ti.id,
    ti.due_date,
    ti.content,
    CASE WHEN ti.is_done THEN 'done' ELSE 'pending' END,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    true,
    NULL::NUMERIC,
    NULL::TIMESTAMPTZ
  FROM public.todo_items ti
  JOIN public.todo_lists tl ON tl.id = ti.list_id
    AND tl.project_id = p_project_id
    AND (p_owner_ids IS NULL OR tl.owner_id = ANY(p_owner_ids))
  WHERE ti.due_date IS NOT NULL
    AND ti.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

  -- Calendar events: scope-filtered when p_owner_ids is supplied
  SELECT
    'event'::TEXT,
    e.id,
    (e.start_at AT TIME ZONE 'UTC')::DATE,
    e.title,
    e.status::TEXT,
    e.start_at,
    e.end_at,
    e.all_day,
    NULL::NUMERIC,
    NULL::TIMESTAMPTZ
  FROM public.calendar_events e
  WHERE e.project_id = p_project_id
    AND (p_owner_ids IS NULL OR e.owner_id = ANY(p_owner_ids))
    AND e.start_at::DATE <= p_end_date
    AND (e.end_at IS NULL OR e.end_at::DATE >= p_start_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_calendar_feed(UUID, DATE, DATE, UUID[]) TO authenticated;
