-- ============================================================
-- Phase D: project_invites table + member profile RPC
-- ============================================================

CREATE TABLE public.project_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role_id     UUID NOT NULL REFERENCES public.rbac_roles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_invites_project_status
  ON public.project_invites (project_id, status);

CREATE INDEX project_invites_token_pending
  ON public.project_invites (token)
  WHERE status = 'pending';

CREATE INDEX project_invites_email
  ON public.project_invites (email, status);

ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

-- Project members can read invites
CREATE POLICY "project_invites_select" ON public.project_invites
  FOR SELECT USING (public.is_project_member(project_id));

-- Any project member can create invites (requireCan enforces owner-only at app layer)
CREATE POLICY "project_invites_insert" ON public.project_invites
  FOR INSERT WITH CHECK (
    invited_by = auth.uid() AND public.is_project_member(project_id)
  );

-- Project members can update invites (e.g. revoke); invitee can accept
CREATE POLICY "project_invites_update" ON public.project_invites
  FOR UPDATE USING (
    public.is_project_member(project_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Project members can delete invites
CREATE POLICY "project_invites_delete" ON public.project_invites
  FOR DELETE USING (public.is_project_member(project_id));

-- ── Security-definer function: member list with email + profile ────────────────

CREATE OR REPLACE FUNCTION public.get_project_members_with_profile(p_project_id UUID)
RETURNS TABLE (
  user_id      UUID,
  email        TEXT,
  display_name TEXT,
  joined_at    TIMESTAMPTZ,
  roles        JSONB
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
  SELECT
    pm.user_id,
    u.email::TEXT,
    COALESCE(pr.display_name, split_part(u.email, '@', 1))::TEXT AS display_name,
    pm.joined_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
        FROM public.user_role_assignments ura
        JOIN public.rbac_roles r ON r.id = ura.role_id
        WHERE ura.user_id = pm.user_id
          AND ura.project_id = p_project_id
      ),
      '[]'::jsonb
    ) AS roles
  FROM public.project_members pm
  JOIN auth.users u ON u.id = pm.user_id
  LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
  WHERE pm.project_id = p_project_id
  ORDER BY pm.joined_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_members_with_profile(UUID) TO authenticated;
