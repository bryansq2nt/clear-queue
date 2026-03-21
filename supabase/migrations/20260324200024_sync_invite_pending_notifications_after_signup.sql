-- Pending invite rows in user_in_app_notifications are normally created by a trigger
-- on project_invites INSERT only when auth.users already has a matching email.
-- If the invitee registers later, no row was inserted — notifications stay empty.
-- This RPC backfills invite_pending inbox rows for the current user (same email match
-- as accept_invite_atomic). Safe to call on every notifications load (idempotent).

CREATE OR REPLACE FUNCTION public.sync_invite_pending_notifications_for_current_user()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID;
  v_email TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT LOWER(TRIM(email)) INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.user_in_app_notifications (user_id, kind, payload, actor_id)
  SELECT
    v_uid,
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
  LEFT JOIN public.projects p ON p.id = pi.project_id
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  WHERE pi.status = 'pending'
    AND pi.expires_at >= NOW()
    AND LOWER(TRIM(pi.email)) = v_email
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_in_app_notifications n
      WHERE n.user_id = v_uid
        AND n.kind = 'invite_pending'
        AND (n.payload->>'invite_id')::uuid = pi.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_invite_pending_notifications_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_invite_pending_notifications_for_current_user() TO authenticated;
