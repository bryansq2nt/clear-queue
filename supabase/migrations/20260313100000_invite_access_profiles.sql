-- ============================================================
-- Migration: Invite Access Profiles
-- Approved design: allowlist-first, not denylist.
--
-- Tables:
--   project_access_profiles    — named profiles (global seeded + project-scoped)
--   user_project_access_grants — per-member module allowlist (set at accept time)
--   project_invites.profile_id — backward-compatible FK (nullable)
--
-- RPC:
--   accept_invite_atomic       — atomic invite acceptance (replaces 3-write flow)
--
-- Design invariants (enforced here and in application layer):
--   * allowed_modules IS NULL  = unrestricted (all module tabs visible)
--   * allowed_modules IS NOT NULL = explicit allowlist; only listed tabs shown
--   * allowed_modules is a UI-visibility layer only; backend auth stays in
--     requireCan() + RLS (two independent enforcement points)
--   * Phase 1 safe modules: board, notes, documents, media, links,
--     milestones, budgets, ideas, calendar, todos
--     (billings and copilot excluded until RBAC gaps are patched)
-- ============================================================

-- ─── project_access_profiles ──────────────────────────────────────────────────

CREATE TABLE public.project_access_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping (mutually exclusive — enforced by constraint below):
  --   project_id NOT NULL, org_id NULL   → project-scoped custom profile
  --   project_id NULL,     org_id NOT NULL → org-scoped (future; schema-ready)
  --   project_id NULL,     org_id NULL    → global seeded default (immutable)
  project_id      UUID REFERENCES public.projects(id)      ON DELETE CASCADE,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  description     TEXT,
  base_role_id    UUID NOT NULL REFERENCES public.rbac_roles(id),

  -- Allowlist: explicit set of module keys this profile grants tab visibility for.
  -- NULL  = no module restrictions (unrestricted); used for Owner/Editor/Viewer.
  -- Array = only the listed module tabs are shown; anything omitted is hidden.
  -- Only Phase 1 safe module keys are valid values (see migration comment above).
  -- This column is a UI navigation layer only — it does not grant RBAC permissions.
  allowed_modules TEXT[],

  sort_order      INT NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_scope_exclusive
    CHECK (NOT (project_id IS NOT NULL AND org_id IS NOT NULL))
);

CREATE INDEX project_access_profiles_project ON public.project_access_profiles (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX project_access_profiles_global ON public.project_access_profiles (sort_order)
  WHERE project_id IS NULL AND org_id IS NULL;

CREATE TRIGGER update_project_access_profiles_updated_at
  BEFORE UPDATE ON public.project_access_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.project_access_profiles ENABLE ROW LEVEL SECURITY;

-- Global defaults (project_id IS NULL AND org_id IS NULL): SELECT for any authenticated user.
-- INSERT/UPDATE/DELETE on global rows is intentionally blocked — only migration seeds them.
CREATE POLICY "profiles_select_global" ON public.project_access_profiles
  FOR SELECT USING (
    project_id IS NULL AND org_id IS NULL AND auth.uid() IS NOT NULL
  );

-- Project-scoped: project members can SELECT.
-- INSERT/UPDATE/DELETE use a broader membership floor; the server action narrows this
-- further by calling requireCan('teams.invite_project_member') before any write.
CREATE POLICY "profiles_select_project" ON public.project_access_profiles
  FOR SELECT USING (
    project_id IS NOT NULL AND is_project_member(project_id)
  );

CREATE POLICY "profiles_insert_project" ON public.project_access_profiles
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND is_project_member(project_id)
    -- Server action must also call requireCan('teams.invite_project_member')
    -- to restrict writes to owner/editor roles only (RLS alone is not sufficient).
  );

CREATE POLICY "profiles_update_project" ON public.project_access_profiles
  FOR UPDATE USING (
    project_id IS NOT NULL AND is_project_member(project_id)
  ) WITH CHECK (
    project_id IS NOT NULL AND is_project_member(project_id)
  );

CREATE POLICY "profiles_delete_project" ON public.project_access_profiles
  FOR DELETE USING (
    project_id IS NOT NULL AND is_project_member(project_id)
  );

-- ─── user_project_access_grants ───────────────────────────────────────────────
--
-- Records the effective module allowlist for a project member, set atomically
-- when they accept an invite with a restricted profile.
--
-- allowed_modules semantics (mirrors profile column):
--   Row absent          → unrestricted (all tabs visible; backward compat default)
--   allowed_modules NULL  → explicitly unrestricted (same effect as no row)
--   allowed_modules TEXT[] → only listed module tabs are shown for this member
--
-- This is a UI navigation layer only. Backend authorization is not derived from
-- this table; it is derived from user_role_assignments + rbac_role_module_actions.

CREATE TABLE public.user_project_access_grants (
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  allowed_modules TEXT[],   -- NULL = unrestricted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX user_project_access_grants_user ON public.user_project_access_grants (user_id);

CREATE TRIGGER update_user_project_access_grants_updated_at
  BEFORE UPDATE ON public.user_project_access_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_project_access_grants ENABLE ROW LEVEL SECURITY;

-- Members can read their own grant; all project members can read each other's
-- (needed to display module-access info in the team tab).
CREATE POLICY "access_grants_select" ON public.user_project_access_grants
  FOR SELECT USING (
    user_id = auth.uid() OR is_project_member(project_id)
  );

-- Writes go through accept_invite_atomic (SECURITY DEFINER RPC).
-- RLS policies here are the floor; the RPC is SECURITY DEFINER so it bypasses
-- the calling user's RLS context and runs as the function owner.
CREATE POLICY "access_grants_insert" ON public.user_project_access_grants
  FOR INSERT WITH CHECK (is_project_member(project_id));

CREATE POLICY "access_grants_update" ON public.user_project_access_grants
  FOR UPDATE USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "access_grants_delete" ON public.user_project_access_grants
  FOR DELETE USING (is_project_member(project_id));

-- ─── Add profile_id to project_invites (backward compatible) ──────────────────
--
-- Existing rows have profile_id = NULL.
-- The accept_invite_atomic RPC falls back to role_id when profile_id IS NULL,
-- so existing invite links continue to work unchanged.

ALTER TABLE public.project_invites
  ADD COLUMN profile_id UUID REFERENCES public.project_access_profiles(id) ON DELETE SET NULL;

CREATE INDEX project_invites_profile ON public.project_invites (profile_id)
  WHERE profile_id IS NOT NULL;

-- ─── Seed global default profiles ─────────────────────────────────────────────
--
-- These rows have project_id = NULL, org_id = NULL (global immutable defaults).
-- allowed_modules follows the approved plan:
--   - NULL  = unrestricted (Owner, Editor, Viewer)
--   - Array = explicit allowlist for specialty profiles
-- Phase 1 safe modules only: board, notes, documents, media, links,
--   milestones, budgets, ideas, calendar, todos
-- billings and copilot are EXCLUDED until their RBAC gaps are patched (Phase 2).

DO $$
DECLARE
  v_owner_id  UUID;
  v_editor_id UUID;
  v_viewer_id UUID;
BEGIN
  SELECT id INTO v_owner_id  FROM public.rbac_roles WHERE name = 'project_owner'  AND is_system_role = true;
  SELECT id INTO v_editor_id FROM public.rbac_roles WHERE name = 'project_editor' AND is_system_role = true;
  SELECT id INTO v_viewer_id FROM public.rbac_roles WHERE name = 'project_viewer' AND is_system_role = true;

  IF v_owner_id IS NULL OR v_editor_id IS NULL OR v_viewer_id IS NULL THEN
    RAISE WARNING 'invite_access_profiles: system roles not found — skipping seed';
    RETURN;
  END IF;

  INSERT INTO public.project_access_profiles
    (project_id, org_id, name, description, base_role_id, allowed_modules, sort_order, is_default)
  VALUES
    -- Unrestricted system profiles (allowed_modules = NULL → all tabs visible)
    (NULL, NULL, 'Owner',
      'Full access and project management',
      v_owner_id,  NULL, 0, false),

    (NULL, NULL, 'Editor',
      'Create and edit all content',
      v_editor_id, NULL, 1, true),   -- is_default = true

    (NULL, NULL, 'Viewer',
      'Read-only access to all content',
      v_viewer_id, NULL, 2, false),

    -- Specialty profiles — explicit allowlist (Phase 1 safe modules only)
    -- billings and copilot intentionally omitted until RBAC gaps are patched.

    (NULL, NULL, 'Finance',
      'Budgets only — editor access',
      v_editor_id,
      ARRAY['budgets'],
      3, false),

    (NULL, NULL, 'External reviewer',
      'Tasks, Notes, Documents — read-only',
      v_viewer_id,
      ARRAY['board', 'notes', 'documents'],
      4, false),

    (NULL, NULL, 'Developer',
      'Tasks, Milestones, Documents, Notes, Links — editor access',
      v_editor_id,
      ARRAY['board', 'notes', 'documents', 'links', 'milestones'],
      5, false);
END $$;

-- ─── accept_invite_atomic RPC ─────────────────────────────────────────────────
--
-- Replaces the three sequential writes in the acceptInvite server action.
-- All four writes execute in one transaction:
--   1. Validate and lock the invite row
--   2. Upsert into project_members
--   3. Insert into user_role_assignments (effective role from profile or raw role_id)
--   4. Upsert into user_project_access_grants (only when profile has non-null allowlist)
--   5. Mark invite accepted
--
-- Returns the project_id UUID on success.
-- Raises named exceptions on validation failure; server action maps these to
-- user-facing error strings.

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
  v_profile        RECORD;
  v_effective_role UUID;
BEGIN
  -- 1. Fetch and lock the invite row (FOR UPDATE prevents double-accept races)
  SELECT
    pi.id,
    pi.project_id,
    pi.role_id,
    pi.profile_id,
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

  -- 2. Resolve effective role (from profile's base_role_id if profile set, else raw role_id)
  v_effective_role := v_invite.role_id;

  IF v_invite.profile_id IS NOT NULL THEN
    SELECT base_role_id, allowed_modules
    INTO v_profile
    FROM public.project_access_profiles
    WHERE id = v_invite.profile_id;

    IF FOUND THEN
      v_effective_role := v_profile.base_role_id;
    END IF;
  END IF;

  -- 3. Add to project_members (idempotent)
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 4. Assign role (idempotent — ON CONFLICT ignores duplicate assignment)
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (p_user_id, v_effective_role, v_invite.project_id, v_invite.invited_by)
  ON CONFLICT (user_id, role_id, project_id) DO NOTHING;

  -- 5. Apply module allowlist from profile (only when profile has a restricted allowlist).
  --    allowed_modules IS NULL means unrestricted — no row needed; absence is the default.
  IF v_invite.profile_id IS NOT NULL
     AND FOUND
     AND v_profile.allowed_modules IS NOT NULL
  THEN
    INSERT INTO public.user_project_access_grants (project_id, user_id, allowed_modules)
    VALUES (v_invite.project_id, p_user_id, v_profile.allowed_modules)
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
