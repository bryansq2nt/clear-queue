-- approve_copilot_proposal_atomic v2: adds milestone branch and task milestone_id resolution.
-- Replaces 20260306140000_approve_copilot_proposal_atomic.sql

CREATE OR REPLACE FUNCTION public.approve_copilot_proposal_atomic(
  in_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec                public.copilot_proposals%ROWTYPE;
  v_title            text;
  v_status           text;
  v_priority         integer;
  v_due_date         date;
  v_notes            text;
  v_tags             text;
  v_content          text;
  v_description      text;
  v_milestone_id     uuid;
  v_milestone_title  text;
  v_sort_order       integer;
  v_task_id          uuid;
  v_note_id          uuid;
  v_milestone_new_id uuid;
  v_entity_id        uuid;
  v_type             text;
BEGIN
  -- Lock proposal for update; must be owner and pending
  SELECT * INTO rec
  FROM public.copilot_proposals
  WHERE id = in_proposal_id
    AND owner_id = auth.uid()
  FOR UPDATE;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found or access denied';
  END IF;

  IF rec.status != 'pending' THEN
    RAISE EXCEPTION 'Proposal already reviewed';
  END IF;

  v_type := rec.type;
  v_entity_id := NULL;

  IF v_type = 'task' THEN
    -- Validate and extract task payload
    v_title := NULLIF(BTRIM(rec.payload->>'title'), '');
    IF v_title IS NULL OR length(v_title) = 0 THEN
      RAISE EXCEPTION 'Task title is required';
    END IF;
    IF length(v_title) > 1000 THEN
      RAISE EXCEPTION 'Task title too long';
    END IF;

    v_status := COALESCE(rec.payload->>'status', 'next');
    IF v_status NOT IN ('backlog', 'next', 'in_progress', 'blocked', 'done') THEN
      v_status := 'backlog';
    END IF;

    v_priority := (rec.payload->>'priority')::integer;
    IF v_priority IS NULL OR v_priority < 1 OR v_priority > 5 THEN
      v_priority := 3;
    END IF;

    v_due_date := (rec.payload->>'due_date')::date;
    v_notes    := NULLIF(BTRIM(rec.payload->>'notes'), '');
    v_tags     := NULLIF(BTRIM(rec.payload->>'tags'), '');

    -- Resolve milestone: prefer explicit milestone_id, fall back to milestone_title lookup
    v_milestone_id := NULL;

    BEGIN
      v_milestone_id := (rec.payload->>'milestone_id')::uuid;
    EXCEPTION WHEN others THEN
      v_milestone_id := NULL;
    END;

    IF v_milestone_id IS NOT NULL THEN
      -- Verify it belongs to this project
      IF NOT EXISTS (
        SELECT 1 FROM public.milestones
        WHERE id = v_milestone_id AND project_id = rec.project_id
      ) THEN
        v_milestone_id := NULL;
      END IF;
    ELSE
      v_milestone_title := NULLIF(BTRIM(rec.payload->>'milestone_title'), '');
      IF v_milestone_title IS NOT NULL THEN
        SELECT id INTO v_milestone_id
        FROM public.milestones
        WHERE project_id = rec.project_id
          AND BTRIM(title) = BTRIM(v_milestone_title)
        LIMIT 1;
      END IF;
    END IF;

    SELECT id INTO v_task_id
    FROM public.create_task_atomic(
      rec.project_id,
      v_title,
      v_status::public.task_status,
      v_priority,
      v_due_date,
      v_notes,
      v_tags,
      v_milestone_id
    );
    v_entity_id := v_task_id;

  ELSIF v_type = 'note' THEN
    v_title   := NULLIF(BTRIM(rec.payload->>'title'), '');
    v_content := rec.payload->>'content';
    IF v_title IS NULL OR length(v_title) = 0 THEN
      RAISE EXCEPTION 'Note title is required';
    END IF;
    IF v_content IS NULL OR length(BTRIM(v_content)) = 0 THEN
      RAISE EXCEPTION 'Note content is required';
    END IF;
    IF length(v_title) > 500 THEN
      RAISE EXCEPTION 'Note title too long';
    END IF;

    INSERT INTO public.notes (owner_id, project_id, title, content)
    VALUES (rec.owner_id, rec.project_id, v_title, BTRIM(v_content))
    RETURNING id INTO v_note_id;
    v_entity_id := v_note_id;

  ELSIF v_type = 'milestone' THEN
    v_title := NULLIF(BTRIM(rec.payload->>'title'), '');
    IF v_title IS NULL OR length(v_title) = 0 THEN
      RAISE EXCEPTION 'Milestone title is required';
    END IF;
    IF length(v_title) > 200 THEN
      v_title := left(v_title, 200);
    END IF;

    v_description := NULLIF(BTRIM(rec.payload->>'description'), '');

    SELECT COALESCE(MAX(sort_order), -1) + 1
    INTO v_sort_order
    FROM public.milestones
    WHERE project_id = rec.project_id;

    INSERT INTO public.milestones (project_id, title, description, sort_order)
    VALUES (rec.project_id, v_title, v_description, v_sort_order)
    RETURNING id INTO v_milestone_new_id;

    v_entity_id := v_milestone_new_id;

  ELSE
    RAISE EXCEPTION 'Invalid proposal type';
  END IF;

  -- Update proposal: approved, entity id, reviewed_at
  UPDATE public.copilot_proposals
  SET
    status = 'approved',
    created_entity_id = v_entity_id,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = in_proposal_id;

  RETURN jsonb_build_object(
    'created_entity_id', v_entity_id,
    'type', v_type,
    'project_id', rec.project_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_copilot_proposal_atomic(uuid) IS
  'Approves a pending copilot proposal: creates the task, note, or milestone and marks proposal approved. Atomic.';

GRANT EXECUTE ON FUNCTION public.approve_copilot_proposal_atomic(uuid) TO authenticated;
