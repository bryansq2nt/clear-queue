import { NextRequest, NextResponse } from 'next/server';
import {
  getMyProjectAccessGrant,
  getCanViewModule,
} from '@/app/actions/modules';
import { getProjectModules } from '@/app/actions/modules';
import { getEnabledModuleKeys } from '@/lib/modules/registry';
import { requireAuth } from '@/lib/auth';
import { getGrantedActions } from '@/lib/rbac/resolver';

/**
 * Debug: what does the app see for the current user and a project?
 * GET /api/debug/project-access?projectId=xxx
 * Only available in development. Log in as the team member and open this URL
 * to see why Media might show as disabled.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only in development' }, { status: 404 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId. Use ?projectId=<uuid>' },
      { status: 400 }
    );
  }

  try {
    const user = await requireAuth();
    const [modules, grant, mediaAccess, grantedActions] = await Promise.all([
      getProjectModules(projectId),
      getMyProjectAccessGrant(projectId),
      getCanViewModule(projectId, 'media'),
      getGrantedActions(user.id, projectId, true),
    ]);

    const enabledKeys = getEnabledModuleKeys(modules);
    const mediaModule = modules.find((m) => m.key === 'media');
    const mediaActions = Array.from(grantedActions).filter((a) =>
      a.startsWith('media.')
    );

    return NextResponse.json({
      currentUser: { id: user.id, email: user.email ?? undefined },
      projectId,
      projectModules: {
        mediaRow: mediaModule
          ? { key: mediaModule.key, enabled: mediaModule.enabled }
          : null,
        enabledKeys: Array.from(enabledKeys),
      },
      myAccessGrant: {
        raw: grant,
        hasMedia:
          grant === null ? 'unrestricted (null)' : grant.includes('media'),
      },
      getCanViewModule_media: mediaAccess,
      rbacActionGrants: {
        hasMediaRead: grantedActions.has('media.read'),
        hasMediaViewSignedUrl: grantedActions.has('media.view_signed_url'),
        mediaActions,
        totalGrantedActions: grantedActions.size,
      },
      hint:
        grant === null
          ? 'No row in user_project_access_grants → unrestricted; should see Media if project has it enabled.'
          : Array.isArray(grant) && !grant.includes('media')
            ? "allowed_modules does not include 'media' → add it and save again."
            : !grantedActions.has('media.read')
              ? 'media.read missing from granted_actions — check user_project_action_grants and user_role_assignments.'
              : 'Check project_modules: is media enabled for this project?',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Auth or fetch failed', detail: message },
      { status: 401 }
    );
  }
}
