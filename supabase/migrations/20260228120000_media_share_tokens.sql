-- Media share tokens: allow owners to create shareable read-only links.
-- Public view uses get_media_share_by_token(token) to resolve token without exposing other rows.

CREATE TABLE public.media_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  signed_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  mime_type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_share_tokens_token ON public.media_share_tokens(token);
CREATE INDEX idx_media_share_tokens_expires_at ON public.media_share_tokens(expires_at);

ALTER TABLE public.media_share_tokens ENABLE ROW LEVEL SECURITY;

-- Only the file owner can insert/select/delete their share tokens
CREATE POLICY "media_share_tokens owner manage"
  ON public.media_share_tokens
  FOR ALL
  USING (
    file_id IN (
      SELECT id FROM public.project_files
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    file_id IN (
      SELECT id FROM public.project_files
      WHERE owner_id = auth.uid()
    )
  );

-- Resolve token for public share view: returns row only if token matches and not expired
CREATE OR REPLACE FUNCTION public.get_media_share_by_token(p_token TEXT)
RETURNS TABLE (
  signed_url TEXT,
  title TEXT,
  description TEXT,
  mime_type TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.signed_url, t.title, t.description, t.mime_type
  FROM public.media_share_tokens t
  WHERE t.token = p_token
    AND t.expires_at > NOW();
$$;
