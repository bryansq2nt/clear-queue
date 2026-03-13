-- ============================================================
-- Migration: plan_quotas table
-- Defines per-plan limits for org and project resources.
-- Plans: free | pro | business
-- ============================================================

CREATE TABLE public.plan_quotas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan                    TEXT NOT NULL UNIQUE,
  max_projects_per_org    INT  NOT NULL DEFAULT 3,
  max_members_per_project INT  NOT NULL DEFAULT 3,
  max_org_members         INT  NOT NULL DEFAULT 5,
  max_storage_bytes       BIGINT NOT NULL DEFAULT 524288000, -- 500 MB
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_plan_quotas_updated_at
  BEFORE UPDATE ON public.plan_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.plan_quotas ENABLE ROW LEVEL SECURITY;

-- Everyone (authenticated) can read quotas — they are not secret
CREATE POLICY "plan_quotas_select" ON public.plan_quotas
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only service-role / super-admin can mutate quotas; no self-service writes
-- (No INSERT/UPDATE/DELETE policies — only service role bypasses RLS)

-- ── Seed ─────────────────────────────────────────────────────────────

INSERT INTO public.plan_quotas
  (plan, max_projects_per_org, max_members_per_project, max_org_members, max_storage_bytes)
VALUES
  -- Free: small team, limited projects, 500 MB storage
  ('free',     3,  3,   5,   524288000),
  -- Pro: medium team, more projects, 5 GB storage
  ('pro',     20, 10,  25,  5368709120),
  -- Business: large team, unlimited-ish projects, 50 GB storage
  ('business', 100, 100, 200, 53687091200)
ON CONFLICT (plan) DO UPDATE
  SET max_projects_per_org    = EXCLUDED.max_projects_per_org,
      max_members_per_project = EXCLUDED.max_members_per_project,
      max_org_members         = EXCLUDED.max_org_members,
      max_storage_bytes       = EXCLUDED.max_storage_bytes,
      updated_at              = NOW();

-- ── Helper RPC: check_project_member_quota ────────────────────────────
-- Returns TRUE when the project can accept one more member.
-- Compares current member count against the org's plan quota.
-- Called from application code before inserting a new project_members row.

CREATE OR REPLACE FUNCTION public.check_project_member_quota(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.project_members WHERE project_id = p_project_id)
    <
    (
      SELECT pq.max_members_per_project
      FROM public.projects p
      JOIN public.organizations o ON o.id = p.org_id
      JOIN public.plan_quotas pq ON pq.plan = o.plan
      WHERE p.id = p_project_id
    );
$$;

-- ── Helper RPC: check_org_project_quota ──────────────────────────────
-- Returns TRUE when the org can create one more project.

CREATE OR REPLACE FUNCTION public.check_org_project_quota(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.projects WHERE org_id = p_org_id)
    <
    (
      SELECT pq.max_projects_per_org
      FROM public.organizations o
      JOIN public.plan_quotas pq ON pq.plan = o.plan
      WHERE o.id = p_org_id
    );
$$;
