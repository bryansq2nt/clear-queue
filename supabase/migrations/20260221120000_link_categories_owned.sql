-- ============================================
-- LINK VAULT Phase 6: User-owned categories
-- Categories have owner_id; users can add, edit, delete. Default set seeded per user.
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. Table: public.link_categories
-- ---------------------------------------------------------------------------
CREATE TABLE public.link_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_link_categories_owner_sort
  ON public.link_categories(owner_id, sort_order);

CREATE TRIGGER update_link_categories_updated_at
  BEFORE UPDATE ON public.link_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.link_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own link_categories"
  ON public.link_categories FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own link_categories"
  ON public.link_categories FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own link_categories"
  ON public.link_categories FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own link_categories"
  ON public.link_categories FOR DELETE
  USING (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Add category_id to project_links
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_links
  ADD COLUMN category_id UUID REFERENCES public.link_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_project_links_category_id
  ON public.project_links(project_id, category_id, pinned DESC, created_at DESC);

ALTER TABLE public.project_links
  ALTER COLUMN section DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Seed default categories for existing owners and backfill
-- ---------------------------------------------------------------------------
INSERT INTO public.link_categories (owner_id, name, sort_order)
SELECT o.owner_id, d.name, d.sort_order
FROM (SELECT DISTINCT owner_id FROM public.project_links) o
CROSS JOIN (
  VALUES ('Delivery', 0), ('Infrastructure', 1), ('Product', 2), ('Marketing', 3), ('Operations', 4), ('Client', 5), ('Other', 6)
) AS d(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.link_categories lc
  WHERE lc.owner_id = o.owner_id AND lc.name = d.name
);

-- Backfill category_id from section (enum -> default category name mapping)
UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Delivery'
)
WHERE pl.section = 'delivery' AND pl.category_id IS NULL;

UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Infrastructure'
)
WHERE pl.section = 'infrastructure' AND pl.category_id IS NULL;

UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Product'
)
WHERE pl.section = 'product' AND pl.category_id IS NULL;

UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Marketing'
)
WHERE pl.section = 'marketing' AND pl.category_id IS NULL;

UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Operations'
)
WHERE pl.section = 'operations' AND pl.category_id IS NULL;

UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Client'
)
WHERE pl.section = 'client' AND pl.category_id IS NULL;

UPDATE public.project_links pl
SET category_id = (
  SELECT lc.id FROM public.link_categories lc
  WHERE lc.owner_id = pl.owner_id AND lc.name = 'Other'
)
WHERE pl.section = 'other' AND pl.category_id IS NULL;
