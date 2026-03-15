-- ============================================================
-- Migration: Invite reject flow
--
-- Allow invitees to decline with an optional reason. The inviter
-- can see rejected invites and the reason in the Teams module.
-- ============================================================

-- Add rejected status and rejection metadata to project_invites
ALTER TABLE public.project_invites
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Allow status 'rejected' (drop and recreate CHECK)
ALTER TABLE public.project_invites
  DROP CONSTRAINT IF EXISTS project_invites_status_check;

ALTER TABLE public.project_invites
  ADD CONSTRAINT project_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked', 'rejected'));

-- RPC: reject an invite (only the invited email can reject)
CREATE OR REPLACE FUNCTION public.reject_invite_atomic(
  p_token   TEXT,
  p_user_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite   RECORD;
  v_user_email TEXT;
BEGIN
  SELECT id, email, status, expires_at
  INTO v_invite
  FROM public.project_invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_not_pending';
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  SELECT LOWER(TRIM(email)) INTO v_user_email
  FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR v_user_email <> LOWER(TRIM(v_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  UPDATE public.project_invites
  SET
    status = 'rejected',
    rejected_at = NOW(),
    rejection_reason = NULLIF(TRIM(p_reason), '')
  WHERE id = v_invite.id;
END;
$$;

COMMENT ON FUNCTION public.reject_invite_atomic(TEXT, UUID, TEXT) IS
  'Rejects a project invite for the given user. Only the invited email can reject. Optional reason is stored for the inviter.';

REVOKE EXECUTE ON FUNCTION public.reject_invite_atomic(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_invite_atomic(TEXT, UUID, TEXT) TO authenticated;

-- RPC: list rejected invites for a project (for the Teams tab)
CREATE OR REPLACE FUNCTION public.get_rejected_invites_for_project(p_project_id UUID)
RETURNS TABLE (
  id                UUID,
  email             TEXT,
  role_name         TEXT,
  profile_name      TEXT,
  invite_role_name  TEXT,
  invited_by_name   TEXT,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.id,
    pi.email,
    COALESCE(rr.name, '')::TEXT AS role_name,
    pap.name::TEXT AS profile_name,
    pir.name::TEXT AS invite_role_name,
    COALESCE(pr.display_name, split_part(au.email, '@', 1), '')::TEXT AS invited_by_name,
    pi.rejected_at,
    pi.rejection_reason
  FROM public.project_invites pi
  LEFT JOIN public.rbac_roles rr ON rr.id = pi.role_id
  LEFT JOIN public.project_access_profiles pap ON pap.id = pi.profile_id
  LEFT JOIN public.project_invite_roles pir ON pir.id = pi.invite_role_id
  LEFT JOIN auth.users au ON au.id = pi.invited_by
  LEFT JOIN public.profiles pr ON pr.user_id = pi.invited_by
  WHERE pi.project_id = p_project_id
    AND pi.status = 'rejected'
    AND public.is_project_member(p_project_id)
  ORDER BY pi.rejected_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rejected_invites_for_project(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rejected_invites_for_project(UUID) TO authenticated;
