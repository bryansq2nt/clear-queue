-- Migration: billing_categories table + new billing columns
-- Phase 1 of billing module upgrade (v3)
-- Created: 2026-03-08

-- ─── billing_categories ───────────────────────────────────────────────────────

CREATE TABLE public.billing_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  color       TEXT         NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_categories_select" ON public.billing_categories
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "billing_categories_insert" ON public.billing_categories
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "billing_categories_update" ON public.billing_categories
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "billing_categories_delete" ON public.billing_categories
  FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX billing_categories_owner_sort_idx ON public.billing_categories(owner_id, sort_order);

CREATE TRIGGER update_billing_categories_updated_at
  BEFORE UPDATE ON public.billing_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── New columns on billings ──────────────────────────────────────────────────

ALTER TABLE public.billings
  ADD COLUMN IF NOT EXISTS category_id           UUID    NULL REFERENCES public.billing_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type                  TEXT    NOT NULL DEFAULT 'charge' CHECK (type IN ('charge', 'payment', 'spending')),
  ADD COLUMN IF NOT EXISTS issued_at             DATE    NULL,
  ADD COLUMN IF NOT EXISTS payment_method        TEXT    NULL,
  ADD COLUMN IF NOT EXISTS paid_by               TEXT    NULL,
  ADD COLUMN IF NOT EXISTS expect_reimbursement  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reimburse_to_client_id UUID   NULL REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX billings_category_id_idx ON public.billings(category_id);
CREATE INDEX billings_type_idx ON public.billings(project_id, type);
