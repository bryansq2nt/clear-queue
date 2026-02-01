-- ============================================
-- Add sort_order to budget_items for drag/drop
-- ============================================

ALTER TABLE public.budget_items
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill: assign order by created_at within each category
WITH ranked AS (
  SELECT
    id,
    category_id,
    ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY created_at ASC) - 1 AS rn
  FROM public.budget_items
)
UPDATE public.budget_items bi
SET sort_order = ranked.rn
FROM ranked
WHERE bi.id = ranked.id;

-- Performance
CREATE INDEX IF NOT EXISTS idx_budget_items_category_sort
  ON public.budget_items(category_id, sort_order);

