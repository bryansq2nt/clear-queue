-- Calendar module: native events table + feed RPC (single round trip).
-- Design: Calendar as lens; tasks/billings/todo_items remain source of truth.
-- See docs/plans/calendar-module-design-plan.md

-- 1. Enums
CREATE TYPE public.calendar_event_type_enum AS ENUM (
  'meeting',
  'site_visit',
  'inspection',
  'reminder',
  'focus_block',
  'other'
);

CREATE TYPE public.calendar_event_status_enum AS ENUM (
  'scheduled',
  'done',
  'cancelled'
);

-- 2. Table
CREATE TABLE public.calendar_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    UUID NULL REFERENCES public.projects(id) ON DELETE SET NULL,

  title         TEXT NOT NULL,
  description   TEXT NULL,
  location      TEXT NULL,

  event_type    public.calendar_event_type_enum NOT NULL,
  status        public.calendar_event_status_enum NOT NULL DEFAULT 'scheduled',

  all_day       BOOLEAN NOT NULL DEFAULT false,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Indexes
CREATE INDEX idx_calendar_events_project_start
  ON public.calendar_events (project_id, start_at DESC);

CREATE INDEX idx_calendar_events_owner_start
  ON public.calendar_events (owner_id, start_at DESC);

-- Required for calendar range queries (audit recommendation)
CREATE INDEX IF NOT EXISTS idx_tasks_project_due_date
  ON public.tasks (project_id, due_date);

CREATE INDEX IF NOT EXISTS idx_todo_items_owner_due_date
  ON public.todo_items (owner_id, due_date);

-- 4. updated_at trigger
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own calendar events"
  ON public.calendar_events FOR SELECT
  USING (
    owner_id = auth.uid()
    AND (
      project_id IS NULL OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = calendar_events.project_id
          AND p.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert own calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      project_id IS NULL OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = calendar_events.project_id
          AND p.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own calendar events"
  ON public.calendar_events FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own calendar events"
  ON public.calendar_events FOR DELETE
  USING (owner_id = auth.uid());

-- 6. RPC: single round-trip project calendar feed (≤3 DB round trips for tab)
CREATE OR REPLACE FUNCTION public.get_project_calendar_feed(
  p_project_id UUID,
  p_start_date DATE,
  p_end_date DATE
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

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Project not found or not owned by authenticated user';
  END IF;

  RETURN QUERY
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
    AND b.owner_id = auth.uid()
    AND b.due_date IS NOT NULL
    AND b.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

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
    AND tl.owner_id = auth.uid()
  WHERE ti.due_date IS NOT NULL
    AND ti.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

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
    AND e.owner_id = auth.uid()
    AND e.start_at::DATE <= p_end_date
    AND (e.end_at IS NULL OR e.end_at::DATE >= p_start_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_calendar_feed(UUID, DATE, DATE) TO authenticated;
