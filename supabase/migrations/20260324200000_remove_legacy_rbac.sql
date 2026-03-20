-- =============================================================================
-- Phase 1: Remove legacy RBAC tables + simplify project_invites schema
--
-- Drops:
--   user_project_action_grants    — per-member action key overrides (replaced by role)
--   project_access_profiles       — named module bundles (replaced by invite form)
--   project_invite_roles          — custom invite role builder (replaced by 2-step invite)
--   project_invites.profile_id    — FK to project_access_profiles (dropped)
--   project_invites.invite_role_id — FK to project_invite_roles (dropped)
--
-- Adds to project_invites:
--   allowed_modules TEXT[]        — modules the invited user can access (set at invite time)
--   guest_scope     TEXT          — 'team' | 'project' for guests; NULL for non-guests
--
-- Clears test role data (no production users):
--   TRUNCATE user_role_assignments
--   TRUNCATE rbac_role_module_actions
--   DELETE FROM rbac_roles WHERE is_system_role = true
--
-- Updates RPCs:
--   get_pending_invites_for_project — removes profile_id/invite_role_id from return type
--   accept_invite_atomic            — simplified to not reference dropped tables
-- =============================================================================

-- ── 1. Drop FK columns on project_invites before dropping referenced tables ───

ALTER TABLE public.project_invites
  DROP COLUMN IF EXISTS profile_id,
  DROP COLUMN IF EXISTS invite_role_id;

-- ── 2. Drop legacy tables ─────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.user_project_action_grants;
DROP TABLE IF EXISTS public.project_invite_roles;
DROP TABLE IF EXISTS public.project_access_profiles;

-- ── 3. Add new columns to project_invites ────────────────────────────────────

ALTER TABLE public.project_invites
  ADD COLUMN IF NOT EXISTS allowed_modules TEXT[],
  ADD COLUMN IF NOT EXISTS guest_scope TEXT CHECK (guest_scope IN ('team', 'project'));

COMMENT ON COLUMN public.project_invites.allowed_modules IS
  'Modules the invited member can access. NULL = unrestricted (all project-enabled modules).';

COMMENT ON COLUMN public.project_invites.guest_scope IS
  'For guests only: team = scoped to their sub-team data, project = full project data.
   Set automatically by the invite action: Team Manager inviting → team, Owner/PM → project.';

-- ── 3. Add read_scope to user_project_access_grants (needed by accept_invite_atomic below) ──
--
-- NULL  = scope derived from role (owner/PM = project, team_manager = team, team_member = own)
-- 'team'    / 'project' = guest scope, set at invite time

ALTER TABLE public.user_project_access_grants
  ADD COLUMN IF NOT EXISTS read_scope TEXT
    CHECK (read_scope IN ('own', 'team', 'project'));

COMMENT ON COLUMN public.user_project_access_grants.read_scope IS
  'For guests only: the read scope set at invite time.
   NULL = derive scope from role (owner/PM → project, team_manager → team, team_member → own).
   project = guest sees all project data in their allowed modules.
   team = guest sees their sub-team''s data in their allowed modules.';

-- ── 4. Clear test role data ───────────────────────────────────────────────────
--
-- Only test users exist in development (confirmed with user).
-- Schema is preserved; data is rebuilt in the next migration.

TRUNCATE public.user_role_assignments, public.rbac_role_module_actions, public.rbac_module_actions;
DELETE FROM public.rbac_roles WHERE is_system_role = true;

-- ── 5. Update get_pending_invites_for_project ─────────────────────────────────
--
-- Return type changed — must DROP before CREATE OR REPLACE.
-- Removes profile_id, profile_name, invite_role_id, invite_role_name which
-- referenced the dropped tables.

DROP FUNCTION IF EXISTS public.get_pending_invites_for_project(UUID);

CREATE FUNCTION public.get_pending_invites_for_project(p_project_id UUID)
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  role_id         UUID,
  role_name       TEXT,
  allowed_modules TEXT[],
  guest_scope     TEXT,
  status          TEXT,
  invited_by_name TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  token           TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.id,
    pi.email,
    pi.role_id,
    COALESCE(rr.name, '')::TEXT                                          AS role_name,
    pi.allowed_modules,
    pi.guest_scope,
    pi.status,
    COALESCE(pr.display_name, split_part(au.email, '@', 1), '')::TEXT   AS invited_by_name,
    pi.expires_at,
    pi.created_at,
    pi.token
  FROM public.project_invites pi
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  LEFT JOIN auth.users au        ON au.id = pi.invited_by
  LEFT JOIN public.profiles pr   ON pr.user_id = pi.invited_by
  WHERE pi.project_id = p_project_id
    AND pi.status = 'pending'
    AND public.is_project_member(p_project_id)
  ORDER BY pi.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_invites_for_project(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_pending_invites_for_project(UUID) TO authenticated;

-- ── 6. Rewrite accept_invite_atomic ──────────────────────────────────────────
--
-- Simplified: no profile_id/invite_role_id priority chain.
-- allowed_modules and guest_scope come directly from the invite row.
-- Always writes user_project_access_grants (fail-closed semantic).

DROP FUNCTION IF EXISTS public.accept_invite_atomic(TEXT, UUID);

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
  v_invite      RECORD;
  v_user_email  TEXT;
BEGIN
  -- auth guard
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Fetch and lock the invite (FOR UPDATE prevents double-accept races)
  SELECT
    pi.id,
    pi.project_id,
    pi.role_id,
    pi.invited_by,
    pi.status,
    pi.expires_at,
    pi.email,
    pi.allowed_modules,
    pi.guest_scope
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND                    THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()  THEN RAISE EXCEPTION 'invite_expired';     END IF;

  -- 2. Email must match (case-insensitive)
  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  -- 3. Add to project_members (idempotent)
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 4. Assign role (idempotent — one role per user per project)
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  SELECT p_user_id, v_invite.role_id, v_invite.project_id, v_invite.invited_by
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id    = p_user_id
      AND ura.project_id = v_invite.project_id
  );

  -- 5. Write module allowlist + guest scope (always — fail-closed semantic)
  --    NULL allowed_modules = unrestricted (all project-enabled tabs visible).
  --    A missing row means "not a member" (fail-closed in app layer).
  INSERT INTO public.user_project_access_grants
    (project_id, user_id, allowed_modules, read_scope)
  VALUES
    (v_invite.project_id, p_user_id, v_invite.allowed_modules, v_invite.guest_scope)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    read_scope      = EXCLUDED.read_scope,
    updated_at      = NOW();

  -- 6. Mark accepted
  UPDATE public.project_invites
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$;

COMMENT ON FUNCTION public.accept_invite_atomic(TEXT, UUID) IS
  'Simplified invite acceptance: role + allowed_modules + guest_scope come directly
   from the invite row. No profile/custom-role priority chain. Always writes
   user_project_access_grants (fail-closed: missing row = no module access).';

-- ── 7. Fix get_member_access_for_project — remove user_project_action_grants CTE ──
--
-- The table was dropped above. Remove the custom_actions CTE and always return
-- role-based granted actions.

DROP FUNCTION IF EXISTS public.get_member_access_for_project(UUID, UUID);

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
    COALESCE((
      SELECT array_agg(DISTINCT a.action_key ORDER BY a.action_key)
      FROM member_roles mr
      JOIN public.rbac_role_module_actions rrma ON rrma.role_id = mr.role_id
      JOIN public.rbac_module_actions a ON a.id = rrma.action_id
    ), ARRAY[]::TEXT[]);
END;
$$;

-- ── 8. Simplify update_member_access_full_atomic — remove action grants ──────
--
-- The user_project_action_grants table was dropped. Only update allowed_modules.

CREATE OR REPLACE FUNCTION public.update_member_access_full_atomic(
  p_project_id      UUID,
  p_user_id         UUID,
  p_allowed_modules TEXT[] DEFAULT NULL,
  p_granted_actions TEXT[] DEFAULT NULL   -- ignored; kept for call-site compat
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

  -- Update module allowlist only
  INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
  VALUES (p_project_id, p_user_id, p_allowed_modules)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_access_full_atomic(UUID, UUID, TEXT[], TEXT[]) TO authenticated;

-- ── 9. Add update_member_role_atomic — simple role assignment ─────────────────
--
-- Replaces update_member_access_atomic (which required a profile_id lookup).
-- Caller passes the role_id directly; no profile/custom-role lookup needed.

DROP FUNCTION IF EXISTS public.update_member_access_atomic(UUID, UUID, UUID, UUID);

CREATE FUNCTION public.update_member_role_atomic(
  p_project_id  UUID,
  p_user_id     UUID,
  p_role_id     UUID,
  p_assigned_by UUID DEFAULT auth.uid()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_role  UUID;
  v_owner_count INT;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Prevent demoting the last owner
  SELECT id INTO v_owner_role
  FROM public.rbac_roles
  WHERE name = 'owner' AND is_system_role = true;

  IF EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id    = p_user_id
      AND ura.project_id = p_project_id
      AND ura.role_id    = v_owner_role
  ) AND p_role_id <> v_owner_role THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.user_role_assignments ura
    WHERE ura.project_id = p_project_id AND ura.role_id = v_owner_role;
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_demote_last_owner';
    END IF;
  END IF;

  -- Replace all role assignments for this user in this project
  DELETE FROM public.user_role_assignments
  WHERE user_id = p_user_id AND project_id = p_project_id;

  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (p_user_id, p_role_id, p_project_id, p_assigned_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_role_atomic(UUID, UUID, UUID, UUID) TO authenticated;

-- ── 10. Drop invite-role-based member update RPC ──────────────────────────────

DROP FUNCTION IF EXISTS public.update_member_access_by_invite_role_atomic(UUID, UUID, UUID, UUID);

-- ── 11. Fix update_member_modules_atomic — upsert instead of delete ───────────
--
-- The old version deleted the row when modules is null, making the member
-- fail-closed (no access). Now we upsert with NULL = unrestricted.

CREATE OR REPLACE FUNCTION public.update_member_modules_atomic(
  p_project_id      UUID,
  p_user_id         UUID,
  p_allowed_modules TEXT[] DEFAULT NULL
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

  -- NULL or empty → unrestricted (row stays, allowed_modules = NULL)
  INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
  VALUES (
    p_project_id,
    p_user_id,
    CASE
      WHEN p_allowed_modules IS NULL OR array_length(p_allowed_modules, 1) IS NULL
        OR array_length(p_allowed_modules, 1) = 0
      THEN NULL
      ELSE p_allowed_modules
    END
  )
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    allowed_modules = EXCLUDED.allowed_modules,
    updated_at      = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_modules_atomic(UUID, UUID, TEXT[]) TO authenticated;

-- ── 12. Fix get_invite_by_token — remove profile/invite-role joins ────────────

DROP FUNCTION IF EXISTS public.get_invite_by_token(TEXT);

CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token TEXT)
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  status          TEXT,
  expires_at      TIMESTAMPTZ,
  project_id      UUID,
  project_name    TEXT,
  role_name       TEXT,
  allowed_modules TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    pi.id,
    pi.email,
    pi.status,
    pi.expires_at,
    pi.project_id,
    p.name           AS project_name,
    COALESCE(rr.name, '')::TEXT AS role_name,
    pi.allowed_modules
  FROM public.project_invites pi
  JOIN public.projects p    ON p.id = pi.project_id
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  WHERE pi.token = p_token;
$$;

COMMENT ON FUNCTION public.get_invite_by_token(TEXT) IS
  'Returns invite metadata by token for the accept page. Callable by anyone.';

REVOKE EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO anon;
GRANT  EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO authenticated;
