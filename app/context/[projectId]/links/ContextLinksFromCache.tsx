'use client';

import { useCallback, useEffect, useState } from 'react';
import { listProjectLinksAction, listLinkCategoriesAction } from './actions';
import type { Database } from '@/lib/supabase/types';
import { SkeletonLinks } from '@/components/skeletons/SkeletonLinks';
import { useContextDataCache } from '../../ContextDataCache';
import ContextLinksClient from './ContextLinksClient';

type ProjectLinkRow = Database['public']['Tables']['project_links']['Row'];
type LinkCategoryRow = Database['public']['Tables']['link_categories']['Row'];

interface ContextLinksFromCacheProps {
  projectId: string;
}

export default function ContextLinksFromCache({
  projectId,
}: ContextLinksFromCacheProps) {
  const cache = useContextDataCache();
  const cachedLinks = cache.get<ProjectLinkRow[]>({ type: 'links', projectId });
  const cachedCategories = cache.get<LinkCategoryRow[]>({
    type: 'linkCategories',
    projectId,
  });

  const [links, setLinks] = useState<ProjectLinkRow[] | null>(
    cachedLinks ?? null
  );
  const [categories, setCategories] = useState<LinkCategoryRow[] | null>(
    cachedCategories ?? null
  );
  const [loading, setLoading] = useState(!cachedLinks || !cachedCategories);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'links', projectId });
    cache.invalidate({ type: 'linkCategories', projectId });
    const [linksData, categoriesData] = await Promise.all([
      listProjectLinksAction(projectId),
      listLinkCategoriesAction(),
    ]);
    cache.set({ type: 'links', projectId }, linksData);
    cache.set({ type: 'linkCategories', projectId }, categoriesData);
    setLinks(linksData);
    setCategories(categoriesData);
  }, [projectId, cache]);

  const updateCategoriesCache = useCallback(
    (cats: LinkCategoryRow[]) => {
      cache.set({ type: 'linkCategories', projectId }, cats);
    },
    [projectId, cache]
  );

  useEffect(() => {
    if (cachedLinks && cachedCategories) {
      setLinks(cachedLinks);
      setCategories(cachedCategories);
      setLoading(false);
      return;
    }
    if (cachedLinks && !cachedCategories) {
      setLinks(cachedLinks);
      let cancelled = false;
      listLinkCategoriesAction().then((data) => {
        if (cancelled) return;
        cache.set({ type: 'linkCategories', projectId }, data);
        setCategories(data);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listProjectLinksAction(projectId),
      listLinkCategoriesAction(),
    ]).then(([linksData, categoriesData]) => {
      if (cancelled) return;
      cache.set({ type: 'links', projectId }, linksData);
      cache.set({ type: 'linkCategories', projectId }, categoriesData);
      setLinks(linksData);
      setCategories(categoriesData);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cachedLinks, cachedCategories, cache]);

  if (loading || links === null || categories === null) {
    return <SkeletonLinks />;
  }

  return (
    <ContextLinksClient
      projectId={projectId}
      initialLinks={links}
      initialCategories={categories}
      onRefresh={loadData}
      onCategoriesCacheUpdate={updateCategoriesCache}
    />
  );
}
