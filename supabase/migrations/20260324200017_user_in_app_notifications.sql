-- =============================================================================
-- In-app notifications (stored rows) + remove reason + sub-team move notify
--
-- 1) user_in_app_notifications — recipient inbox (RLS: read/update own rows).
-- 2) remove_project_member_atomic(project, target, reason?) — optional reason
--    stored in notification payload for the removed user.
-- 3) move_sub_team_member_atomic — removes other sub-team rows in project,
--    ensures membership in target team, notifies assignee of change.
-- =============================================================================

CREATE TABLE public.user_in_app_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('project_removed', 'sub_team_changed')),
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id   UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_in_app_notifications_user_created
  ON public.user_in_app_notifications (user_id, created_at DESC);

COMMENT ON TABLE public.user_in_app_notifications IS
  'User inbox for in-app events (removal, sub-team changes). Inserts via SECURITY DEFINER RPCs only.';

ALTER TABLE public.user_in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_in_app_notifications_select_own"
  ON public.user_in_app_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_in_app_notifications_update_own"
  ON public.user_in_app_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── replace remove_project_member_atomic (add optional reason + notify) ─────

DROP FUNCTION IF EXISTS public.remove_project_member_atomic(UUID, UUID);

CREATE OR REPLACE FUNCTION public.remove_project_member_atomic(
  p_project_id      UUID,
  p_target_user_id  UUID,
  p_reason          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id          UUID;
  v_project_owner_id   UUID;
  v_org_id             UUID;
  v_caller_can_full    BOOLEAN;
  v_caller_is_tm       BOOLEAN;
  v_tm_same_team       BOOLEAN;
  v_project_name       TEXT;
  v_reason_trimmed     TEXT;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  SELECT p.owner_id, p.org_id, p.name
  INTO v_project_owner_id, v_org_id, v_project_name
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  IF p_target_user_id = v_project_owner_id THEN
    RAISE EXCEPTION 'cannot_remove_project_owner';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id    = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this project';
  END IF;

  v_caller_can_full :=
    v_caller_id = v_project_owner_id
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.rbac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = v_caller_id
        AND ura.project_id = p_project_id
        AND r.name IN ('owner', 'project_owner', 'project_manager')
    )
    OR (
      v_org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_role_assignments ura
        JOIN public.rbac_roles r ON r.id = ura.role_id
        WHERE ura.user_id = v_caller_id
          AND ura.org_id = v_org_id
          AND r.name IN ('owner', 'project_owner', 'project_manager')
      )
    );

  v_caller_is_tm :=
    EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.rbac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = v_caller_id
        AND ura.project_id = p_project_id
        AND r.name = 'team_manager'
    )
    OR (
      v_org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_role_assignments ura
        JOIN public.rbac_roles r ON r.id = ura.role_id
        WHERE ura.user_id = v_caller_id
          AND ura.org_id = v_org_id
          AND r.name = 'team_manager'
      )
    );

  v_tm_same_team :=
    EXISTS (
      SELECT 1
      FROM public.project_team_members ptm_mgr
      INNER JOIN public.project_teams pt
        ON pt.id = ptm_mgr.team_id
       AND pt.project_id = p_project_id
      INNER JOIN public.project_team_members ptm_tgt
        ON ptm_tgt.team_id = ptm_mgr.team_id
       AND ptm_tgt.user_id = p_target_user_id
      WHERE ptm_mgr.user_id = v_caller_id
        AND ptm_mgr.role = 'manager'
    );

  IF NOT (v_caller_can_full OR (v_caller_is_tm AND v_tm_same_team)) THEN
    RAISE EXCEPTION 'not_authorized_to_remove_member';
  END IF;

  DELETE FROM public.project_team_members ptm
  USING public.project_teams pt
  WHERE pt.id = ptm.team_id
    AND pt.project_id = p_project_id
    AND ptm.user_id = p_target_user_id;

  DELETE FROM public.user_role_assignments
  WHERE user_id    = p_target_user_id
    AND project_id = p_project_id;

  DELETE FROM public.user_project_access_grants
  WHERE user_id    = p_target_user_id
    AND project_id = p_project_id;

  DELETE FROM public.project_members
  WHERE project_id = p_project_id
    AND user_id    = p_target_user_id;

  v_reason_trimmed := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason_trimmed IS NOT NULL AND length(v_reason_trimmed) > 2000 THEN
    v_reason_trimmed := left(v_reason_trimmed, 2000);
  END IF;

  INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
  VALUES (
    p_target_user_id,
    'project_removed',
    jsonb_build_object(
      'project_id', p_project_id,
      'project_name', COALESCE(v_project_name, 'Project'),
      'reason', v_reason_trimmed
    ),
    v_caller_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_project_member_atomic(UUID, UUID, TEXT) TO authenticated;

-- ─── move sub-team membership (same project) + notify assignee ───────────────

CREATE OR REPLACE FUNCTION public.move_sub_team_member_atomic(
  p_project_id UUID,
  p_new_team_id UUID,
  p_user_id    UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id        UUID;
  v_owner_id         UUID;
  v_org_id           UUID;
  v_can_full         BOOLEAN;
  v_new_team_project UUID;
  v_new_team_name    TEXT;
  v_old_names        TEXT[];
  v_already_in_new   BOOLEAN;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS NULL OR p_project_id IS NULL OR p_new_team_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this project';
  END IF;

  SELECT pt.project_id, pt.name
  INTO v_new_team_project, v_new_team_name
  FROM public.project_teams pt
  WHERE pt.id = p_new_team_id;

  IF v_new_team_project IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'Sub-team not in this project';
  END IF;

  SELECT p.owner_id, p.org_id
  INTO v_owner_id, v_org_id
  FROM public.projects p
  WHERE p.id = p_project_id;

  v_can_full :=
    v_caller_id = v_owner_id
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.rbac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = v_caller_id
        AND ura.project_id = p_project_id
        AND r.name IN ('owner', 'project_owner', 'project_manager')
    )
    OR (
      v_org_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_role_assignments ura
        JOIN public.rbac_roles r ON r.id = ura.role_id
        WHERE ura.user_id = v_caller_id
          AND ura.org_id = v_org_id
          AND r.name IN ('owner', 'project_owner', 'project_manager')
      )
    );

  IF NOT v_can_full THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.project_team_members ptm
      WHERE ptm.team_id = p_new_team_id
        AND ptm.user_id = v_caller_id
        AND ptm.role = 'manager'
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_manage_sub_team';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_team_members ptm
      INNER JOIN public.project_teams pt ON pt.id = ptm.team_id
      WHERE pt.project_id = p_project_id
        AND ptm.user_id = p_user_id
        AND ptm.team_id IS DISTINCT FROM p_new_team_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.project_team_members ptm2
          WHERE ptm2.team_id = ptm.team_id
            AND ptm2.user_id = v_caller_id
            AND ptm2.role = 'manager'
        )
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_move_from_sub_team';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.project_team_members
    WHERE team_id = p_new_team_id AND user_id = p_user_id
  )
  INTO v_already_in_new;

  SELECT COALESCE(
    (
      SELECT ARRAY_AGG(sub.name ORDER BY sub.name)
      FROM (
        SELECT DISTINCT pt.name AS name
        FROM public.project_team_members ptm
        INNER JOIN public.project_teams pt ON pt.id = ptm.team_id
        WHERE pt.project_id = p_project_id
          AND ptm.user_id = p_user_id
          AND ptm.team_id IS DISTINCT FROM p_new_team_id
      ) sub
    ),
    ARRAY[]::TEXT[]
  )
  INTO v_old_names;

  DELETE FROM public.project_team_members ptm
  USING public.project_teams pt
  WHERE pt.id = ptm.team_id
    AND pt.project_id = p_project_id
    AND ptm.user_id = p_user_id
    AND ptm.team_id IS DISTINCT FROM p_new_team_id;

  IF NOT v_already_in_new THEN
    INSERT INTO public.project_team_members (team_id, user_id, role)
    VALUES (p_new_team_id, p_user_id, 'member');
  END IF;

  IF COALESCE(array_length(v_old_names, 1), 0) > 0 OR NOT v_already_in_new THEN
    INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
    VALUES (
      p_user_id,
      'sub_team_changed',
      jsonb_build_object(
        'project_id', p_project_id,
        'project_name', (SELECT name FROM public.projects WHERE id = p_project_id),
        'previous_team_names', COALESCE(to_jsonb(v_old_names), '[]'::jsonb),
        'new_team_name', COALESCE(v_new_team_name, ''),
        'first_assignment_to_sub_team', NOT v_already_in_new
      ),
      v_caller_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_sub_team_member_atomic(UUID, UUID, UUID) TO authenticated;
