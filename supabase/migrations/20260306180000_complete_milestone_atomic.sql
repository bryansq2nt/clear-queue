-- Complete a milestone and mark all its associated tasks as done in one transaction.
-- See docs/milestones/README.md

CREATE OR REPLACE FUNCTION public.complete_milestone_atomic(p_milestone_id uuid)
RETURNS public.milestones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_milestone public.milestones%ROWTYPE;
BEGIN
  IF p_milestone_id IS NULL THEN
    RAISE EXCEPTION 'milestone_id is required';
  END IF;

  -- Ensure the milestone exists and belongs to a project owned by the current user.
  IF NOT EXISTS (
    SELECT 1
    FROM public.milestones m
    JOIN public.projects p ON p.id = m.project_id AND p.owner_id = auth.uid()
    WHERE m.id = p_milestone_id
  ) THEN
    RAISE EXCEPTION 'Milestone not found or access denied';
  END IF;

  -- Mark all tasks linked to this milestone as done (RLS limits to user's projects).
  UPDATE public.tasks
  SET status = 'done'
  WHERE milestone_id = p_milestone_id
    AND status IS DISTINCT FROM 'done';

  -- Mark the milestone as completed.
  UPDATE public.milestones
  SET status = 'completed',
      completed_at = timezone('utc', now())
  WHERE id = p_milestone_id
  RETURNING * INTO v_milestone;

  RETURN v_milestone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_milestone_atomic(uuid) TO authenticated;
