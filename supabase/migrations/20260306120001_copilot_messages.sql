-- copilot_messages: individual turns (user + assistant) in a copilot session.
-- content stores raw assistant output including <<PROPOSALS>> blocks (re-parseable if parser is updated).
-- Messages are immutable — no updated_at trigger needed.

CREATE TABLE public.copilot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL,
  owner_id    UUID NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  token_count INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Index for loading a session's messages in order
CREATE INDEX idx_copilot_messages_session_id
  ON public.copilot_messages (session_id, created_at ASC);

-- Index for rate limit COUNT queries (owner + role + created_at)
CREATE INDEX idx_copilot_messages_owner_rate_limit
  ON public.copilot_messages (owner_id, role, created_at DESC);

CREATE INDEX idx_copilot_messages_project_id
  ON public.copilot_messages (project_id, created_at DESC);

-- RLS
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select copilot messages"
  ON public.copilot_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can insert copilot messages"
  ON public.copilot_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete copilot messages"
  ON public.copilot_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );
