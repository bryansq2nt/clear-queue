-- ============================================================
-- Migration: Invite Access Profiles
-- - project_access_profiles: reusable named permission profiles
-- - user_project_module_overrides: per-member module visibility
-- - profile_id column on project_invites (backward compatible)
-- - accept_invite_atomic RPC (replaces 3-sequential-write flow)
-- - Seeded global default profiles
-- ============================================================

-- ─── project_access_profiles ──────────────────────────────────────────────────

CREATE TABLE public.project_access_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  -- NULL project_id = global seeded default (read-only, available to all projects)
  name             TEXT NOT NULL,
  description      TEXT,
  base_role_id     UUID NOT NULL REFERENCES public.rbac_roles(id),
  -- Sparse map: { "billings": false, "budgets": false }
  -- Missing keys default to true (module visible).
  module_overrides JSONB NOT NULL DEFAULT '{}',
  sort_order       INT NOT NULL DEFAULT 0,
  is_default       BOOLEAN NOT NULL DEFAULT false,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_access_profiles_project ON public.project_access_profiles (project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX project_access_profiles_global ON public.project_access_profiles (sort_order)
  WHERE project_id IS NULL;

CREATE TRIGGER update_project_access_profiles_updated_at
  BEFORE UPDATE ON public.project_access_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.project_access_profiles ENABLE ROW LEVEL SECURITY;

-- Global defaults: readable by all authenticated users; nobody can mutate them directly
CREATE POLICY "profiles_select_global" ON public.project_access_profiles
  FOR SELECT USING (
    project_id IS NULL AND auth.uid() IS NOT NULL
  );

-- Project-scoped profiles: project members can read; project members can insert/update/delete
CREATE POLICY "profiles_select_project" ON public.project_access_profiles
  FOR SELECT USING (
    project_id IS NOT NULL AND is_project_member(project_id)
  );

CREATE POLICY "profiles_insert_project" ON public.project_access_profiles
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND is_project_member(project_id)
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

-- ─── user_project_module_overrides ────────────────────────────────────────────

CREATE TABLE public.user_project_module_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Array of module keys to hide for this member in this project.
  -- Example: ARRAY['billings', 'budgets']
  hidden_modules TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX user_project_module_overrides_project ON public.user_project_module_overrides (project_id);
CREATE INDEX user_project_module_overrides_user ON public.user_project_module_overrides (user_id);

CREATE TRIGGER update_user_project_module_overrides_updated_at
  BEFORE UPDATE ON public.user_project_module_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_project_module_overrides ENABLE ROW LEVEL SECURITY;

-- Members can read their own overrides; project members can read other members' overrides
CREATE POLICY "module_overrides_select" ON public.user_project_module_overrides
  FOR SELECT USING (
    user_id = auth.uid() OR is_project_member(project_id)
  );

-- Only the accept_invite_atomic RPC (SECURITY DEFINER) should insert/update.
-- We still need an RLS policy for the RPC's invoker context — allow project members.
CREATE POLICY "module_overrides_insert" ON public.user_project_module_overrides
  FOR INSERT WITH CHECK (is_project_member(project_id));

CREATE POLICY "module_overrides_update" ON public.user_project_module_overrides
  FOR UPDATE USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

-- Only project owners/managers can remove overrides (removes module restrictions)
CREATE POLICY "module_overrides_delete" ON public.user_project_module_overrides
  FOR DELETE USING (is_project_member(project_id));

-- ─── Add profile_id to project_invites ────────────────────────────────────────

ALTER TABLE public.project_invites
  ADD COLUMN profile_id UUID REFERENCES public.project_access_profiles(id) ON DELETE SET NULL;

CREATE INDEX project_invites_profile ON public.project_invites (profile_id)
  WHERE profile_id IS NOT NULL;

-- ─── Seed global default profiles ─────────────────────────────────────────────

-- These are inserted once with project_id = NULL (global defaults, not editable by users).
-- base_role_id is looked up by name at seed time.

DO $$
DECLARE
  v_owner_role_id  UUID;
  v_editor_role_id UUID;
  v_viewer_role_id UUID;
BEGIN
  SELECT id INTO v_owner_role_id  FROM public.rbac_roles WHERE name = 'project_owner'  AND is_system_role = true;
  SELECT id INTO v_editor_role_id FROM public.rbac_roles WHERE name = 'project_editor' AND is_system_role = true;
  SELECT id INTO v_viewer_role_id FROM public.rbac_roles WHERE name = 'project_viewer' AND is_system_role = true;

  -- Skip if roles aren't seeded yet (shouldn't happen; migration 05 runs first)
  IF v_owner_role_id IS NULL OR v_editor_role_id IS NULL OR v_viewer_role_id IS NULL THEN
    RAISE WARNING 'invite_access_profiles: system roles not found — skipping default profile seed';
    RETURN;
  END IF;

  INSERT INTO public.project_access_profiles
    (project_id, name, description, base_role_id, module_overrides, sort_order, is_default)
  VALUES
    -- Core system profiles (mirrors existing 3-role system; no overrides)
    (NULL, 'Owner',    'Full access and project management',             v_owner_role_id,  '{}', 0, false),
    (NULL, 'Editor',   'Create and edit all content',                    v_editor_role_id, '{}', 1, true),
    (NULL, 'Viewer',   'Read-only access to all content',                v_viewer_role_id, '{}', 2, false),

    -- Curated specialty profiles (editor base with selective module access)
    (NULL, 'Finance',            'Billing and Budgets — editor access',
      v_editor_role_id,
      '{"board": false, "notes": false, "documents": false, "media": false, "links": false, "milestones": false, "calendar": false, "ideas": false, "copilot": false, "todos": false}',
      3, false),

    (NULL, 'External reviewer',  'Tasks, Notes, Documents — read-only',
      v_viewer_role_id,
      '{"billings": false, "budgets": false, "copilot": false}',
      4, false),

    (NULL, 'Developer',          'Tasks, Milestones, Documents, Notes, Links — editor access',
      v_editor_role_id,
      '{"billings": false, "budgets": false}',
      5, false);
END $$;

-- ─── accept_invite_atomic RPC ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_invite_atomic(
  p_token    TEXT,
  p_user_id  UUID
)
RETURNS UUID   -- returns project_id on success
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite          RECORD;
  v_profile         RECORD;
  v_effective_role  UUID;
  v_hidden_modules  TEXT[];
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending';
  END IF;

  IF v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- 2. Resolve effective role and module overrides from the access profile (if any)
  v_effective_role := v_invite.role_id;
  v_hidden_modules := ARRAY[]::TEXT[];

  IF v_invite.profile_id IS NOT NULL THEN
    SELECT base_role_id, module_overrides
    INTO v_profile
    FROM public.project_access_profiles
    WHERE id = v_invite.profile_id;

    IF FOUND THEN
      v_effective_role := v_profile.base_role_id;

      -- Extract keys where value is false (hidden modules)
      SELECT ARRAY(
        SELECT key
        FROM jsonb_each_text(v_profile.module_overrides)
        WHERE value = 'false'
      ) INTO v_hidden_modules;
    END IF;
  END IF;

  -- 3. Upsert into project_members (idempotent)
  INSERT INTO public.project_members (project_id, user_id, invited_by)
  VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  -- 4. Assign role (idempotent — ignore if already assigned)
  INSERT INTO public.user_role_assignments (user_id, role_id, project_id, assigned_by)
  VALUES (p_user_id, v_effective_role, v_invite.project_id, v_invite.invited_by)
  ON CONFLICT (user_id, role_id, project_id) DO NOTHING;

  -- 5. Apply module overrides if the profile hides any modules
  IF array_length(v_hidden_modules, 1) > 0 THEN
    INSERT INTO public.user_project_module_overrides (project_id, user_id, hidden_modules)
    VALUES (v_invite.project_id, p_user_id, v_hidden_modules)
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET hidden_modules = EXCLUDED.hidden_modules, updated_at = NOW();
  END IF;

  -- 6. Mark invite accepted
  UPDATE public.project_invites
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END;
$$;

-- Revoke direct execute; the server-side Supabase client (service role) will call this
REVOKE EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_invite_atomic(TEXT, UUID) TO authenticated;
