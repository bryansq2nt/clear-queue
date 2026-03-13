-- ============================================================
-- Migration: add nullable org_id column to projects
-- Safe: nullable, no existing queries break
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX projects_org_id ON public.projects (org_id);
