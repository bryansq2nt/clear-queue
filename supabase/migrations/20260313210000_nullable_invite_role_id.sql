-- ============================================================
-- Migration: Make project_invites.role_id nullable
--
-- When invite_role_id is set, role_id is redundant — accept_invite_atomic
-- already resolves the system role from project_invite_roles.effective_role_name.
-- Making role_id nullable removes the need for a server-side UUID lookup
-- of the system role when creating an invite via the role builder.
-- ============================================================

ALTER TABLE public.project_invites
  ALTER COLUMN role_id DROP NOT NULL;
