'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
import {
  getProjectModules,
  getMyProjectAccessGrant,
  getCanToggleModules,
} from '@/app/actions/modules';
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
  // cachedGrant: undefined = not yet fetched; null = unrestricted; string[] = allowlist
  const cachedGrant = cache.get<string[] | null>({
    type: 'accessGrant',
    projectId,
  });
  const cachedCanToggle = cache.get<boolean>({
    type: 'canToggleModules',
    projectId,
  });
  // Initialize with DEFAULT_MODULES so tabs are visible immediately while
  // the real DB state loads asynchronously in the background.
  const [modules, setModules] = useState<SerializableResolvedModule[]>(
    cachedModules ?? DEFAULT_MODULES
  );
  const [myAllowedModules, setMyAllowedModules] = useState<
    string[] | null | undefined
  >(cachedGrant);
  const [canToggleModules, setCanToggleModules] = useState<boolean>(
    cachedCanToggle ?? false
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

  // ── Module + access grant + canToggle load effect ───────────────
  // Load together so tab visibility and settings toggles are correct.
  useEffect(() => {
    if (
      cachedModules &&
      cachedGrant !== undefined &&
      cachedCanToggle !== undefined
    ) {
      setModules(cachedModules);
      setMyAllowedModules(cachedGrant);
      setCanToggleModules(cachedCanToggle);
      setModulesLoaded(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      getProjectModules(projectId),
      getMyProjectAccessGrant(projectId),
      getCanToggleModules(projectId),
    ]).then(([resolved, grant, canToggle]) => {
      if (cancelled) return;
      cache.set({ type: 'modules', projectId }, resolved);
      cache.set({ type: 'accessGrant', projectId }, grant);
      cache.set({ type: 'canToggleModules', projectId }, canToggle);
      setModules(resolved);
      setMyAllowedModules(grant);
      setCanToggleModules(canToggle);
      setModulesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cachedModules, cachedGrant, cachedCanToggle, cache]);

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

  const projectEnabledKeys = getEnabledModuleKeys(modules);
  // Apply per-member access grant: intersect project-enabled keys with user's allowlist.
  // null/undefined = unrestricted (show all project-enabled modules).
  const enabledModuleKeys: Set<ModuleKey> =
    myAllowedModules != null
      ? new Set(
          myAllowedModules.filter((k) =>
            projectEnabledKeys.has(k as ModuleKey)
          ) as ModuleKey[]
        )
      : projectEnabledKeys;

  return (
    <ContextLayoutClient
      projectId={projectId}
      projectName={displayName}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      canToggleModules={canToggleModules}
      drawerOpen={drawerOpen}
      onOpenSettings={() => setDrawerOpen(true)}
      onCloseSettings={() => setDrawerOpen(false)}
      onModulesChange={handleModulesChange}
    >
      {children}
    </ContextLayoutClient>
  );
}
