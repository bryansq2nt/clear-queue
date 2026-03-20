-- =============================================================================
-- Phase 3b: Remove scoped read action key rows from rbac_module_actions
--
-- The simplified 5-role system derives read scope from the role name via
-- getReadScope() in lib/rbac/read-scope.ts, not from action key variants.
--
-- Rows like tasks.read.own / tasks.read.team / tasks.read.project are noise —
-- they were granted in Phase 2 for owner/PM via CROSS JOIN (harmless, but
-- inconsistent with the design), and explicitly in team_manager/team_member
-- lists (a mistake; scope is role-derived, not key-derived).
--
-- Deleting them from rbac_module_actions cascades to rbac_role_module_actions
-- (the join table), removing all grants automatically.
--
-- Affected modules with scoped variants:
--   tasks, notes, documents, media, calendar, links, ideas, budgets, billings
-- =============================================================================

DELETE FROM public.rbac_module_actions
WHERE action_key LIKE '%.read.own'
   OR action_key LIKE '%.read.team'
   OR action_key LIKE '%.read.project';
