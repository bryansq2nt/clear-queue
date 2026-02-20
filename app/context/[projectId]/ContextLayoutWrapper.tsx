'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
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
 * Loads project from cache or fetches once. Renders shell + children.
 * Project name shows immediately when coming from the picker (stored in sessionStorage on click).
 */
export default function ContextLayoutWrapper({
  projectId,
  children,
}: ContextLayoutWrapperProps) {
  const cache = useContextDataCache();
  const router = useRouter();
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

  if (checked && !project) {
    return null;
  }

  return (
    <ContextLayoutClient projectId={projectId} projectName={displayName}>
      {children}
    </ContextLayoutClient>
  );
}
