-- Plans are not finalized yet; raise the default project member cap so small teams
-- are not blocked at 3. Free tier → 10 members per project (pro already 10, business higher).

UPDATE public.plan_quotas
SET
  max_members_per_project = 10,
  updated_at = NOW()
WHERE plan = 'free';

ALTER TABLE public.plan_quotas
  ALTER COLUMN max_members_per_project SET DEFAULT 10;
