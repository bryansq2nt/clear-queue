-- =============================================================================
-- Fix: project_modules SELECT policy — allow project members to read module
-- settings for projects they belong to.
--
-- Root cause: the original RLS only grants SELECT to the project owner
-- (p.owner_id = auth.uid()). Team members cannot read project_modules rows,
-- so getProjectModules() returns [] for them. resolveModules([]) then falls
-- back to registry defaults where media.defaultEnabled = false, making every
-- non-default module appear disabled to all non-owner members.
--
-- Fix: add a separate SELECT policy for project members using is_project_member().
-- Write policies (INSERT / UPDATE / DELETE) remain owner-only.
-- =============================================================================

CREATE POLICY "Members can select project modules"
  ON public.project_modules FOR SELECT
  USING (
    public.is_project_member(project_id)
  );
