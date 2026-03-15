# Teams invite flow — fixes (2026-03-14)

## 1. Pending invites not showing in teams view

**Cause:** `listPendingInvites` used a Supabase/PostgREST select with embed  
`profiles!project_invites_invited_by_fkey(display_name)`.  
The FK `project_invites_invited_by_fkey` is `project_invites.invited_by → auth.users(id)`, not to `public.profiles`. There is no direct FK from `project_invites` to `profiles` (inviter display name lives in `profiles.user_id = invited_by`). The embed was therefore invalid; the query failed and the action returned `[]` on error.

**Fix:** Added RPC `get_pending_invites_for_project(p_project_id UUID)` that:
- Joins `project_invites` to `profiles` via `profiles.user_id = project_invites.invited_by`
- Returns pending invites with `role_name`, `profile_name`, `invite_role_name`, `invited_by_name`
- Is `SECURITY DEFINER` and enforces `is_project_member(p_project_id)`

`listPendingInvites` now calls this RPC instead of the broken embed. Pending invites appear correctly in the Team tab.

**Files:**  
- `supabase/migrations/20260313220000_get_pending_invites_for_project.sql`  
- `app/actions/teams.ts` (listPendingInvites)

---

## 2. Invitee not receiving the invite by email

**Cause:** No email was ever sent. The flow only generated a link and showed it in the UI for the inviter to copy and share manually.

**Fix:**  
- Added server action `sendInviteEmail(toEmail, inviteLink, projectName?)` that sends one transactional email via [Resend](https://resend.com) when `RESEND_API_KEY` is set.
- **Auto-send on create:** When you create an invite, the server sends the email automatically if `RESEND_API_KEY` and a base URL are set. The teams UI still shows a “Send invite by email” button to resend if needed.

**Setup for email delivery:**  
1. Sign up at [resend.com](https://resend.com) and get an API key.  
2. Add to `.env.local`:  
   - `RESEND_API_KEY=re_xxxx`  
   - `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (dev) or your production URL so the link in the email is correct.  
   - Optional: `RESEND_FROM_EMAIL=Your App <invites@yourdomain.com>` (defaults to `ClearQueue <onboarding@resend.dev>` for testing).  
3. For production, verify your domain in Resend and set `RESEND_FROM_EMAIL` to a sender on that domain.

**Files:**  
- `app/actions/teams.ts` (sendInviteEmail, escapeHtml; inviteProjectMember auto-sends when configured)  
- `app/context/[projectId]/team/ContextTeamClient.tsx` (Send email button, lastInvitedEmail, handleSendEmail; pass projectName; show emailSent/emailError)  
- `app/context/[projectId]/team/ContextTeamFromCache.tsx` (projectName in team data for email body)  
- Locales: `invite_send_email`, `invite_email_sending`, `invite_email_sent`, `invite_email_sent_hint`

---

## Important: role_id and profile_id are null by design

When you use the **invite role builder** (custom or saved role), the row is created with `invite_role_id` set and **`role_id` and `profile_id` left NULL**. That is intentional: `accept_invite_atomic` uses `invite_role_id` first to resolve the system role and module allowlist. Only the legacy path (no invite role) uses `role_id` and optionally `profile_id`. So seeing nulls in the table for role-builder invites is correct.

---

## Checklist for "it isn't working"

1. **Pending invites not showing**  
   Run the migration that adds the RPC:  
   `supabase/migrations/20260313220000_get_pending_invites_for_project.sql`  
   (Supabase Dashboard → SQL Editor → paste and run, or `supabase db push`.)

2. **Invite email not received**  
   - Set `RESEND_API_KEY` in `.env.local` (get a key from [resend.com](https://resend.com)).  
   - Set `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000` for dev or your production URL) so the link in the email is correct.  
   - Restart the dev server after changing env.  
   - Check spam; with `onboarding@resend.dev` as sender, some providers may filter.

3. **"Permission denied for table users" when revoking an invite**  
   The `project_invites_update` RLS policy was reading `auth.users` directly; the `authenticated` role cannot do that. Run the migration  
   `supabase/migrations/20260314000000_fix_project_invites_update_rls.sql`  
   so the policy uses a SECURITY DEFINER helper `current_auth_user_email()` instead. After that, any project member (including owners of projects created before RBAC) can revoke invites.

---

## Follow-ups

- **Query budget:** Team tab now does 6 parallel loads (members, invites, roles, profiles, reusableRoles, project). Architecture rule is ≤3 DB round trips for context tab; consider combining into one or two RPCs or reusing project name from layout if already loaded.
- **Invite email matching:** Accept flow does not enforce that the accepting user’s email matches `project_invites.email`; documented in `invite-flow-current-state-audit.md`. Consider enforcing for security.
