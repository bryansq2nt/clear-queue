import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Detects which critical migrations have been applied by querying DB objects
 * directly — no information_schema (not accessible via PostgREST).
 *
 * GET /api/debug/migration-status
 * Only available in development.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only in development' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      },
      { status: 500 }
    );
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Try selecting a specific column from a table; success = table+column exist
  async function colExists(table: string, col: string): Promise<boolean> {
    const { error } = await (db as any).from(table).select(col).limit(0);
    return !error;
  }

  // tableExists using a column we know should be there
  async function tableOk(table: string, col: string): Promise<boolean> {
    return colExists(table, col);
  }

  // Count rows using a column that exists (not necessarily 'id')
  async function count(
    table: string,
    col: string,
    filters: Record<string, unknown> = {}
  ): Promise<number> {
    let q = (db as any).from(table).select(col, { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { count: n, error } = await q;
    if (error) return -1; // -1 = query failed (likely column/table missing)
    return n ?? 0;
  }

  // Check function existence by calling it with a dummy token —
  // "invite_not_found" → function exists with new signature
  // "does not exist" / "Could not find" → function missing or wrong signature
  async function checkAcceptInviteAtomic(): Promise<{
    exists: boolean;
    signature_ok: boolean;
    error_detail: string;
  }> {
    const { error } = await (db as any).rpc('accept_invite_atomic', {
      p_token: '__diag_test__',
      p_user_id: '00000000-0000-0000-0000-000000000001',
    });
    const msg: string = error?.message ?? '';
    const hint: string = error?.hint ?? '';
    const notFound =
      msg.includes('does not exist') || msg.includes('Could not find');
    const wrongSig =
      msg.includes('wrong number') ||
      msg.includes('argument') ||
      hint.includes('No function matches');
    const newSigRunning =
      msg.includes('invite_not_found') ||
      msg.includes('invite_not_pending') ||
      msg.includes('invite_expired') ||
      msg.includes('invite_email_mismatch');

    return {
      exists: !notFound,
      signature_ok: newSigRunning,
      error_detail: msg,
    };
  }

  // ── Parallel checks ────────────────────────────────────────────────────────

  const [
    // Core tables
    pmExists, // project_members
    uraExists, // user_role_assignments
    rbacRolesExists, // rbac_roles
    rmaExists, // rbac_module_actions
    rrmaExists, // rbac_role_module_actions
    upagExists, // user_project_access_grants
    piExists, // project_invites
    pmOdExists, // project_modules
    orgsExists, // organizations
    orgMembersExists, // organization_members
    notifExists, // user_in_app_notifications
    actLogExists, // task_activity_log
    subTeamsExists, // project_teams
    // Columns
    colTasksAssignedTo,
    colTasksCreatedBy,
    colTasksMilestoneId,
    colProjectsOrgId,
    colUraOrgId,
    colInviteRoleId,
    colInviteAllowedModules,
    colInviteTeamId,
    colTaskStatusNote, // from migration 20260324200015
    // Counts
    uraTotal,
    upagTotal,
    rrmaTotal,
    // Seed data: role existence
    teamMemberRoleRow,
    guestRoleRow,
  ] = await Promise.all([
    tableOk('project_members', 'project_id'),
    tableOk('user_role_assignments', 'user_id'),
    tableOk('rbac_roles', 'name'),
    tableOk('rbac_module_actions', 'action_key'),
    tableOk('rbac_role_module_actions', 'role_id'),
    tableOk('user_project_access_grants', 'user_id'),
    tableOk('project_invites', 'email'),
    tableOk('project_modules', 'module_key'),
    tableOk('organizations', 'name'),
    tableOk('organization_members', 'org_id'),
    tableOk('user_in_app_notifications', 'user_id'),
    tableOk('task_activity_log', 'task_id'),
    tableOk('project_teams', 'project_id'),
    colExists('tasks', 'assigned_to'),
    colExists('tasks', 'created_by'),
    colExists('tasks', 'milestone_id'),
    colExists('projects', 'org_id'),
    colExists('user_role_assignments', 'org_id'),
    colExists('project_invites', 'role_id'),
    colExists('project_invites', 'allowed_modules'),
    colExists('project_invites', 'team_id'),
    colExists('task_activity_log', 'status_note'),
    count('user_role_assignments', 'user_id'),
    count('user_project_access_grants', 'user_id'),
    count('rbac_role_module_actions', 'role_id'),
    (db as any)
      .from('rbac_roles')
      .select('id')
      .eq('name', 'team_member')
      .eq('is_system_role', true)
      .maybeSingle(),
    (db as any)
      .from('rbac_roles')
      .select('id')
      .eq('name', 'guest')
      .eq('is_system_role', true)
      .maybeSingle(),
  ]);

  const teamMemberRoleId: string | null = teamMemberRoleRow?.data?.id ?? null;
  const guestRoleId: string | null = guestRoleRow?.data?.id ?? null;

  // team_member action count (need role_id to filter)
  let teamMemberActionCount = 0;
  let teamMemberHasTasksCreate = false;
  let teamMemberHasNotesCreate = false;
  let teamMemberHasDocsCreate = false;

  if (teamMemberRoleId && rrmaExists) {
    const { data: tmActions } = await (db as any)
      .from('rbac_role_module_actions')
      .select('rbac_module_actions(action_key)')
      .eq('role_id', teamMemberRoleId);

    for (const row of tmActions ?? []) {
      const key: string | undefined = row?.rbac_module_actions?.action_key;
      if (key) {
        teamMemberActionCount++;
        if (key === 'tasks.create') teamMemberHasTasksCreate = true;
        if (key === 'notes.create') teamMemberHasNotesCreate = true;
        if (key === 'documents.create') teamMemberHasDocsCreate = true;
      }
    }
  }

  // accept_invite_atomic check
  const acceptInviteCheck = await checkAcceptInviteAtomic();

  // ── Critical diagnostic: users with access grant but missing project_members or URA
  let orphanedGrantUsers: Array<{ user_id: string; project_id: string }> = [];
  let orphanedGrantCount = 0;

  if (upagExists && pmExists) {
    // Get all access grants
    const { data: allGrants } = await (db as any)
      .from('user_project_access_grants')
      .select('user_id, project_id')
      .limit(200);

    for (const grant of allGrants ?? []) {
      const { data: pmRow } = await (db as any)
        .from('project_members')
        .select('user_id')
        .eq('user_id', grant.user_id)
        .eq('project_id', grant.project_id)
        .maybeSingle();

      if (!pmRow) {
        orphanedGrantUsers.push({
          user_id: grant.user_id,
          project_id: grant.project_id,
        });
        orphanedGrantCount++;
      }
    }
  }

  // Users with access grants but no URA
  let missingUraUsers: Array<{ user_id: string; project_id: string }> = [];

  if (upagExists && uraExists) {
    const { data: allGrants } = await (db as any)
      .from('user_project_access_grants')
      .select('user_id, project_id')
      .limit(200);

    for (const grant of allGrants ?? []) {
      const { data: uraRow } = await (db as any)
        .from('user_role_assignments')
        .select('user_id')
        .eq('user_id', grant.user_id)
        .eq('project_id', grant.project_id)
        .maybeSingle();

      if (!uraRow) {
        missingUraUsers.push({
          user_id: grant.user_id,
          project_id: grant.project_id,
        });
      }
    }
  }

  // ── Build checks ───────────────────────────────────────────────────────────

  const simplified5RolesSeeded =
    !!teamMemberRoleId && !!guestRoleId && teamMemberActionCount >= 40;

  const acceptInviteFixed =
    acceptInviteCheck.exists && acceptInviteCheck.signature_ok;

  const backfillNeeded = orphanedGrantCount > 0 || missingUraUsers.length > 0;

  const actionsRequired: Array<{
    priority: string;
    action: string;
    reason: string;
  }> = [];

  if (!simplified5RolesSeeded) {
    actionsRequired.push({
      priority: '1 - CRITICAL',
      action:
        'Run supabase/migrations/20260324200001_seed_simplified_roles.sql in Supabase SQL Editor',
      reason: `Simplified 5-role system not seeded. team_member role: ${!!teamMemberRoleId}, action grants: ${teamMemberActionCount} (need ≥40). Without this, canCreate=false for everyone.`,
    });
  }

  if (!acceptInviteFixed) {
    actionsRequired.push({
      priority: '2 - CRITICAL',
      action:
        'Run supabase/migrations/20260324200010_fix_accept_invite_simplified_roles.sql in Supabase SQL Editor',
      reason: `accept_invite_atomic is ${acceptInviteCheck.exists ? 'OLD VERSION (does not write project_members or user_role_assignments)' : 'MISSING'}. Every new invite accepted with this version leaves the user unable to create content.`,
    });
  }

  if (backfillNeeded) {
    actionsRequired.push({
      priority: '3 - CRITICAL',
      action:
        'Run supabase/migrations/20260324200013_robust_ura_backfill.sql in Supabase SQL Editor',
      reason: `${missingUraUsers.length} user(s) have access grants but no user_role_assignments row. ${orphanedGrantCount} user(s) also missing from project_members. Affected: ${JSON.stringify(missingUraUsers.slice(0, 10))}`,
    });
  }

  return NextResponse.json({
    _meta: {
      checkedAt: new Date().toISOString(),
      approach:
        'Direct table/column queries — no information_schema dependency',
    },

    verdict:
      actionsRequired.length === 0
        ? '✅ All critical migrations applied — DB looks healthy'
        : `🚨 ${actionsRequired.length} action(s) required`,

    actions_required: actionsRequired,

    key_diagnostics: {
      simplified_5_roles_seeded: {
        ok: simplified5RolesSeeded,
        team_member_role_id: teamMemberRoleId,
        guest_role_id: guestRoleId,
        team_member_action_grants: teamMemberActionCount,
        has_tasks_create: teamMemberHasTasksCreate,
        has_notes_create: teamMemberHasNotesCreate,
        has_documents_create: teamMemberHasDocsCreate,
      },
      accept_invite_atomic: {
        ok: acceptInviteFixed,
        function_exists: acceptInviteCheck.exists,
        new_signature_running: acceptInviteCheck.signature_ok,
        rpc_error_detail: acceptInviteCheck.error_detail,
        note: acceptInviteCheck.signature_ok
          ? 'New version — writes project_members + user_role_assignments on invite accept'
          : acceptInviteCheck.exists
            ? '⚠️ OLD VERSION — only writes user_project_access_grants, not project_members or URA'
            : '❌ Function missing',
      },
      orphaned_users: {
        ok: !backfillNeeded,
        users_with_grant_but_no_project_member: orphanedGrantUsers,
        users_with_grant_but_no_ura: missingUraUsers,
      },
    },

    db_snapshot: {
      core_tables: {
        project_members: pmExists,
        user_role_assignments: { exists: uraExists, total_rows: uraTotal },
        rbac_roles: rbacRolesExists,
        rbac_module_actions: rmaExists,
        rbac_role_module_actions: { exists: rrmaExists, total_rows: rrmaTotal },
        user_project_access_grants: {
          exists: upagExists,
          total_rows: upagTotal,
        },
        project_invites: piExists,
        project_modules: pmOdExists,
        organizations: orgsExists,
        organization_members: orgMembersExists,
        project_teams: subTeamsExists,
        user_in_app_notifications: notifExists,
        task_activity_log: actLogExists,
      },
      columns: {
        'tasks.assigned_to': colTasksAssignedTo,
        'tasks.created_by': colTasksCreatedBy,
        'tasks.milestone_id': colTasksMilestoneId,
        'task_activity_log.status_note': colTaskStatusNote,
        'projects.org_id': colProjectsOrgId,
        'user_role_assignments.org_id': colUraOrgId,
        'project_invites.role_id': colInviteRoleId,
        'project_invites.allowed_modules': colInviteAllowedModules,
        'project_invites.team_id': colInviteTeamId,
      },
    },
  });
}
