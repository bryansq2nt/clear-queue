-- ============================================================
-- Migration: rbac_audit_log table
-- Append-only log of security-sensitive mutations.
-- Actors: authenticated users only (no anonymous writes).
-- Readers: project members can read their project's log.
-- ============================================================

CREATE TABLE public.rbac_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,         -- e.g. 'invite.created', 'member.removed'
  resource_type TEXT        NOT NULL,         -- e.g. 'project_invite', 'project_member', 'task'
  resource_id   TEXT,                         -- affected row ID (nullable for bulk ops)
  project_id    UUID        REFERENCES public.projects(id)      ON DELETE SET NULL,
  org_id        UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the most common read patterns
CREATE INDEX audit_log_project   ON public.rbac_audit_log (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX audit_log_org       ON public.rbac_audit_log (org_id, created_at DESC)
  WHERE org_id IS NOT NULL;
CREATE INDEX audit_log_actor     ON public.rbac_audit_log (actor_user_id, created_at DESC);
CREATE INDEX audit_log_action    ON public.rbac_audit_log (action, created_at DESC);

ALTER TABLE public.rbac_audit_log ENABLE ROW LEVEL SECURITY;

-- Project members can read the audit log for their project
CREATE POLICY "audit_log_project_select" ON public.rbac_audit_log
  FOR SELECT USING (
    project_id IS NOT NULL AND public.is_project_member(project_id)
  );

-- Org members can read org-level audit events
CREATE POLICY "audit_log_org_select" ON public.rbac_audit_log
  FOR SELECT USING (
    org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = rbac_audit_log.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Actors can always read their own entries
CREATE POLICY "audit_log_own_select" ON public.rbac_audit_log
  FOR SELECT USING (actor_user_id = auth.uid());

-- Authenticated users can insert (server actions only; RLS prevents cross-project fakes)
-- Application-level auth guard (requireAuth) is always the first line of defence.
CREATE POLICY "audit_log_insert" ON public.rbac_audit_log
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND actor_user_id = auth.uid()
  );

-- No UPDATE or DELETE — audit log is append-only
