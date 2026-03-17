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
  initialAccessGrant: string[] | null;
  initialCanToggle: boolean;
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
}: ContextLayoutWrapperProps) {
  const [modules, setModules] =
    useState<SerializableResolvedModule[]>(initialModules);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  // Apply per-member access grant: intersect project-enabled keys with user's allowlist.
  // null = unrestricted (show all project-enabled modules).
  const enabledModuleKeys: Set<ModuleKey> =
    initialAccessGrant != null
      ? new Set(
          initialAccessGrant.filter((k) =>
            projectEnabledKeys.has(k as ModuleKey)
          ) as ModuleKey[]
        )
      : projectEnabledKeys;

  return (
    <ContextLayoutClient
      projectId={projectId}
      projectName={project.name}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      canToggleModules={initialCanToggle}
      drawerOpen={drawerOpen}
      onOpenSettings={() => setDrawerOpen(true)}
      onCloseSettings={() => setDrawerOpen(false)}
      onModulesChange={handleModulesChange}
    >
      {children}
    </ContextLayoutClient>
  );
}
