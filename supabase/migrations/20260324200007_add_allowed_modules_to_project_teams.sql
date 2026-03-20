-- =============================================================================
-- Add module allowlist to sub-teams.
--
-- Team invites (team_manager/team_member) derive module access from the team.
-- =============================================================================

ALTER TABLE public.project_teams
ADD COLUMN IF NOT EXISTS allowed_modules TEXT[];

COMMENT ON COLUMN public.project_teams.allowed_modules IS
  'Visible module allowlist for this sub-team. NULL means unrestricted.';
