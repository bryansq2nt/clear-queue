-- =============================================================================
-- Fix accept_invite_atomic for simplified roles schema
-- - project_invites no longer has profile_id / invite_role_id
-- - accept path must use role_id + allowed_modules only
-- =============================================================================

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
  v_invite RECORD;
  v_user_email TEXT;
  v_role_name TEXT;
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

  -- Team roles are attached to a specific sub-team selected at invite time.
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

  RETURN v_invite.project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) TO authenticated;
