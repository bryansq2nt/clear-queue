-- =============================================================================
-- Temporary product decision:
-- Until plan upgrade flows are implemented, set default project quota to 15.
-- =============================================================================

-- 1) New plan rows default to 15 projects (instead of 3).
ALTER TABLE public.plan_quotas
ALTER COLUMN max_projects_per_org SET DEFAULT 15;

-- 2) Current default plan ("free") should allow 15 projects.
UPDATE public.plan_quotas
SET max_projects_per_org = 15,
    updated_at = NOW()
WHERE plan = 'free';
