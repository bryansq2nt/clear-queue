'use client';

import { useCallback, useState } from 'react';
import {
  getEnabledModuleKeys,
  type ModuleKey,
  type SerializableResolvedModule,
} from '@/lib/modules/registry';
import type { Database } from '@/lib/supabase/types';
import ContextLayoutClient from './ContextLayoutClient';

type Project = Database['public']['Tables']['projects']['Row'];

interface ContextLayoutWrapperProps {
  projectId: string;
  children: React.ReactNode;
  project: Project;
  initialModules: SerializableResolvedModule[];
  initialAccessGrant: string[] | null | undefined;
  initialCanToggle: boolean;
  initialCanDeleteProject: boolean;
}

/**
 * Thin client wrapper that owns drawer state and module toggle state.
 * All data arrives from the server layout — no cache, no client-side fetches.
 */
export default function ContextLayoutWrapper({
  projectId,
  children,
  project,
  initialModules,
  initialAccessGrant,
  initialCanToggle,
  initialCanDeleteProject,
}: ContextLayoutWrapperProps) {
  const [modules, setModules] =
    useState<SerializableResolvedModule[]>(initialModules);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canOpenSettings = initialCanToggle || initialCanDeleteProject;

  // ── Realtime subscription slot (empty until Realtime phase) ───────────────
  // useEffect(() => {
  //   const channel = supabase
  //     .channel(`project:${projectId}`)
  //     .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects',
  //         filter: `id=eq.${projectId}` },
  //       (payload) => { /* update project name if needed */ })
  //     .subscribe();
  //   return () => { supabase.removeChannel(channel); };
  // }, [projectId]);

  const handleModulesChange = useCallback(
    (updated: SerializableResolvedModule[]) => {
      setModules(updated);
    },
    []
  );

  const projectEnabledKeys = getEnabledModuleKeys(modules);
  // Apply per-member access grant to determine which tabs are visible.
  //
  //   undefined  — no row (fail-closed): show no tabs. Should not happen after
  //                the backfill migration; treated as empty set for safety.
  //   null       — row exists, unrestricted: show all project-enabled modules.
  //   string[]   — explicit allowlist: intersect with project-enabled modules.
  const enabledModuleKeys: Set<ModuleKey> =
    initialAccessGrant === null
      ? projectEnabledKeys
      : initialAccessGrant === undefined
        ? new Set<ModuleKey>()
        : new Set(
            initialAccessGrant.filter((k) =>
              projectEnabledKeys.has(k as ModuleKey)
            ) as ModuleKey[]
          );

  return (
    <ContextLayoutClient
      projectId={projectId}
      projectName={project.name}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      canToggleModules={initialCanToggle}
      canDeleteProject={initialCanDeleteProject}
      canOpenSettings={canOpenSettings}
      drawerOpen={drawerOpen}
      onOpenSettings={() => {
        if (!canOpenSettings) return;
        setDrawerOpen(true);
      }}
      onCloseSettings={() => setDrawerOpen(false)}
      onModulesChange={handleModulesChange}
    >
      {children}
    </ContextLayoutClient>
  );
}
