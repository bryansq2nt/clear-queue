-- ============================================================
-- Migration: Invite Role Builder
--
-- Adds project_invite_roles — explicit per-invite permission sets
-- that replace the coarse profile+role model with a granular
-- action-key allowlist builder.
--
-- Design:
--   * granted_actions TEXT[]  — explicit list of canonical action keys
--   * allowed_modules TEXT[]  — derived: modules with ≥1 granted action
--   * effective_role_name TEXT — derived: viewer | editor | owner
--   * name TEXT NULL           — NULL = ephemeral; non-null = reusable
--
-- Backward compatibility:
--   * project_invites.invite_role_id is nullable (new path)
--   * Old invite_role_id=NULL invites still work via profile_id or role_id
--   * accept_invite_atomic RPC updated with priority chain:
--       invite_role_id → profile_id → role_id
-- ============================================================

-- ─── project_invite_roles ──────────────────────────────────────────────────────

CREATE TABLE public.project_invite_roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- NULL = ephemeral (one-off invite config, not shown in reuse list).
  -- Non-null = saved reusable role; shown in "Use saved role" picker.
  name                TEXT,

  -- Canonical action keys explicitly granted (e.g. 'tasks.read', 'notes.create').
  granted_actions     TEXT[] NOT NULL DEFAULT '{}',

  -- Derived: module keys with ≥1 granted action. Controls tab-bar visibility.
  -- Stored for efficiency; always derivable from granted_actions.
  allowed_modules     TEXT[] NOT NULL DEFAULT '{}',

  -- Derived: 'project_viewer' | 'project_editor' | 'project_owner'.
  -- Determines the system role assigned at accept time.
  effective_role_name TEXT NOT NULL DEFAULT 'project_viewer',

  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_invite_roles_project ON public.project_invite_roles (project_id);
CREATE INDEX project_invite_roles_named ON public.project_invite_roles (project_id)
  WHERE name IS NOT NULL;

CREATE TRIGGER update_project_invite_roles_updated_at
  BEFORE UPDATE ON public.project_invite_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.project_invite_roles ENABLE ROW LEVEL SECURITY;

-- Project members can read roles for their project
CREATE POLICY "invite_roles_select" ON public.project_invite_roles
  FOR SELECT USING (is_project_member(project_id));

-- Writes: floor = project member; narrowed to invite authority by server action
CREATE POLICY "invite_roles_insert" ON public.project_invite_roles
  FOR INSERT WITH CHECK (is_project_member(project_id));

CREATE POLICY "invite_roles_update" ON public.project_invite_roles
  FOR UPDATE USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "invite_roles_delete" ON public.project_invite_roles
  FOR DELETE USING (is_project_member(project_id));

-- ─── Add invite_role_id to project_invites ────────────────────────────────────

ALTER TABLE public.project_invites
  ADD COLUMN invite_role_id UUID REFERENCES public.project_invite_roles(id) ON DELETE SET NULL;

CREATE INDEX project_invites_invite_role ON public.project_invites (invite_role_id)
  WHERE invite_role_id IS NOT NULL;

-- ─── Update accept_invite_atomic RPC ──────────────────────────────────────────
--
-- Priority chain for resolving role + module allowlist:
--   1. invite_role_id IS NOT NULL  → use project_invite_roles (new path)
--   2. profile_id IS NOT NULL      → use project_access_profiles (old path)
--   3. else                        → use raw role_id (legacy plain invite)
--
-- Returns the project_id UUID on success.

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
  v_invite         RECORD;
  v_invite_role    RECORD;
  v_profile        RECORD;
  v_effective_role UUID;
  v_allowed_modules TEXT[];
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
    pi.expires_at
  INTO v_invite
  FROM public.project_invites pi
  WHERE pi.token = p_token
  FOR UPDATE;

  IF NOT FOUND                    THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()  THEN RAISE EXCEPTION 'invite_expired';     END IF;

  -- 2. Resolve effective role and allowed_modules via priority chain

  IF v_invite.invite_role_id IS NOT NULL THEN
    -- New path: use project_invite_roles
    SELECT effective_role_name, allowed_modules
    INTO v_invite_role
    FROM public.project_invite_roles
    WHERE id = v_invite.invite_role_id;

    IF FOUND THEN
      SELECT id INTO v_effective_role
      FROM public.rbac_roles
      WHERE name = v_invite_role.effective_role_name AND is_system_role = true;

      v_allowed_modules := v_invite_role.allowed_modules;
    END IF;

  ELSIF v_invite.profile_id IS NOT NULL THEN
    -- Old path: use project_access_profiles (backward compat)
    SELECT base_role_id, allowed_modules
    INTO v_profile
    FROM public.project_access_profiles
    WHERE id = v_invite.profile_id;

    IF FOUND THEN
      v_effective_role := v_profile.base_role_id;
      v_allowed_modules := v_profile.allowed_modules;
    END IF;
  END IF;

  -- Fallback: legacy plain role_id invite
  IF v_effective_role IS NULL THEN
    v_effective_role := v_invite.role_id;
    v_allowed_modules := NULL; -- unrestricted
  END IF;

  -- 3. Add to project_members (idempotent)
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 4. Assign effective role (idempotent)
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (p_user_id, v_effective_role, v_invite.project_id, v_invite.invited_by)
  ON CONFLICT (user_id, role_id, project_id) DO NOTHING;

  -- 5. Apply module allowlist (only when a non-null allowlist is present).
  --    NULL or empty means unrestricted — no row needed; absence is the default.
  IF v_allowed_modules IS NOT NULL AND array_length(v_allowed_modules, 1) > 0 THEN
    INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
    VALUES (v_invite.project_id, p_user_id, v_allowed_modules)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
  END IF;

  -- 6. Mark invite accepted
  UPDATE public.project_invites
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) TO service_role;
