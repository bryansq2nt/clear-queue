-- =============================================================================
-- Team-aware invites:
-- - project_invites.team_id stores the sub-team selected for team roles
-- - accept_invite_atomic auto-adds accepted user into that sub-team
-- =============================================================================

ALTER TABLE public.project_invites
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.project_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_invites_team_id_idx
  ON public.project_invites (team_id);

CREATE OR REPLACE FUNCTION public.accept_invite_atomic(
  p_token   TEXT,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite          RECORD;
  v_invite_role     RECORD;
  v_profile         RECORD;
  v_effective_role  UUID;
  v_allowed_modules TEXT[];
  v_granted_actions TEXT[];
  v_user_email      TEXT;
  v_role_name       TEXT;
BEGIN
  SELECT
    pi.id,
    pi.project_id,
    pi.role_id,
    pi.profile_id,
    pi.invite_role_id,
    pi.invited_by,
    pi.status,
    pi.expires_at,
    pi.email,
    pi.team_id
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND                    THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()  THEN RAISE EXCEPTION 'invite_expired';     END IF;

  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  IF v_invite.invite_role_id IS NOT NULL THEN
    SELECT effective_role_name, allowed_modules, granted_actions
    INTO v_invite_role
    FROM public.project_invite_roles
    WHERE id = v_invite.invite_role_id;

    IF FOUND THEN
      SELECT id INTO v_effective_role
      FROM public.rbac_roles
      WHERE name = v_invite_role.effective_role_name AND is_system_role = true;

      v_allowed_modules := v_invite_role.allowed_modules;
      v_granted_actions := v_invite_role.granted_actions;
    END IF;
  ELSIF v_invite.profile_id IS NOT NULL THEN
    SELECT base_role_id, allowed_modules
    INTO v_profile
    FROM public.project_access_profiles
    WHERE id = v_invite.profile_id;

    IF FOUND THEN
      v_effective_role  := v_profile.base_role_id;
      v_allowed_modules := v_profile.allowed_modules;
    END IF;
  END IF;

  IF v_effective_role IS NULL THEN
    v_effective_role := v_invite.role_id;
  END IF;

  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p_user_id, v_effective_role, v_invite.project_id, v_invite.invited_by
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p_user_id
      AND ura.role_id = v_effective_role
      AND ura.project_id = v_invite.project_id
  );

  INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
  VALUES (v_invite.project_id, p_user_id, v_allowed_modules)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    updated_at = NOW();

  IF v_granted_actions IS NOT NULL AND array_length(v_granted_actions, 1) > 0 THEN
    INSERT INTO public.user_project_action_grants (project_id, user_id, granted_actions)
    VALUES (v_invite.project_id, p_user_id, v_granted_actions)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET
      granted_actions = EXCLUDED.granted_actions,
      updated_at = NOW();
  END IF;

  -- Team roles are attached to a specific sub-team selected at invite time.
  IF v_invite.team_id IS NOT NULL THEN
    SELECT name INTO v_role_name
    FROM public.rbac_roles
    WHERE id = v_effective_role;

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
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$;
