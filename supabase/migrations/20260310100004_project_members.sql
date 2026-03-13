-- ============================================================
-- Migration: create project_members table
-- Insert admin user as member of all their own projects
-- Admin user: 8df49d2b-9bd4-4a98-8f39-865cc68ea601
-- ============================================================

CREATE TABLE public.project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- Critical index for RLS performance — must exist before RLS rewrite phase
CREATE INDEX project_members_lookup ON public.project_members (project_id, user_id);
CREATE INDEX project_members_user   ON public.project_members (user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own project memberships
CREATE POLICY "project_members_own_select" ON public.project_members
  FOR SELECT USING (user_id = auth.uid());

-- Any project member can see all members of the same project (team directory)
CREATE POLICY "project_members_team_select" ON public.project_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm2
      WHERE pm2.project_id = project_members.project_id
        AND pm2.user_id = auth.uid()
    )
  );

-- Insert admin user as member of all their own projects
-- invited_by is themselves (bootstrap)
INSERT INTO public.project_members (project_id, user_id, invited_by)
SELECT
  p.id,
  p.owner_id,
  p.owner_id
FROM public.projects p
WHERE p.owner_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
ON CONFLICT DO NOTHING;

-- Validation: every admin project must have a project_members row
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_members pm ON p.id = pm.project_id
    WHERE p.owner_id = '8df49d2b-9bd4-4a98-8f39-865cc68ea601'
      AND pm.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill failed: some admin projects have no project_members row';
  END IF;
END $$;
