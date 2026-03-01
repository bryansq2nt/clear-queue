'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProjectCalendarFeed } from '@/app/actions/calendar';
import type { CalendarFeedItem } from '@/app/actions/calendar';
import { SkeletonCalendar } from '@/components/skeletons/SkeletonCalendar';
import { useContextDataCache } from '../../ContextDataCache';
import ContextCalendarClient from './ContextCalendarClient';

interface ContextCalendarFromCacheProps {
  projectId: string;
}

function getDefaultRange(): { start: string; end: string } {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 13);
  return {
    start: today.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function ContextCalendarFromCache({
  projectId,
}: ContextCalendarFromCacheProps) {
  const cache = useContextDataCache();
  const cacheKey = useMemo(
    () => ({ type: 'calendar' as const, projectId }),
    [projectId]
  );
  const cached = cache.get<CalendarFeedItem[]>(cacheKey);
  const [items, setItems] = useState<CalendarFeedItem[] | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const loadData = useCallback(async () => {
    cache.invalidate(cacheKey);
    const range = getDefaultRange();
    const data = await getProjectCalendarFeed({
      projectId,
      start: range.start,
      end: range.end,
    });
    cache.set(cacheKey, data);
    setItems(data);
  }, [projectId, cache, cacheKey]);

  useEffect(() => {
    if (cached) {
      setItems(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const range = getDefaultRange();
    getProjectCalendarFeed({
      projectId,
      start: range.start,
      end: range.end,
    }).then((data) => {
      if (cancelled) return;
      cache.set(cacheKey, data);
      setItems(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache, cacheKey]);

  if (loading || items === null) {
    return <SkeletonCalendar />;
  }

  const range = getDefaultRange();
  return (
    <ContextCalendarClient
      projectId={projectId}
      initialItems={items}
      start={range.start}
      end={range.end}
      onRefresh={loadData}
    />
  );
}
