'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
import { getProjectModules } from '@/app/actions/modules';
import {
  getEnabledModuleKeys,
  DEFAULT_MODULES,
  type ModuleKey,
  type SerializableResolvedModule,
} from '@/lib/modules/registry';
import type { Database } from '@/lib/supabase/types';
import { useContextDataCache } from '../ContextDataCache';
import ContextLayoutClient from './ContextLayoutClient';

const STORAGE_KEY_PREFIX = 'context_project_name_';

type Project = Database['public']['Tables']['projects']['Row'];

interface ContextLayoutWrapperProps {
  projectId: string;
  children: React.ReactNode;
}

/**
 * Loads project and module state from cache or fetches once.
 * Manages the settings drawer open/close state.
 * Renders shell + children.
 */
export default function ContextLayoutWrapper({
  projectId,
  children,
}: ContextLayoutWrapperProps) {
  const cache = useContextDataCache();
  const router = useRouter();

  // ── Project state ──────────────────────────────────────────────
  const cached = cache.get<Project>({ type: 'project', projectId });
  const [project, setProject] = useState<Project | null>(cached ?? null);
  const [checked, setChecked] = useState(!!cached);
  const [displayName, setDisplayName] = useState<string>(() => {
    if (cached?.name) return cached.name;
    if (typeof window === 'undefined') return '…';
    try {
      return sessionStorage.getItem(STORAGE_KEY_PREFIX + projectId) ?? '…';
    } catch {
      return '…';
    }
  });

  // ── Module state ───────────────────────────────────────────────
  const cachedModules = cache.get<SerializableResolvedModule[]>({
    type: 'modules',
    projectId,
  });
  // Initialize with DEFAULT_MODULES so tabs are visible immediately while
  // the real DB state loads asynchronously in the background.
  const [modules, setModules] = useState<SerializableResolvedModule[]>(
    cachedModules ?? DEFAULT_MODULES
  );
  const [modulesLoaded, setModulesLoaded] = useState(!!cachedModules);

  // ── Drawer state ───────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Project load effect ────────────────────────────────────────
  useEffect(() => {
    if (cached) {
      setProject(cached);
      setDisplayName(cached.name);
      setChecked(true);
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        const name = sessionStorage.getItem(STORAGE_KEY_PREFIX + projectId);
        if (name) setDisplayName(name);
      } catch {
        /* ignore */
      }
    }
    let cancelled = false;
    getProjectById(projectId).then((p) => {
      if (cancelled) return;
      setChecked(true);
      if (!p) {
        router.replace('/');
        return;
      }
      cache.set({ type: 'project', projectId }, p);
      setProject(p);
      setDisplayName(p.name);
      try {
        sessionStorage.removeItem(STORAGE_KEY_PREFIX + projectId);
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache, router]);

  // ── Module load effect ─────────────────────────────────────────
  useEffect(() => {
    if (cachedModules) {
      setModules(cachedModules);
      setModulesLoaded(true);
      return;
    }
    let cancelled = false;
    getProjectModules(projectId).then((resolved) => {
      if (cancelled) return;
      cache.set({ type: 'modules', projectId }, resolved);
      setModules(resolved);
      setModulesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cachedModules, cache]);

  // ── Module update handler (called after toggle in drawer) ──────
  const handleModulesChange = useCallback(
    (updated: SerializableResolvedModule[]) => {
      cache.set({ type: 'modules', projectId }, updated);
      setModules(updated);
    },
    [projectId, cache]
  );

  if (checked && !project) {
    return null;
  }

  const enabledModuleKeys: Set<ModuleKey> = getEnabledModuleKeys(modules);

  return (
    <ContextLayoutClient
      projectId={projectId}
      projectName={displayName}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      drawerOpen={drawerOpen}
      onOpenSettings={() => setDrawerOpen(true)}
      onCloseSettings={() => setDrawerOpen(false)}
      onModulesChange={handleModulesChange}
    >
      {children}
    </ContextLayoutClient>
  );
}
