-- ============================================================
-- Migration: create organization_members table
-- Insert admin user as member + all other users as members
-- Admin user: 8df49d2b-9bd4-4a98-8f39-865cc68ea601
-- ============================================================

CREATE TABLE public.organization_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX org_members_lookup ON public.organization_members (org_id, user_id);
CREATE INDEX org_members_user   ON public.organization_members (user_id);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own membership rows
CREATE POLICY "org_members_own_select" ON public.organization_members
  FOR SELECT USING (user_id = auth.uid());

-- Any org member can see all members of the same org (team directory)
CREATE POLICY "org_members_team_select" ON public.organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om2
      WHERE om2.org_id = organization_members.org_id
        AND om2.user_id = auth.uid()
    )
  );

-- Insert admin user into mutechlabs org
-- invited_by is themselves (bootstrap — no inviter)
INSERT INTO public.organization_members (org_id, user_id, invited_by)
SELECT
  (SELECT id FROM public.organizations WHERE slug = 'mutechlabs'),
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601',
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
)
ON CONFLICT DO NOTHING;

-- Insert all other users into mutechlabs org as members
-- (they require explicit role assignment later — no roles granted here)
INSERT INTO public.organization_members (org_id, user_id, invited_by)
SELECT
  (SELECT id FROM public.organizations WHERE slug = 'mutechlabs'),
  u.id,
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
FROM auth.users u
WHERE u.id <> '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
ON CONFLICT DO NOTHING;

-- Upgrade the organizations SELECT policy now that organization_members exists.
-- The temporary owner-only policy set in 20260310100000_organizations.sql is replaced
-- with the full member-based policy so any org member can read the org row.
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;

CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = organizations.id AND user_id = auth.uid()
    )
  );
