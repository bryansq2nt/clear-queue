'use client';

import { useEffect } from 'react';
import { ContextShell } from '@/components/context/ContextShell';
import { recordProjectAccess } from '@/app/actions/projects';
import type {
  ModuleKey,
  SerializableResolvedModule,
} from '@/lib/modules/registry';

interface ContextLayoutClientProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
  enabledModuleKeys: Set<ModuleKey>;
  modules: SerializableResolvedModule[];
  canToggleModules: boolean;
  canDeleteProject: boolean;
  canOpenSettings: boolean;
  drawerOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onModulesChange: (updated: SerializableResolvedModule[]) => void;
}

export default function ContextLayoutClient({
  projectId,
  projectName,
  children,
  enabledModuleKeys,
  modules,
  canToggleModules,
  canDeleteProject,
  canOpenSettings,
  drawerOpen,
  onOpenSettings,
  onCloseSettings,
  onModulesChange,
}: ContextLayoutClientProps) {
  useEffect(() => {
    void recordProjectAccess(projectId);
  }, [projectId]);

  return (
    <ContextShell
      projectId={projectId}
      projectName={projectName}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      canToggleModules={canToggleModules}
      canDeleteProject={canDeleteProject}
      canOpenSettings={canOpenSettings}
      drawerOpen={drawerOpen}
      onOpenSettings={onOpenSettings}
      onCloseSettings={onCloseSettings}
      onModulesChange={onModulesChange}
    >
      {children}
    </ContextShell>
  );
}
