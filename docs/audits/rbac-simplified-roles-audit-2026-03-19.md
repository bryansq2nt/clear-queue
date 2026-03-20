# RBAC Simplified Roles Audit — 2026-03-19

Scope audited against plan: `docs/plans/plan-rbac-simplified-roles.md`

[PASS] 1.1 `DROP TABLE IF EXISTS public.user_project_action_grants` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (line 27).  
[PASS] 1.2 `DROP TABLE IF EXISTS public.project_access_profiles` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (line 29).  
[PASS] 1.3 `DROP TABLE IF EXISTS public.project_invite_roles` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (line 28).  
[PASS] 1.4 `ALTER TABLE ... DROP COLUMN ... profile_id` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (lines 33-35).  
[PASS] 1.5 `ALTER TABLE ... DROP COLUMN ... invite_role_id` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (lines 33-35).  
[PASS] 1.6 `TRUNCATE public.user_role_assignments` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (line 68).  
[PASS] 1.7 `TRUNCATE public.rbac_role_module_actions` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (line 69).  
[FAIL] 1.8 `TRUNCATE public.rbac_module_actions` required by plan (`docs/plans/plan-rbac-simplified-roles.md`, line 165) is absent from `supabase/migrations/20260324200000_remove_legacy_rbac.sql`.  
[PASS] 1.9 `DELETE FROM public.rbac_roles WHERE is_system_role = true` present in `supabase/migrations/20260324200000_remove_legacy_rbac.sql` (line 70).  
[DEVIATION] 1.10 Phase 1 file contains statements not in plan Phase 1 SQL: adds `project_invites.allowed_modules` + `project_invites.guest_scope` (lines 37-39), adds `user_project_access_grants.read_scope` (lines 53-55), rewrites multiple RPC/functions (`get_pending_invites_for_project`, `accept_invite_atomic`, `get_member_access_for_project`, `update_member_access_full_atomic`, `update_member_role_atomic`, `get_invite_by_token`, etc.; lines 78-435).

[DEVIATION] 2.1 Action key seeding does not follow plan’s simplified DO-block (`{module}.read/create/update/delete`, 51 keys; plan lines 186-215). `supabase/migrations/20260324200001_seed_simplified_roles.sql` explicitly states existing granular keys are preserved (lines 7-10) and grants large granular `IN (...)` sets (e.g., lines 57-125, 140-204, 218-236).  
[PASS] 2.2 Migration inserts 5 roles `owner`, `project_manager`, `team_manager`, `team_member`, `guest` in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 19-25).  
[PASS] 2.3a `owner` granted all currently existing action keys via cross join in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 29-34).  
[PASS] 2.3b `project_manager` granted all currently existing action keys via cross join in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 38-43).  
[DEVIATION] 2.3c `team_manager` grant logic uses legacy granular allowlist (`tasks.assign`, `notes.update_title`, `teams.update_project_member_roles`, etc.) in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 56-125), not plan’s simplified “all except `projects.manage_modules`” model (plan lines 231-237).  
[DEVIATION] 2.3d `team_member` grant logic uses legacy granular allowlist in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 139-204), not plan’s simplified exclusion-only model (plan lines 239-248).  
[DEVIATION] 2.3e `guest` includes scoped read variants (`*.read.own/team/project`) in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 226-236), while plan requires only `%.read` (plan lines 250-255).  
[DEVIATION] 2.4 Phase 2 migration does not add `read_scope`; it was moved to Phase 1 (`supabase/migrations/20260324200000_remove_legacy_rbac.sql`, lines 53-55). Plan places this in Phase 2 (plan lines 257-260).  
[PASS] 2.5 Owner role backfill from `projects.owner_id` present in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 245-253).

[PASS] 3.1 `task_activity_log` table exists in `supabase/migrations/20260324200002_task_activity_log.sql` (line 13).  
[PASS] 3.2 Required columns/constraints match plan: PK/UUID, FKs, action check values, `changed_fields`, `created_at` in `supabase/migrations/20260324200002_task_activity_log.sql` (lines 14-25).  
[PASS] 3.3 Index `(task_id, created_at DESC)` present in `supabase/migrations/20260324200002_task_activity_log.sql` (lines 28-29).  
[PASS] 3.4 Index `(project_id, created_at DESC)` present in `supabase/migrations/20260324200002_task_activity_log.sql` (lines 32-33).  
[PASS] 3.5 RLS enabled in `supabase/migrations/20260324200002_task_activity_log.sql` (line 35).  
[PASS] 3.6 SELECT policy uses `is_project_member(project_id)` in `supabase/migrations/20260324200002_task_activity_log.sql` (lines 38-40).  
[PASS] 3.7 INSERT policy for authenticated users in `supabase/migrations/20260324200002_task_activity_log.sql` (lines 45-47).  
[PASS] 3.8 No UPDATE/DELETE policies (append-only) and RLS write gap not present for intended behavior (`supabase/migrations/20260324200002_task_activity_log.sql`, lines 49-50).

[DEVIATION] 4.1 Prefix `20260324200*` contains unexpected file `supabase/migrations/20260324200003_cleanup_scoped_read_action_keys.sql` (glob result). It deletes `%.read.own/team/project` keys (lines 19-22) as a cleanup/fixup for earlier role seeding drift; planned Phase 5 file name `20260324200003_simplified_accept_invite.sql` (plan line 363) is not present under this prefix.

[PASS] 5.1 `user_project_action_grants` absent from `lib/rbac/resolver.ts` (search returned no matches).  
[PASS] 5.2 `getGrantedActions()` performs role expansion via `user_role_assignments` and `rbac_role_module_actions`/`rbac_module_actions` in `lib/rbac/resolver.ts` (lines 65-114); no override table logic remains.  
[PASS] 5.3 `getGrantedActions` is wrapped with `cache()` in `lib/rbac/resolver.ts` (lines 55-60).

[PASS] 6.1 `getReadScope()` queries `user_role_assignments` role name in `lib/rbac/read-scope.ts` (lines 42-48).  
[PASS] 6.2 Role mapping matches plan exactly in `lib/rbac/read-scope.ts` (switch lines 59-79; guest reads `user_project_access_grants.read_scope` lines 49-54, 70-74).  
[PASS] 6.3 No action-key variant checks and no `rbac_role_module_actions`/`rbac_module_actions` queries in `lib/rbac/read-scope.ts`.  
[PASS] 6.4 Owner fast path exists in `lib/rbac/read-scope.ts` (lines 32-40).

[PASS] 7.1a `createTask` logs `created` to `task_activity_log` via `logTaskActivity` in `app/actions/tasks.ts` (lines 126-135).  
[PARTIAL] 7.1b `updateTask` logs, but uses `status_changed` vs `updated` and never emits `assigned`/`unassigned` event on assignment change; see `activityAction` logic in `app/actions/tasks.ts` (lines 235-248).  
[PASS] 7.1c `updateTaskOrder` logs `status_changed` in `app/actions/tasks.ts` (lines 643-653).  
[PASS] 7.1d `deleteTask` logs `deleted` in `app/actions/tasks.ts` (lines 311-318).  
[DEVIATION] 7.2 Legacy task keys still used in `app/actions/tasks.ts`: `tasks.assign` (lines 191, 733), `tasks.bulk_delete` (line 340), `tasks.update_status` (line 612); plan simplified set is `tasks.read/create/update/delete`.  
[PASS] 7.3 `getBoardPermissions()` uses `getReadScope()` in `app/actions/tasks.ts` (lines 727-730).  
[PASS] 7.4 `resolveTaskReadScope()` helper is absent from `app/actions/tasks.ts` (no matches).

[PARTIAL] 8.1 `inviteProjectMember` derives guest scope correctly (`team_manager` -> `team`, else `project`) in `app/actions/teams.ts` (lines 297-307), but signature is positional `(projectId, email, roleId, allowedModules?, ...)` not `{ email, roleId, allowedModules }` object (lines 248-255).  
[PASS] 8.2 `inviteProjectMember` does not accept `profileId`/`customRoleId`/`inviteRoleId` in `app/actions/teams.ts` (lines 248-255).  
[PASS] 8.3 `listProjectRoles` returns only `owner`, `project_manager`, `team_manager`, `team_member`, `guest` and sorts hierarchy in `app/actions/teams.ts` (lines 230-242).  
[TECH DEBT] 8.4 `createInviteRole`, `listReusableInviteRoles`, `listProjectAccessProfiles` remain exported as deprecated compatibility stubs in `app/actions/teams.ts` (lines 193-226).  
[PASS] 8.5 No `user_project_action_grants` references in `app/actions/teams.ts` (search returned no matches).

[DEVIATION] 9.1 Cross-file task action keys include legacy keys beyond simplified model: `tasks.assign`, `tasks.bulk_delete`, `tasks.update_status` found in `app/actions/tasks.ts` (lines 191, 340, 612, 733).  
[DEVIATION] 9.2 Cross-file modules use many granular legacy keys (`notes.update_title`, `documents.view_signed_url`, `media.share_create`, `billings.update_description`, `ideas.create_node`, `todos.create_list`, `projects.toggle_module`, `teams.invite_project_member`, etc.) per `app/actions/**` search output; does not conform to `{module}.read/create/update/delete` + 3 cross-module keys.  
[PASS] 9.3 App key usage is broadly consistent with what Phase 2 actually assigns (legacy/granular mapping), e.g., Phase 2 explicitly grants keys like `tasks.assign`/`tasks.update_status` and app checks those same keys (`supabase/migrations/20260324200001_seed_simplified_roles.sql`, lines 59-63, 142-146; `app/actions/tasks.ts`, lines 191, 612, 733).

[FAIL] 10.1 Invite UI is not plan’s 2-step modules -> role flow; it is 4-step `email -> mode -> modules -> review` in `app/context/[projectId]/team/ContextTeamClient.tsx` (line 398; step render blocks at lines 1287, 1334, 1449, 1527).  
[FAIL] 10.2 Role options are not constrained by inviter role (Owner/PM/TM matrix). UI uses saved-role/custom mode without inviter-role gating (`app/context/[projectId]/team/ContextTeamClient.tsx`, lines 1334-1416).  
[FAIL] 10.3 Component still references `inviteRoleId` in `app/context/[projectId]/team/ContextTeamClient.tsx` (lines 793, 800, 823).  
[FAIL] 10.4 Submit call passes positional args `inviteProjectMember(projectId, email, roleId, null, undefined, projectName)` in `app/context/[projectId]/team/ContextTeamClient.tsx` (lines 839-846), not plan’s `{ email, roleId, allowedModules }`.

[PARTIAL] 11.1 Legacy tables are removed, but migration sequencing diverges from plan (Phase 1 includes extra rewrites and shifted columns; missing planned Phase 5 filename).  
[FAIL] 11.2 5 roles exist, but action sets are not the plan’s simplified structure (granular legacy mapping retained).  
[PASS] 11.3 Owner role backfill present in `supabase/migrations/20260324200001_seed_simplified_roles.sql` (lines 245-253).  
[PASS] 11.4 `getReadScope()` matches role-derived design in `lib/rbac/read-scope.ts` (lines 59-79).  
[FAIL] 11.5 `can()`/app checks are not aligned to new simplified keys; server actions still check granular keys across modules (`app/actions/**` search results).  
[FAIL] 11.6 Invite flow is not modules -> role 2-step (UI evidence in Step 10.1).  
[PASS] 11.7 Guest scope auto-derivation implemented in `app/actions/teams.ts` (lines 297-307, 326).  
[PARTIAL] 11.8 Task activity log exists and many events are logged, but `assigned`/`unassigned` events are not emitted distinctly in `updateTask` (`app/actions/tasks.ts`, lines 235-248).  
[N/A] 11.9 Data preservation cannot be verified without live DB reset/data validation.  
[PARTIAL] 11.10 `npm run lint`, `npm run build`, `npm run test -- --run` completed successfully, but build shows Sentry network upload errors (`Could not resolve host: sentry.io`) in sandboxed environment.

## Summary

- Total counts: **PASS 39 / FAIL 10 / DEVIATION 10 / PARTIAL 6 / TECH DEBT 1 / N/A 1**.
- Biggest structural deviation: **Phase 2 did not implement the simplified action-key model**. Plan required canonical `{module}.read/create/update/delete` keys (+3 cross-module keys), but implementation preserved granular legacy keys. This propagated into app permission checks and required cleanup migration `20260324200003_cleanup_scoped_read_action_keys.sql`.
- Phase status:
  - **Complete (mostly):** Phase 3 schema; Phase 4 resolver/read-scope direction.
  - **Incomplete/incorrect:** Phase 1 boundary + missing truncate; Phase 2 model mismatch; Phase 6 UI mismatch.
  - **Mixed:** Phase 5 behavior partially merged into Phase 1 rewrites instead of clean phase/file alignment.
- Must fix before plan completion:
  1. Re-seed action keys/role grants to the simplified model.
  2. Remove granular legacy permission checks in server actions.
  3. Rebuild invite flow to modules -> role with inviter-role gating.
  4. Emit explicit `assigned` / `unassigned` task activity events.
  5. Align migrations to planned phase boundaries and filenames/content.
