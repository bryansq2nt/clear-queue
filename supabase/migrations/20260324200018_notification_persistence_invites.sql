-- =============================================================================
-- Persistent notifications: invite inbox rows, inviter outcome notifications,
-- read/unread state. Extends user_in_app_notifications.kind values.
-- =============================================================================

ALTER TABLE public.user_in_app_notifications
  DROP CONSTRAINT IF EXISTS user_in_app_notifications_kind_check;

ALTER TABLE public.user_in_app_notifications
  ADD CONSTRAINT user_in_app_notifications_kind_check
  CHECK (kind IN (
    'project_removed',
    'sub_team_changed',
    'invite_pending',
    'invite_response'
  ));

CREATE INDEX IF NOT EXISTS user_in_app_notifications_user_unread
  ON public.user_in_app_notifications (user_id)
  WHERE read_at IS NULL;

-- ─── Create invite_pending row when invitee already has an account ───────────

CREATE OR REPLACE FUNCTION public.insert_invite_pending_notification_if_invitee_exists(
  p_invite_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv          RECORD;
  v_uid          UUID;
  v_project_name TEXT;
  v_role_name    TEXT;
BEGIN
  SELECT
    pi.id,
    pi.project_id,
    pi.token,
    pi.email,
    pi.invited_by,
    pi.role_id,
    pi.status
  INTO v_inv
  FROM public.project_invites pi
  WHERE pi.id = p_invite_id;

  IF NOT FOUND OR v_inv.status <> 'pending' THEN
    RETURN;
  END IF;

  SELECT au.id
  INTO v_uid
  FROM auth.users au
  WHERE LOWER(TRIM(au.email)) = LOWER(TRIM(v_inv.email));

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_in_app_notifications n
    WHERE n.user_id = v_uid
      AND n.kind = 'invite_pending'
      AND (n.payload->>'invite_id')::uuid = v_inv.id
  ) THEN
    RETURN;
  END IF;

  SELECT p.name INTO v_project_name
  FROM public.projects p
  WHERE p.id = v_inv.project_id;

  SELECT r.name INTO v_role_name
  FROM public.rbac_roles r
  WHERE r.id = v_inv.role_id;

  INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
  VALUES (
    v_uid,
    'invite_pending',
    jsonb_build_object(
      'invite_id', v_inv.id,
      'token', v_inv.token,
      'project_id', v_inv.project_id,
      'project_name', COALESCE(v_project_name, 'Project'),
      'role_name', COALESCE(v_role_name, 'member'),
      'status', 'pending'
    ),
    v_inv.invited_by
  );
END;
$$;

-- Internal-only: called from trigger (not exposed to clients — avoids spam).
REVOKE ALL ON FUNCTION public.insert_invite_pending_notification_if_invitee_exists(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trigger_project_invites_pending_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_invite_pending_notification_if_invitee_exists(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_invites_after_insert_pending_notification ON public.project_invites;
CREATE TRIGGER project_invites_after_insert_pending_notification
  AFTER INSERT ON public.project_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_project_invites_pending_notification();

-- ─── Backfill pending invites for users who already exist ───────────────────

INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
SELECT
  au.id,
  'invite_pending',
  jsonb_build_object(
    'invite_id', pi.id,
    'token', pi.token,
    'project_id', pi.project_id,
    'project_name', COALESCE(p.name, 'Project'),
    'role_name', COALESCE(rr.name, 'member'),
    'status', 'pending'
  ),
  pi.invited_by
FROM public.project_invites pi
INNER JOIN auth.users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(pi.email))
LEFT JOIN public.projects p ON p.id = pi.project_id
LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
WHERE pi.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_in_app_notifications n
    WHERE n.user_id = au.id
      AND n.kind = 'invite_pending'
      AND (n.payload->>'invite_id')::uuid = pi.id
  );

-- ─── accept_invite_atomic — update invitee row + notify inviter ───────────

CREATE OR REPLACE FUNCTION public.accept_invite_atomic(
  p_token TEXT,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite         RECORD;
  v_user_email     TEXT;
  v_role_name      TEXT;
  v_project_name   TEXT;
  v_invitee_name   TEXT;
BEGIN
  SELECT
    pi.id,
    pi.project_id,
    pi.role_id,
    pi.allowed_modules,
    pi.invited_by,
    pi.status,
    pi.expires_at,
    pi.email,
    pi.team_id
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending';
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p_user_id, v_invite.role_id, v_invite.project_id, v_invite.invited_by
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id
      AND ura.role_id = v_invite.role_id
      AND ura.project_id = v_invite.project_id
  );

  INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
  VALUES (v_invite.project_id, p_user_id, v_invite.allowed_modules)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    updated_at = NOW();

  IF v_invite.team_id IS NOT NULL THEN
    SELECT name INTO v_role_name
    FROM public.rbac_roles
    WHERE id = v_invite.role_id;

    IF v_role_name IN ('team_manager', 'team_member') THEN
      INSERT INTO public.project_team_members (team_id, user_id, role)
      VALUES (
        v_invite.team_id,
        p_user_id,
        CASE WHEN v_role_name = 'team_manager' THEN 'manager' ELSE 'member' END
      )
      ON CONFLICT (team_id, user_id)
      DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END IF;

  UPDATE public.project_invites
  SET status = 'accepted',
      accepted_at = NOW()
  WHERE id = v_invite.id;

  UPDATE public.user_in_app_notifications
  SET payload = payload
    || jsonb_build_object(
      'status', 'accepted',
      'resolved_at', NOW()
    )
  WHERE user_id = p_user_id
    AND kind = 'invite_pending'
    AND (payload->>'invite_id')::uuid = v_invite.id;

  SELECT name INTO v_project_name
  FROM public.projects
  WHERE id = v_invite.project_id;

  SELECT COALESCE(pr.display_name, split_part(au.email, '@', 1), v_invite.email)
  INTO v_invitee_name
  FROM auth.users au
  LEFT JOIN public.profiles pr ON pr.user_id = au.id
  WHERE au.id = p_user_id;

  IF v_invite.invited_by IS NOT NULL THEN
    INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
    VALUES (
      v_invite.invited_by,
      'invite_response',
      jsonb_build_object(
        'invite_id', v_invite.id,
        'invite_outcome', 'accepted',
        'project_id', v_invite.project_id,
        'project_name', COALESCE(v_project_name, 'Project'),
        'invitee_email', v_invite.email,
        'invitee_display_name', COALESCE(v_invitee_name, v_invite.email),
        'role_name', (
          SELECT COALESCE(r.name, 'member')
          FROM public.rbac_roles r
          WHERE r.id = v_invite.role_id
        )
      ),
      p_user_id
    );
  END IF;

  RETURN v_invite.project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) TO authenticated;

-- ─── reject_invite_atomic — update invitee row + notify inviter ─────────────

CREATE OR REPLACE FUNCTION public.reject_invite_atomic(
  p_token   TEXT,
  p_user_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite           RECORD;
  v_user_email       TEXT;
  v_project_name     TEXT;
  v_reason_trimmed   TEXT;
  v_invitee_name     TEXT;
BEGIN
  SELECT
    pi.id,
    pi.email,
    pi.status,
    pi.expires_at,
    pi.invited_by,
    pi.project_id,
    pi.role_id
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending';
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  v_reason_trimmed := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason_trimmed IS NOT NULL AND length(v_reason_trimmed) > 2000 THEN
    v_reason_trimmed := left(v_reason_trimmed, 2000);
  END IF;

  UPDATE public.project_invites
  SET
    status = 'rejected',
    rejected_at = NOW(),
    rejection_reason = v_reason_trimmed
  WHERE id = v_invite.id;

  UPDATE public.user_in_app_notifications
  SET payload = payload
    || jsonb_build_object(
      'status', 'rejected',
      'resolved_at', NOW(),
      'rejection_reason', v_reason_trimmed
    )
  WHERE user_id = p_user_id
    AND kind = 'invite_pending'
    AND (payload->>'invite_id')::uuid = v_invite.id;

  SELECT name INTO v_project_name
  FROM public.projects
  WHERE id = v_invite.project_id;

  SELECT COALESCE(pr.display_name, split_part(au.email, '@', 1), v_invite.email)
  INTO v_invitee_name
  FROM auth.users au
  LEFT JOIN public.profiles pr ON pr.user_id = au.id
  WHERE au.id = p_user_id;

  IF v_invite.invited_by IS NOT NULL THEN
    INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
    VALUES (
      v_invite.invited_by,
      'invite_response',
      jsonb_build_object(
        'invite_id', v_invite.id,
        'invite_outcome', 'rejected',
        'project_id', v_invite.project_id,
        'project_name', COALESCE(v_project_name, 'Project'),
        'invitee_email', v_invite.email,
        'invitee_display_name', COALESCE(v_invitee_name, v_invite.email),
        'rejection_reason', v_reason_trimmed,
        'role_name', (
          SELECT COALESCE(r.name, 'member')
          FROM public.rbac_roles r
          WHERE r.id = v_invite.role_id
        )
      ),
      p_user_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.reject_invite_atomic(TEXT, UUID, TEXT) IS
  'Rejects a project invite. Updates invitee notification row and notifies inviter.';

GRANT EXECUTE ON FUNCTION public.reject_invite_atomic(TEXT, UUID, TEXT) TO authenticated;
