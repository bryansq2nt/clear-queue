import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import {
  getRoleIdsForUserInProject,
  getGrantedActions,
} from '@/lib/rbac/resolver';
import {
  getMyProjectAccessGrant,
  getCanViewModule,
  getCanUseModuleMemberContent,
} from '@/app/actions/modules';
import { getBoardPermissions } from '@/app/actions/tasks';
import { getNotesPermissions } from '@/app/actions/notes';
import { getDocumentsPermissions } from '@/app/actions/documents';

/**
 * Full RBAC audit for a specific user+project pair.
 *
 * GET /api/debug/rbac-audit?projectId=<uuid>&userId=<uuid>
 *
 * userId is optional — defaults to the authenticated user.
 * Only available in development.
 *
 * Returns raw DB state (Q1–Q9) + app-layer computed permissions
 * so you can see exactly why canCreate is true or false.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only in development' }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get('projectId');
  const userIdParam = searchParams.get('userId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId. Use ?projectId=<uuid>&userId=<uuid>' },
      { status: 400 }
    );
  }

  try {
    const currentUser = await requireAuth();
    const targetUserId = userIdParam ?? currentUser.id;
    const supabase = await createClient();

    // ── Q0: auth.uid() / JWT forwarding sanity check ─────────────────────────
    const { data: uidCheck, error: uidCheckError } = await (supabase as any)
      .from('profiles')
      .select('user_id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    // ── Q1: Project info ──────────────────────────────────────────────────────
    const { data: project } = await (supabase as any)
      .from('projects')
      .select('id, name, owner_id, org_id')
      .eq('id', projectId)
      .maybeSingle();

    // ── Q2: project_members ───────────────────────────────────────────────────
    const { data: projectMember, error: projectMemberError } = await (
      supabase as any
    )
      .from('project_members')
      .select('project_id, user_id, invited_by')
      .eq('project_id', projectId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    // ── Q3: All URA rows (project-scoped + org-scoped) ────────────────────────
    const { data: uraProjectRows, error: uraErr } = await (supabase as any)
      .from('user_role_assignments')
      .select(
        'id, user_id, project_id, org_id, role_id, assigned_by, rbac_roles(name, is_system_role)'
      )
      .eq('user_id', targetUserId)
      .eq('project_id', projectId);

    let uraOrgRows: unknown[] = [];
    if (project?.org_id) {
      const { data: orgRows } = await (supabase as any)
        .from('user_role_assignments')
        .select(
          'id, user_id, project_id, org_id, role_id, assigned_by, rbac_roles(name, is_system_role)'
        )
        .eq('user_id', targetUserId)
        .eq('org_id', project.org_id);
      uraOrgRows = orgRows ?? [];
    }

    // ── Q4: user_project_access_grants ────────────────────────────────────────
    const { data: accessGrant } = await (supabase as any)
      .from('user_project_access_grants')
      .select('project_id, user_id, allowed_modules, read_scope, updated_at')
      .eq('project_id', projectId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    // ── Q5: project_modules ───────────────────────────────────────────────────
    const { data: projectModules } = await (supabase as any)
      .from('project_modules')
      .select('module_key, enabled')
      .eq('project_id', projectId)
      .order('module_key');

    // ── Q6: Action grants per role assigned to target user ────────────────────
    // Collect all role IDs from Q3
    const allUraRows = [...(uraProjectRows ?? []), ...uraOrgRows];
    const roleIdsFromDb: string[] = [
      ...new Set(allUraRows.map((r: any) => r.role_id).filter(Boolean)),
    ];

    let actionGrantsByRole: Record<
      string,
      {
        role_name: string | null;
        is_system_role: boolean | null;
        granted_action_count: number;
        has_tasks_create: boolean;
        has_notes_create: boolean;
        has_documents_create: boolean;
        has_tasks_read: boolean;
        all_action_keys: string[];
      }
    > = {};

    if (roleIdsFromDb.length > 0) {
      const { data: actionRows } = await (supabase as any)
        .from('rbac_role_module_actions')
        .select(
          'role_id, rbac_module_actions(action_key), rbac_roles(name, is_system_role)'
        )
        .in('role_id', roleIdsFromDb);

      for (const row of actionRows ?? []) {
        const roleId: string = row.role_id;
        const actionKey: string | undefined =
          row?.rbac_module_actions?.action_key;
        const roleName: string | null = row?.rbac_roles?.name ?? null;
        const isSystemRole: boolean | null =
          row?.rbac_roles?.is_system_role ?? null;

        if (!actionGrantsByRole[roleId]) {
          actionGrantsByRole[roleId] = {
            role_name: roleName,
            is_system_role: isSystemRole,
            granted_action_count: 0,
            has_tasks_create: false,
            has_notes_create: false,
            has_documents_create: false,
            has_tasks_read: false,
            all_action_keys: [],
          };
        }
        if (actionKey) {
          actionGrantsByRole[roleId].granted_action_count += 1;
          actionGrantsByRole[roleId].all_action_keys.push(actionKey);
          if (actionKey === 'tasks.create')
            actionGrantsByRole[roleId].has_tasks_create = true;
          if (actionKey === 'notes.create')
            actionGrantsByRole[roleId].has_notes_create = true;
          if (actionKey === 'documents.create')
            actionGrantsByRole[roleId].has_documents_create = true;
          if (actionKey === 'tasks.read')
            actionGrantsByRole[roleId].has_tasks_read = true;
        }
      }
      // Sort action keys for readability
      for (const entry of Object.values(actionGrantsByRole)) {
        entry.all_action_keys.sort();
      }
    }

    // ── Q7: team_member system role health check ──────────────────────────────
    const { data: teamMemberRole } = await (supabase as any)
      .from('rbac_roles')
      .select('id, name, is_system_role')
      .eq('name', 'team_member')
      .eq('is_system_role', true)
      .maybeSingle();

    let teamMemberActionCount = 0;
    let teamMemberHasTasksCreate = false;
    let teamMemberHasNotesCreate = false;
    let teamMemberHasDocsCreate = false;

    if (teamMemberRole?.id) {
      const { data: tmActions } = await (supabase as any)
        .from('rbac_role_module_actions')
        .select('rbac_module_actions(action_key)')
        .eq('role_id', teamMemberRole.id);

      for (const row of tmActions ?? []) {
        const key: string | undefined = row?.rbac_module_actions?.action_key;
        if (key) {
          teamMemberActionCount += 1;
          if (key === 'tasks.create') teamMemberHasTasksCreate = true;
          if (key === 'notes.create') teamMemberHasNotesCreate = true;
          if (key === 'documents.create') teamMemberHasDocsCreate = true;
        }
      }
    }

    // ── Q8: project_invites for this user ────────────────────────────────────
    const { data: invites } = await (supabase as any)
      .from('project_invites')
      .select(
        'id, email, status, role_id, allowed_modules, accepted_at, created_at, rbac_roles(name)'
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20);

    const invitesByEmail = invites ?? [];
    // Also get invites that match the target user's email
    const { data: targetUserProfile } = await (supabase as any)
      .from('profiles')
      .select('email')
      .eq('user_id', targetUserId)
      .maybeSingle();

    // ── Q9: Users with >1 URA row for this project ────────────────────────────
    const { data: allProjectUra } = await (supabase as any)
      .from('user_role_assignments')
      .select('user_id, role_id, rbac_roles(name)')
      .eq('project_id', projectId);

    const uraByUser: Record<string, string[]> = {};
    for (const row of allProjectUra ?? []) {
      if (!uraByUser[row.user_id]) uraByUser[row.user_id] = [];
      uraByUser[row.user_id].push(row?.rbac_roles?.name ?? row.role_id);
    }
    const duplicateUraUsers = Object.entries(uraByUser)
      .filter(([, roles]) => roles.length > 1)
      .map(([userId, roles]) => ({
        user_id: userId,
        ura_count: roles.length,
        role_names: roles,
      }));

    // ── App layer: what the code actually computes for the target user ─────────
    // NOTE: these use the authenticated user (currentUser), not targetUserId.
    // To audit a different user, log in as them and hit this endpoint.
    const isAuditingCurrentUser = targetUserId === currentUser.id;

    let appLayer: Record<string, unknown> = {
      note: isAuditingCurrentUser
        ? 'Computed for the currently authenticated user (matches targetUserId)'
        : `WARNING: targetUserId (${targetUserId}) differs from authenticated user (${currentUser.id}). App-layer results reflect the AUTHENTICATED user, not the target. Log in as the target user to get accurate app-layer data.`,
    };

    if (isAuditingCurrentUser) {
      const [
        roleIdsAppLayer,
        grantedActions,
        accessGrantAppLayer,
        boardCanView,
        notesCanView,
        docsCanView,
        boardMemberUse,
        notesMemberUse,
        docsMemberUse,
        boardPermissions,
        notesPermissions,
        docsPermissions,
      ] = await Promise.all([
        getRoleIdsForUserInProject(currentUser.id, projectId),
        getGrantedActions(currentUser.id, projectId, true),
        getMyProjectAccessGrant(projectId),
        getCanViewModule(projectId, 'board'),
        getCanViewModule(projectId, 'notes'),
        getCanViewModule(projectId, 'documents'),
        getCanUseModuleMemberContent(projectId, 'board'),
        getCanUseModuleMemberContent(projectId, 'notes'),
        getCanUseModuleMemberContent(projectId, 'documents'),
        getBoardPermissions(projectId),
        getNotesPermissions(projectId),
        getDocumentsPermissions(projectId),
      ]);

      const sortedActions = Array.from(grantedActions).sort();

      appLayer = {
        ...appLayer,
        getRoleIdsForUserInProject: {
          roleIds: roleIdsAppLayer,
          count: roleIdsAppLayer.length,
          note:
            roleIdsAppLayer.length === 0
              ? 'EMPTY — fallback did not fire (user not in project_members or team_member role not found)'
              : 'OK',
        },
        getMyProjectAccessGrant: {
          value: accessGrantAppLayer,
          interpretation:
            accessGrantAppLayer === undefined
              ? 'NO ROW → fail-closed (no module access)'
              : accessGrantAppLayer === null
                ? 'null → unrestricted (all project-enabled modules visible)'
                : `explicit allowlist: [${(accessGrantAppLayer as string[]).join(', ')}]`,
        },
        getCanViewModule: {
          board: boardCanView,
          notes: notesCanView,
          documents: docsCanView,
        },
        getCanUseModuleMemberContent: {
          board: boardMemberUse,
          notes: notesMemberUse,
          documents: docsMemberUse,
        },
        getBoardPermissions: boardPermissions,
        getNotesPermissions: notesPermissions,
        getDocumentsPermissions: docsPermissions,
        grantedActions: {
          total: grantedActions.size,
          has_tasks_create: grantedActions.has('tasks.create'),
          has_notes_create: grantedActions.has('notes.create'),
          has_documents_create: grantedActions.has('documents.create'),
          all: sortedActions,
        },
        diagnosis: {
          canCreateTask: grantedActions.has('tasks.create') || boardMemberUse,
          canCreateNote: grantedActions.has('notes.create') || notesMemberUse,
          canUploadDocument:
            grantedActions.has('documents.create') || docsMemberUse,
          boardCanView: boardCanView.canView,
          notesCanView: notesCanView.canView,
          docsCanView: docsCanView.canView,
        },
      };
    }

    // ── Assemble final report ─────────────────────────────────────────────────
    return NextResponse.json({
      _meta: {
        auditedAt: new Date().toISOString(),
        targetUserId,
        targetUserEmail: targetUserProfile?.email ?? null,
        projectId,
        authenticatedUserId: currentUser.id,
        authenticatedUserEmail: currentUser.email,
      },

      Q0_authUidSanity: {
        exists: uidCheck != null,
        row: uidCheck ?? null,
        error: uidCheckError
          ? {
              message: uidCheckError.message,
              code: uidCheckError.code ?? null,
              details: uidCheckError.details ?? null,
              hint: uidCheckError.hint ?? null,
            }
          : null,
        interpretation:
          uidCheck != null
            ? 'OK — a plainly user-owned row is visible under this JWT'
            : 'If the profile exists via service role but this is null, PostgREST is not seeing the user JWT (auth.uid() may be null).',
      },

      Q1_project: project ?? null,

      Q2_projectMember: {
        exists: projectMember != null,
        row: projectMember ?? null,
        error: projectMemberError
          ? {
              message: projectMemberError.message,
              code: projectMemberError.code ?? null,
              details: projectMemberError.details ?? null,
              hint: projectMemberError.hint ?? null,
            }
          : null,
      },

      Q3_uraRows: {
        project_scoped: (uraProjectRows ?? []).map((r: any) => ({
          id: r.id,
          role_id: r.role_id,
          role_name: r.rbac_roles?.name ?? null,
          is_system_role: r.rbac_roles?.is_system_role ?? null,
          assigned_by: r.assigned_by,
        })),
        org_scoped: uraOrgRows.map((r: any) => ({
          id: r.id,
          role_id: r.role_id,
          role_name: r.rbac_roles?.name ?? null,
          is_system_role: r.rbac_roles?.is_system_role ?? null,
          assigned_by: r.assigned_by,
        })),
        total_count: allUraRows.length,
        role_names_summary: allUraRows.map(
          (r: any) => r?.rbac_roles?.name ?? `unknown(${r.role_id})`
        ),
        error: uraErr
          ? {
              message: uraErr.message,
              code: uraErr.code ?? null,
              details: uraErr.details ?? null,
              hint: uraErr.hint ?? null,
            }
          : null,
      },

      Q4_accessGrant: {
        exists: accessGrant != null,
        allowed_modules: accessGrant?.allowed_modules ?? null,
        allowed_modules_includes_board: Array.isArray(
          accessGrant?.allowed_modules
        )
          ? (accessGrant.allowed_modules as string[]).includes('board')
          : accessGrant?.allowed_modules === null
            ? 'null=unrestricted'
            : 'no_row',
        read_scope: accessGrant?.read_scope ?? null,
        updated_at: accessGrant?.updated_at ?? null,
      },

      Q5_projectModules: projectModules ?? [],

      Q6_actionGrantsByRole: actionGrantsByRole,

      Q7_teamMemberRoleHealth: {
        role_exists: teamMemberRole != null,
        role_id: teamMemberRole?.id ?? null,
        total_actions: teamMemberActionCount,
        has_tasks_create: teamMemberHasTasksCreate,
        has_notes_create: teamMemberHasNotesCreate,
        has_documents_create: teamMemberHasDocsCreate,
        verdict: teamMemberHasTasksCreate
          ? 'OK'
          : 'BROKEN — team_member missing tasks.create',
      },

      Q8_invites: invitesByEmail.map((inv: any) => ({
        id: inv.id,
        email: inv.email,
        status: inv.status,
        role_id: inv.role_id,
        role_name: inv?.rbac_roles?.name ?? null,
        allowed_modules: inv.allowed_modules,
        accepted_at: inv.accepted_at,
        created_at: inv.created_at,
      })),

      Q9_duplicateUraUsers: {
        count: duplicateUraUsers.length,
        users: duplicateUraUsers,
      },

      appLayer,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Failed', detail: message },
      { status: 500 }
    );
  }
}
