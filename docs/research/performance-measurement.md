# Performance Measurement — Next.js + Supabase

How to measure loading speed before and after implementing prefetching and optimistic
mutations. Zero-cost methods only.

---

## Metrics that matter for this app

ClearQueue is a tab-switching, mutation-heavy app. The metric that matters most is **INP**.

| Metric                              | What it measures                                             | Good      | Poor      |
| ----------------------------------- | ------------------------------------------------------------ | --------- | --------- |
| **INP** (Interaction to Next Paint) | Full latency of every user interaction — click to next paint | ≤ 200ms   | > 500ms   |
| **LCP** (Largest Contentful Paint)  | Time until largest visible element renders                   | ≤ 2,500ms | > 4,000ms |
| **CLS** (Cumulative Layout Shift)   | Unexpected layout shifts                                     | ≤ 0.1     | > 0.25    |

INP replaced FID in March 2024. It measures the **worst interaction** during a page
session at the 98th percentile. Every tab click, every mutation, every drawer open is
an INP event. Prefetch eliminates the server RTT from tab-switch INP. Optimistic
mutations eliminate the server RTT from write INP.

### Practical targets after implementation

| Interaction                       | Before    | Target after                      |
| --------------------------------- | --------- | --------------------------------- |
| Tab switch (Router Cache hit)     | 300–800ms | < 50ms                            |
| Tab switch (cold / cache expired) | 300–800ms | 200–600ms (one-time, then cached) |
| Optimistic mutation (click → UI)  | 200–800ms | < 16ms                            |

---

## 1. useReportWebVitals — zero setup, real metrics

Next.js's built-in hook wraps Google's `web-vitals` library. Captures LCP, INP, CLS,
FCP, and TTFB from real users.

```tsx
// app/_components/WebVitals.tsx
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[vital] ${metric.name} ${Math.round(metric.value)}ms — ${metric.rating}`
      );
      return;
    }
    // Production: send to an endpoint
    navigator.sendBeacon?.(
      '/api/vitals',
      JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
        navigationType: metric.navigationType,
      })
    );
  });
  return null;
}
```

```tsx
// app/layout.tsx — add once to root layout
import { WebVitals } from './_components/WebVitals';
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
```

The `metric.rating` field tells you immediately whether each interaction is good/poor
without having to remember the thresholds.

---

## 2. Navigation timer — measure tab-switch latency directly

`useReportWebVitals` measures INP across all interactions. This component measures
specifically tab-switch navigation time and lets you see per-route breakdowns.

```tsx
// components/shared/NavigationTimer.tsx
'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function NavigationTimer() {
  const pathname = usePathname();
  const startRef = useRef<number | null>(null);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a[href]')) {
        startRef.current = performance.now();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (startRef.current !== null && pathname !== prevPathRef.current) {
      const duration = Math.round(performance.now() - startRef.current);
      console.log(`[nav] ${prevPathRef.current} → ${pathname}: ${duration}ms`);
      // < 50ms  = Router Cache hit (prefetch worked)
      // > 100ms = Cache miss (server fetch required)
      startRef.current = null;
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  return null;
}
```

`usePathname()` re-renders when the new route's RSC payload is committed to the React
tree — meaning the duration is "click → content rendered", which is the true perceived
navigation latency.

Add it next to `WebVitals` in the root layout.

---

## 3. Confirming Router Cache hits in DevTools

The fastest way to verify prefetch is working: open Chrome DevTools > Network tab,
filter by `Fetch/XHR`, then click a tab.

- **No new requests** → Router Cache hit. Navigation was instant from memory.
- **Request with header `Accept: text/x-component`** → Router Cache miss. Server was hit.

This is the most reliable way to confirm whether `router.prefetch()` is working before
wiring up any instrumentation.

---

## 4. Measuring optimistic mutation improvement

Two things to measure separately:

**A — Time to optimistic UI (what the user perceives)**

```ts
// In the mutation handler
const handleCreate = () => {
  performance.mark('mutation-start');

  // Optimistic state update (synchronous)
  setItems((prev) => [...prev, tempItem]);

  performance.mark('optimistic-painted');
  const m = performance.measure(
    'optimistic-latency',
    'mutation-start',
    'optimistic-painted'
  );
  console.log(`[perf] optimistic paint: ${m.duration.toFixed(1)}ms`); // target: < 16ms

  // Server action fires after
  startTransition(async () => {
    await serverAction();
  });
};
```

**B — Server action round-trip time (background, not user-visible)**

```ts
// In the server action
export async function createNote(projectId: string, title: string) {
  const t0 = Date.now()
  const { data, error } = await supabase.from('notes').insert(...).select(...).single()
  console.log(`[server] createNote DB: ${Date.now() - t0}ms`)
  return error ? { error } : { data }
}
```

With optimistic updates: the user perceives `< 16ms`. Without: the user perceives the
full server RTT (200–800ms). These two measurements together show the before/after gap.

---

## 5. Finding slow Supabase queries

`pg_stat_statements` is enabled by default on all Supabase projects. Run these in the
SQL Editor.

### Slowest queries by single-execution max time

```sql
select
  statements.query,
  statements.calls,
  round((statements.max_exec_time + statements.max_plan_time)::numeric, 2) as max_ms,
  round((statements.mean_exec_time + statements.mean_plan_time)::numeric, 2) as mean_ms,
  statements.rows / statements.calls as avg_rows
from pg_stat_statements as statements
inner join pg_authid as auth on statements.userid = auth.oid
order by max_ms desc
limit 20;
```

### Queries consuming the most total DB time

```sql
select
  statements.query,
  statements.calls,
  round((statements.total_exec_time + statements.total_plan_time)::numeric, 2) as total_ms,
  to_char(
    (statements.total_exec_time + statements.total_plan_time)
    / sum(statements.total_exec_time + statements.total_plan_time) over ()
    * 100, 'FM90D0'
  ) || '%' as pct_total
from pg_stat_statements as statements
inner join pg_authid as auth on statements.userid = auth.oid
order by total_ms desc
limit 20;
```

### Cache hit rate (should be > 99%)

```sql
select
  'index hit rate' as name,
  round(sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100, 1) as ratio
from pg_statio_user_indexes
union all
select
  'table hit rate',
  round(sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0) * 100, 1)
from pg_statio_user_tables;
```

If either is below 99%, data is being read from disk — compute upgrade may help.

### Reset after adding indexes or rewriting queries

```sql
select pg_stat_statements_reset();
-- Wait for traffic, then re-run the queries above to confirm improvement
```

### Supabase Performance Advisor (no SQL required)

Dashboard > Database > Performance Advisor. Automatically surfaces missing indexes,
unused indexes, and RLS policies causing sequential scans. Available on all plans
including free. Run this before starting any optimization work — it may catch issues
faster than manual query analysis.

---

## 6. Recommended zero-cost measurement stack

**Before starting implementation (establish baseline):**

1. Add `WebVitals` + `NavigationTimer` to root layout — deploy to staging/prod
2. Open DevTools Network tab, click each context tab, note which have RSC fetch requests (cache misses)
3. Run the "slowest queries" SQL in the Supabase SQL Editor — save output
4. Open Supabase Performance Advisor — action any flagged missing indexes

**After implementing prefetch:**

1. Verify in Network tab — enabled tabs should show no RSC fetch on switch
2. Compare `NavigationTimer` console output — should drop from 300–800ms to < 50ms

**After implementing optimistic mutations:**

1. Compare INP values from `WebVitals` console — mutation interactions should drop
2. The `performance.mark` instrumentation in the mutation handler shows sub-16ms paints

**Optional visual dashboard (Vercel):**
Vercel Speed Insights is free for 1 project on the Hobby plan (10,000 data points/month,
7-day window). It provides per-route LCP/INP charts with good/poor ratings. Useful for
a before/after visual comparison.

```bash
npm install @vercel/speed-insights
```

```tsx
// app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next';
// Add <SpeedInsights /> inside the body, enable in Vercel Dashboard
```
