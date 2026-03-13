-- ============================================================
-- Migration: create organizations table + seed mutechlabs org
-- Admin user: 8df49d2b-9bd4-4a98-8f39-865cc68ea601
-- ============================================================

CREATE TABLE public.organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan            TEXT NOT NULL DEFAULT 'free',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX organizations_owner ON public.organizations (owner_user_id);
CREATE INDEX organizations_slug  ON public.organizations (slug);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Temporary: only the owner can read their org.
-- Upgraded to member-based access in 20260310100003_organization_members.sql
-- once the organization_members table exists.
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (owner_user_id = auth.uid());

-- Only the owner can update the org
CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE USING (owner_user_id = auth.uid());

-- Only the owner can delete the org
CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE USING (owner_user_id = auth.uid());

-- Seed the mutechlabs organization for the admin user
INSERT INTO public.organizations (id, name, slug, owner_user_id, plan)
VALUES (
  gen_random_uuid(),
  'mutechlabs',
  'mutechlabs',
  '8df49d2b-9bd4-4a98-8f39-865cc68ea601',
  'free'
);
