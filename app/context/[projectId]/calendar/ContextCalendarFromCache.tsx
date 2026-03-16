'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getProjectCalendarFeed,
  type CalendarFeedItem,
  type CalendarPermissions,
} from '@/app/actions/calendar';
import { SkeletonCalendar } from '@/components/skeletons/SkeletonCalendar';
import { useContextDataCache } from '../../ContextDataCache';
import ContextCalendarClient from './ContextCalendarClient';

interface ContextCalendarFromCacheProps {
  projectId: string;
  permissions: CalendarPermissions;
}

/** Range for a given month (year, month 0-11). */
function getMonthRangeFor(
  year: number,
  month: number
): {
  start: string;
  end: string;
} {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

export default function ContextCalendarFromCache({
  projectId,
  permissions,
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
    const now = new Date();
    const range = getMonthRangeFor(now.getFullYear(), now.getMonth());
    const data = await getProjectCalendarFeed({
      projectId,
      start: range.start,
      end: range.end,
    });
    cache.set(cacheKey, data);
    setItems(data);
  }, [projectId, cache, cacheKey]);

  const loadDataForMonth = useCallback(
    async (year: number, month: number) => {
      const range = getMonthRangeFor(year, month);
      const data = await getProjectCalendarFeed({
        projectId,
        start: range.start,
        end: range.end,
      });
      cache.set(cacheKey, data);
      setItems(data);
    },
    [projectId, cache, cacheKey]
  );

  useEffect(() => {
    if (cached) {
      setItems(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const now = new Date();
    const range = getMonthRangeFor(now.getFullYear(), now.getMonth());
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

  const now = new Date();
  const range = getMonthRangeFor(now.getFullYear(), now.getMonth());
  return (
    <ContextCalendarClient
      projectId={projectId}
      initialItems={items}
      start={range.start}
      end={range.end}
      permissions={permissions}
      onRefresh={loadData}
      onLoadMonth={loadDataForMonth}
    />
  );
}
