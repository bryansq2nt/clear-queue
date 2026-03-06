-- approve_copilot_proposal_atomic: lock proposal, create task or note, update proposal in one transaction.
-- Called by copilot approve action. Validates payload server-side.

CREATE OR REPLACE FUNCTION public.approve_copilot_proposal_atomic(
  in_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec           public.copilot_proposals%ROWTYPE;
  v_title       text;
  v_status      text;
  v_priority    integer;
  v_due_date    date;
  v_notes       text;
  v_tags        text;
  v_content     text;
  v_task_id     uuid;
  v_note_id     uuid;
  v_entity_id   uuid;
  v_type        text;
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
    v_notes := NULLIF(BTRIM(rec.payload->>'notes'), '');
    v_tags := NULLIF(BTRIM(rec.payload->>'tags'), '');

    SELECT id INTO v_task_id
    FROM public.create_task_atomic(
      rec.project_id,
      v_title,
      v_status::public.task_status,
      v_priority,
      v_due_date,
      v_notes,
      v_tags
    );
    v_entity_id := v_task_id;

  ELSIF v_type = 'note' THEN
    v_title := NULLIF(BTRIM(rec.payload->>'title'), '');
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
  'Approves a pending copilot proposal: creates the task or note and marks proposal approved. Atomic.';

GRANT EXECUTE ON FUNCTION public.approve_copilot_proposal_atomic(uuid) TO authenticated;
