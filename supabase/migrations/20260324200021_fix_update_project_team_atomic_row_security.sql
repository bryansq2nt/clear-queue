-- update_project_team_atomic reads/writes project_teams, projects (join),
-- user_project_access_grants, and reads project_team_members. If the function
-- owner does not bypass RLS in some environments, those statements can see zero
-- rows or fail policies while still running as SECURITY DEFINER — causing
-- sub_team_not_found, blocked UPDATE/INSERT, or generic RPC failures.
-- SET row_security = off matches other bootstrap-style SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.update_project_team_atomic(
  p_team_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_allowed_modules TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  allowed_modules TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id UUID;
  v_project_id UUID;
  v_owner_id UUID;
  v_org_id UUID;
  v_trimmed_name TEXT;
  v_normalized_modules TEXT[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pt.project_id, p.owner_id, p.org_id
  INTO v_project_id, v_owner_id, v_org_id
  FROM public.project_teams pt
  INNER JOIN public.projects p
    ON p.id = pt.project_id
  WHERE pt.id = p_team_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'sub_team_not_found';
  END IF;

  IF NOT public.is_project_member(v_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT (
    v_user_id = v_owner_id
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      INNER JOIN public.rbac_roles r
        ON r.id = ura.role_id
      WHERE ura.user_id = v_user_id
        AND (
          ura.project_id = v_project_id
          OR (v_org_id IS NOT NULL AND ura.org_id = v_org_id)
        )
        AND r.name IN ('owner', 'project_owner', 'project_manager')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized_to_edit_sub_team';
  END IF;

  v_trimmed_name := btrim(coalesce(p_name, ''));
  IF char_length(v_trimmed_name) < 1 OR char_length(v_trimmed_name) > 100 THEN
    RAISE EXCEPTION 'invalid_team_name';
  END IF;

  v_normalized_modules := CASE
    WHEN p_allowed_modules IS NULL OR array_length(p_allowed_modules, 1) IS NULL
      OR array_length(p_allowed_modules, 1) = 0
    THEN NULL
    ELSE p_allowed_modules
  END;

  -- Qualify with table alias: RETURNS TABLE (id, name, …) defines PL/pgSQL
  -- variables that shadow column names — unqualified "id" in WHERE is ambiguous.
  UPDATE public.project_teams AS upt
  SET
    name = v_trimmed_name,
    description = NULLIF(btrim(coalesce(p_description, '')), ''),
    allowed_modules = v_normalized_modules,
    updated_at = now()
  WHERE upt.id = p_team_id;

  INSERT INTO public.user_project_access_grants (
    project_id,
    user_id,
    allowed_modules
  )
  SELECT
    v_project_id,
    ptm.user_id,
    v_normalized_modules
  FROM public.project_team_members ptm
  WHERE ptm.team_id = p_team_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      INNER JOIN public.rbac_roles r
        ON r.id = ura.role_id
      WHERE ura.user_id = ptm.user_id
        AND (
          ura.project_id = v_project_id
          OR (v_org_id IS NOT NULL AND ura.org_id = v_org_id)
        )
        AND r.name IN ('owner', 'project_owner', 'project_manager')
    )
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    updated_at = now();

  RETURN QUERY
  SELECT
    pt.id,
    pt.name,
    pt.description,
    pt.allowed_modules
  FROM public.project_teams pt
  WHERE pt.id = p_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_project_team_atomic(UUID, TEXT, TEXT, TEXT[]) TO authenticated;
