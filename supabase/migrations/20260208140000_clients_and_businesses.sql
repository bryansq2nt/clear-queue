-- ============================================
-- CLIENTS + BUSINESSES MODULES
-- Links to projects: one client, optional business (business must belong to client)
-- ============================================

-- ---------------------------------------------------------------------------
-- A) Table: public.clients
-- ---------------------------------------------------------------------------
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gender TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  preferences TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_owner_id ON public.clients(owner_id);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own clients"
  ON public.clients FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own clients"
  ON public.clients FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own clients"
  ON public.clients FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own clients"
  ON public.clients FOR DELETE
  USING (owner_id = auth.uid());

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- B) Table: public.businesses
-- ---------------------------------------------------------------------------
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  website TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_businesses_owner_id ON public.businesses(owner_id);
CREATE INDEX idx_businesses_client_id ON public.businesses(client_id);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own businesses"
  ON public.businesses FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own businesses"
  ON public.businesses FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own businesses"
  ON public.businesses FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own businesses"
  ON public.businesses FOR DELETE
  USING (owner_id = auth.uid());

CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- C) Table: public.business_media
-- ---------------------------------------------------------------------------
CREATE TABLE public.business_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_media_business_id ON public.business_media(business_id);

ALTER TABLE public.business_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select media of own businesses"
  ON public.business_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert media in own businesses"
  ON public.business_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update media in own businesses"
  ON public.business_media FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete media in own businesses"
  ON public.business_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_media.business_id AND b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- D) Alter projects: add client_id, business_id (nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_business_id ON public.projects(business_id);

-- ---------------------------------------------------------------------------
-- E) Data integrity trigger: business must belong to project's client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_project_client_business()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.business_id IS NOT NULL THEN
    IF NEW.client_id IS NULL THEN
      RAISE EXCEPTION 'Project must have a client when a business is assigned.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = NEW.business_id AND b.client_id = NEW.client_id
    ) THEN
      RAISE EXCEPTION 'The selected business does not belong to the selected client.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_project_client_business_trigger ON public.projects;
CREATE TRIGGER check_project_client_business_trigger
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.check_project_client_business();

-- ---------------------------------------------------------------------------
-- F) RLS already in place for clients, businesses, business_media above.
--    projects RLS unchanged (owner_id = auth.uid()); new columns are data only.
-- ---------------------------------------------------------------------------
