-- Business email (required for new businesses; nullable for existing rows)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Client links: store reference links per client
CREATE TABLE IF NOT EXISTS public.client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_links_client_id ON public.client_links(client_id);

ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own client links"
  ON public.client_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_links.client_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own client links"
  ON public.client_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_links.client_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own client links"
  ON public.client_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_links.client_id AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_links.client_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own client links"
  ON public.client_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_links.client_id AND c.owner_id = auth.uid()
    )
  );
