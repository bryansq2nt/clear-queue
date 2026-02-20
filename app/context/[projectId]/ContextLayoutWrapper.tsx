'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
import type { Database } from '@/lib/supabase/types';
import { useContextDataCache } from '../ContextDataCache';
import ContextLayoutClient from './ContextLayoutClient';

type Project = Database['public']['Tables']['projects']['Row'];

interface ContextLayoutWrapperProps {
  projectId: string;
  children: React.ReactNode;
}

/**
 * Loads project from cache or fetches once. Renders shell + children.
 * Phase 3: no refetch when navigating back to a project we already opened.
 */
export default function ContextLayoutWrapper({
  projectId,
  children,
}: ContextLayoutWrapperProps) {
  const cache = useContextDataCache();
  const router = useRouter();
  const cached = cache.get<Project>({ type: 'project', projectId });
  const [project, setProject] = useState<Project | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [checked, setChecked] = useState(!!cached);

  useEffect(() => {
    if (cached) {
      setProject(cached);
      setLoading(false);
      setChecked(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProjectById(projectId).then((p) => {
      if (cancelled) return;
      setChecked(true);
      if (!p) {
        router.replace('/');
        return;
      }
      cache.set({ type: 'project', projectId }, p);
      setProject(p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache, router]);

  if (!checked || loading) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-muted-foreground">
        <span className="animate-pulse">Loading project…</span>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <ContextLayoutClient projectId={projectId} projectName={project.name}>
      {children}
    </ContextLayoutClient>
  );
}
