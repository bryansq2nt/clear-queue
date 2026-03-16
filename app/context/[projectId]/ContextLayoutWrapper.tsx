'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
import {
  getEnabledModuleKeys,
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
  // Server-fetched initial values — already correct for this user on first render,
  // preventing the flash of all-modules-visible that occurs when the client falls
  // back to DEFAULT_MODULES before the async fetch resolves.
  initialModules: SerializableResolvedModule[];
  initialAccessGrant: string[] | null;
  initialCanToggle: boolean;
}

/**
 * Loads project and module state from cache or fetches once.
 * Manages the settings drawer open/close state.
 * Renders shell + children.
 */
export default function ContextLayoutWrapper({
  projectId,
  children,
  initialModules,
  initialAccessGrant,
  initialCanToggle,
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
  // Prefer cache (same session navigation), then fall back to server-provided
  // initial props (correct for this user on first render — no flash).
  const [modules, setModules] = useState<SerializableResolvedModule[]>(
    cachedModules ?? initialModules
  );
  const [myAllowedModules, setMyAllowedModules] = useState<
    string[] | null | undefined
  >(cachedGrant !== undefined ? cachedGrant : initialAccessGrant);
  const [canToggleModules, setCanToggleModules] = useState<boolean>(
    cachedCanToggle ?? initialCanToggle
  );

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
  // If the cache is already populated (same-session navigation), sync state
  // from it. Otherwise populate the cache from server props we already have —
  // no extra fetch needed on first visit.
  useEffect(() => {
    if (
      cachedModules &&
      cachedGrant !== undefined &&
      cachedCanToggle !== undefined
    ) {
      setModules(cachedModules);
      setMyAllowedModules(cachedGrant);
      setCanToggleModules(cachedCanToggle);
    } else {
      // Populate cache from server-provided initial props so subsequent
      // same-session navigation hits the cache instead of re-fetching.
      cache.set({ type: 'modules', projectId }, initialModules);
      cache.set({ type: 'accessGrant', projectId }, initialAccessGrant);
      cache.set({ type: 'canToggleModules', projectId }, initialCanToggle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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
