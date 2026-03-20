-- ============================================================
-- Fix accept_invite_atomic: always write user_project_access_grants
--
-- Previously the RPC only inserted into user_project_access_grants
-- when allowed_modules was non-null and non-empty. The legacy path
-- (role_id-only invite, no profile, no custom role) left no row,
-- which the app treated as unrestricted (fail-open).
--
-- Now we always insert a row. NULL allowed_modules = unrestricted.
-- A missing row now means "not yet a member" (fail-closed).
-- ============================================================

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
BEGIN
  -- 1. Fetch and lock the invite row (FOR UPDATE prevents double-accept races)
  SELECT
    pi.id,
    pi.project_id,
    pi.role_id,
    pi.profile_id,
    pi.invite_role_id,
    pi.invited_by,
    pi.status,
    pi.expires_at,
    pi.email
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND                    THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()  THEN RAISE EXCEPTION 'invite_expired';     END IF;

  -- Only the invited email can accept (case-insensitive)
  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  -- 2. Resolve effective role, allowed_modules, and granted_actions via priority chain:
  --    invite_role_id > profile_id > role_id (legacy)

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
      -- Profiles do not define custom granted_actions; role-based grants apply.
    END IF;
  END IF;

  -- Legacy path: role_id only. v_allowed_modules stays NULL = unrestricted.
  IF v_effective_role IS NULL THEN
    v_effective_role  := v_invite.role_id;
  END IF;

  -- 3. Add to project_members (idempotent)
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 4. Assign effective role (idempotent)
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p_user_id, v_effective_role, v_invite.project_id, v_invite.invited_by
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id    = p_user_id
      AND ura.role_id    = v_effective_role
      AND ura.project_id = v_invite.project_id
  );

  -- 5. ALWAYS write the module allowlist row.
  --    NULL allowed_modules = explicitly unrestricted (show all project-enabled tabs).
  --    Non-null = explicit allowlist.
  --    A missing row now means "not a member" (fail-closed in app layer).
  INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
  VALUES (v_invite.project_id, p_user_id, v_allowed_modules)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    updated_at      = NOW();

  -- 6. Apply custom action grants from invite role (if any)
  IF v_granted_actions IS NOT NULL AND array_length(v_granted_actions, 1) > 0 THEN
    INSERT INTO public.user_project_action_grants (project_id, user_id, granted_actions)
    VALUES (v_invite.project_id, p_user_id, v_granted_actions)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET
      granted_actions = EXCLUDED.granted_actions,
      updated_at      = NOW();
  END IF;

  -- 7. Mark invite accepted
  UPDATE public.project_invites
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$;

COMMENT ON FUNCTION public.accept_invite_atomic(TEXT, UUID) IS
  'Accepts a project invite atomically. Always writes user_project_access_grants:
   NULL allowed_modules = unrestricted; non-null = explicit allowlist.
   A missing row in user_project_access_grants means not-a-member (fail-closed).';
