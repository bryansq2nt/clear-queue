-- Fix: column reference "granted_actions" is ambiguous.
-- RETURNS TABLE declares granted_actions; qualify the CTE column as ca.granted_actions.

CREATE OR REPLACE FUNCTION public.get_member_access_for_project(
  p_project_id UUID,
  p_user_id    UUID
)
RETURNS TABLE (
  role_ids        UUID[],
  role_names      TEXT[],
  allowed_modules TEXT[],
  granted_actions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH member_roles AS (
    SELECT ura.role_id
    FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id
      AND ura.project_id = p_project_id
  ),
  role_based_actions AS (
    SELECT COALESCE(array_agg(DISTINCT a.action_key ORDER BY a.action_key), ARRAY[]::TEXT[]) AS rba
    FROM member_roles mr
    JOIN public.rbac_role_module_actions rrma ON rrma.role_id = mr.role_id
    JOIN public.rbac_module_actions a ON a.id = rrma.action_id
  ),
  custom_actions AS (
    SELECT apg.granted_actions
    FROM public.user_project_action_grants apg
    WHERE apg.project_id = p_project_id AND apg.user_id = p_user_id
    LIMIT 1
  ),
  effective_actions AS (
    SELECT CASE
      WHEN (SELECT ca.granted_actions FROM custom_actions ca) IS NOT NULL
       AND array_length((SELECT ca.granted_actions FROM custom_actions ca), 1) > 0
      THEN (SELECT ca.granted_actions FROM custom_actions ca)
      ELSE (SELECT rba FROM role_based_actions rba)
    END AS actions
  )
  SELECT
    COALESCE((SELECT array_agg(mr.role_id) FROM member_roles mr), ARRAY[]::UUID[]),
    COALESCE((
      SELECT array_agg(r.name ORDER BY r.name)
      FROM member_roles mr
      JOIN public.rbac_roles r ON r.id = mr.role_id
    ), ARRAY[]::TEXT[]),
    (SELECT g.allowed_modules FROM public.user_project_access_grants g
     WHERE g.project_id = p_project_id AND g.user_id = p_user_id LIMIT 1),
    (SELECT actions FROM effective_actions);
END;
$$;
