-- ============================================================
-- Per-member custom action grants (override role-based permissions).
-- When a row exists with non-empty granted_actions, auth uses this set
-- instead of the role's actions. Enables "view tasks but not create/delete".
-- ============================================================

CREATE TABLE public.user_project_action_grants (
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_actions TEXT[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX user_project_action_grants_user ON public.user_project_action_grants (user_id);

CREATE TRIGGER update_user_project_action_grants_updated_at
  BEFORE UPDATE ON public.user_project_action_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_project_action_grants ENABLE ROW LEVEL SECURITY;

-- Project members can read; writes go through SECURITY DEFINER RPC.
CREATE POLICY "action_grants_select" ON public.user_project_action_grants
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_project_member(project_id)
  );

-- ============================================================
-- get_member_access_for_project: return effective granted_actions
-- (from user_project_action_grants if set, else from roles)
-- ============================================================

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

-- ============================================================
-- update_member_access_full_atomic
-- Updates both allowed_modules and granted_actions for a member.
-- p_granted_actions NULL or empty = delete custom grants (use role).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_member_access_full_atomic(
  p_project_id      UUID,
  p_user_id         UUID,
  p_allowed_modules TEXT[] DEFAULT NULL,
  p_granted_actions TEXT[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Allowed modules (user_project_access_grants)
  IF p_allowed_modules IS NULL OR array_length(p_allowed_modules, 1) IS NULL OR array_length(p_allowed_modules, 1) = 0 THEN
    DELETE FROM public.user_project_access_grants
    WHERE project_id = p_project_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
    VALUES (p_project_id, p_user_id, p_allowed_modules)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
  END IF;

  -- Custom action grants (user_project_action_grants)
  IF p_granted_actions IS NULL OR array_length(p_granted_actions, 1) IS NULL OR array_length(p_granted_actions, 1) = 0 THEN
    DELETE FROM public.user_project_action_grants
    WHERE project_id = p_project_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.user_project_action_grants (project_id, user_id, granted_actions)
    VALUES (p_project_id, p_user_id, p_granted_actions)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET granted_actions = EXCLUDED.granted_actions, updated_at = NOW();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_access_full_atomic(UUID, UUID, TEXT[], TEXT[]) TO authenticated;
