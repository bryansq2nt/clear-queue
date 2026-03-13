-- ============================================================
-- Migration: reorder_links_atomic RPC
-- Fixes the N+1 loop in reorderProjectLinksAction (AGENTS.md known tech debt).
-- Receives an ordered array of link IDs and updates all sort_order
-- values in a single statement using UNNEST + ordinality.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reorder_links_atomic(
  p_project_id UUID,
  p_ordered_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  IF array_length(p_ordered_ids, 1) IS NULL THEN
    RETURN; -- empty array is a no-op
  END IF;

  -- Single UPDATE: join the table against the UNNEST to assign ordinal positions.
  -- Only touches rows that belong to this project, so rogue IDs are silently ignored.
  UPDATE public.project_links pl
  SET sort_order = ord.pos
  FROM (
    SELECT unnested.id::UUID AS id, (row_number() OVER ()) - 1 AS pos
    FROM unnest(p_ordered_ids) AS unnested(id)
  ) ord
  WHERE pl.id = ord.id
    AND pl.project_id = p_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_links_atomic(UUID, UUID[]) TO authenticated;
