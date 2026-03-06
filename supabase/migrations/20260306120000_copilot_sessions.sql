-- copilot_sessions: one planning session per project per user.
-- V1 surfaces only the most recent active session per project.

CREATE TABLE public.copilot_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'active', -- active | archived
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes
CREATE INDEX idx_copilot_sessions_project_id
  ON public.copilot_sessions (project_id, created_at DESC);

CREATE INDEX idx_copilot_sessions_owner_id
  ON public.copilot_sessions (owner_id);

-- updated_at trigger
CREATE TRIGGER update_copilot_sessions_updated_at
  BEFORE UPDATE ON public.copilot_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select copilot sessions"
  ON public.copilot_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can insert copilot sessions"
  ON public.copilot_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update copilot sessions"
  ON public.copilot_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete copilot sessions"
  ON public.copilot_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );
