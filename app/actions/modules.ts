'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { requireCan } from '@/lib/rbac/resolver';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import {
  resolveModules,
  MODULE_REGISTRY,
  type ModuleKey,
  type SerializableResolvedModule,
} from '@/lib/modules/registry';

// ─────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────

export const getProjectModules = cache(
  async (projectId: string): Promise<SerializableResolvedModule[]> => {
    await requireAuth();
    const supabase = await createClient();

    const { data, error } = await (supabase as any)
      .from('project_modules')
      .select('module_key, enabled')
      .eq('project_id', projectId);

    if (error) {
      captureWithContext(error, {
        module: 'modules',
        action: 'getProjectModules',
        userIntent: 'Load module settings for a project',
        expected: 'List of project_modules rows from DB',
      });
      // Fallback: return all modules with their registry defaults.
      // Better to show everything than block the project view.
      return resolveModules([]);
    }

    return resolveModules(data ?? []);
  }
);

// ─────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────

export async function setProjectModuleEnabled(
  projectId: string,
  moduleKey: ModuleKey,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  await requireCan(user.id, 'projects.toggle_module', {
    type: 'project',
    projectId,
  });

  // Validate moduleKey is a known key
  if (!(moduleKey in MODULE_REGISTRY)) {
    return { ok: false, error: 'Invalid module key' };
  }

  // Reject attempts to toggle locked modules
  if (MODULE_REGISTRY[moduleKey].lock) {
    return { ok: false, error: 'This module cannot be disabled' };
  }

  const supabase = await createClient();

  const { error } = await (supabase as any).from('project_modules').upsert(
    {
      project_id: projectId,
      module_key: moduleKey,
      enabled,
    },
    { onConflict: 'project_id,module_key' }
  );

  if (error) {
    captureWithContext(error, {
      module: 'modules',
      action: 'setProjectModuleEnabled',
      userIntent: `Set module "${moduleKey}" to ${enabled} for project ${projectId}`,
      expected: 'Upsert row in project_modules',
    });
    return { ok: false, error: 'No se pudo guardar el cambio' };
  }

  revalidatePath(`/context/${projectId}`);

  return { ok: true };
}
