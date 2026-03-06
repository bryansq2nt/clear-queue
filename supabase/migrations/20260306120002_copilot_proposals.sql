-- copilot_proposals: structured AI-generated suggestions (tasks, notes) awaiting user approval.
-- payload JSONB maps directly to the target entity insert shape.
-- created_entity_id is set when the proposal is approved.

CREATE TABLE public.copilot_proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES public.copilot_messages(id) ON DELETE SET NULL,
  project_id        UUID NOT NULL,
  owner_id          UUID NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('task', 'note')),
  payload           JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_entity_id UUID,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes
CREATE INDEX idx_copilot_proposals_session_status
  ON public.copilot_proposals (session_id, status);

CREATE INDEX idx_copilot_proposals_project_id
  ON public.copilot_proposals (project_id, created_at DESC);

CREATE INDEX idx_copilot_proposals_message_id
  ON public.copilot_proposals (message_id);

-- updated_at trigger
CREATE TRIGGER update_copilot_proposals_updated_at
  BEFORE UPDATE ON public.copilot_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.copilot_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select copilot proposals"
  ON public.copilot_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can insert copilot proposals"
  ON public.copilot_proposals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update copilot proposals"
  ON public.copilot_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete copilot proposals"
  ON public.copilot_proposals FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );
