# Next.js 15 — Router Cache Changes

Research before implementing tab prefetching. The app is currently on Next.js 14.
This doc covers what changes if we upgrade, what breaks, and what new tools we gain.

---

## The one-sentence summary

Next.js 15 flips the philosophy: **uncached by default, opt-in to caching** — the exact
opposite of v14. The most important change for this app is that dynamic page segments
now have a cache duration of **0 seconds** by default (was 30 seconds in v14).

---

## Router Cache duration changes

| Scenario                                                 | v14 default            | v15 default                        |
| -------------------------------------------------------- | ---------------------- | ---------------------------------- |
| Dynamic page (default `<Link>`, `prefetch={null}`)       | 30 seconds             | **0 seconds — not cached**         |
| Static page                                              | 5 minutes              | 5 minutes (unchanged)              |
| Full prefetch (`prefetch={true}` or `router.prefetch()`) | 5 minutes              | 5 minutes (unchanged)              |
| `loading.js` boundaries                                  | 5 minutes              | 5 minutes (unchanged)              |
| Shared layouts                                           | Cached for the session | Cached for the session (unchanged) |
| Back/forward navigation                                  | Restored from cache    | Restored from cache (unchanged)    |

All context tab pages in this app are dynamic (they call `requireAuth()` which reads
cookies). In v14, revisiting a tab within 30 seconds is instant from cache. In v15,
every tab switch is a server round-trip unless you use `router.prefetch()` explicitly.

---

## How to restore v14 behavior after upgrading

```ts
// next.config.ts
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30, // restore v14 default for dynamic routes
      static: 300, // already the default; explicit for clarity
    },
  },
};
export default nextConfig;
```

`staleTimes` was introduced in v14.2.0 (experimental) and remains experimental in v15.
The docs say it is not recommended for production as-is but it is the documented migration
path for apps that relied on v14 cache behavior.

---

## Does router.prefetch() still work the same way?

Mostly yes. `router.prefetch()` still performs a full prefetch using the **static**
staleTime (5 minutes) regardless of whether the route is dynamic or static. This is the
same as v14.

New in **v15.4.0**: an `onInvalidate` callback that fires when the prefetched data
becomes stale (after `revalidatePath`, `revalidateTag`, or staleTimes expiry):

```ts
router.prefetch('/context/abc/notes', {
  onInvalidate: () => {
    // Called once when Next.js considers the prefetch stale
    // Re-prefetch to keep it warm
    router.prefetch('/context/abc/notes', { onInvalidate: ... })
  }
})
```

This is useful for building self-refreshing prefetch strategies — when the server
invalidates a path after a mutation, the `onInvalidate` callback can immediately
re-prefetch so the next tab click is still instant.

---

## Link prefetch behavior changes

| `prefetch` prop value       | Behavior                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `null` / `"auto"` (default) | Dynamic: prefetches layout + loading shell only (not page content). Static: full route. |
| `true`                      | Full route for both static and dynamic. 5-minute staleTime.                             |
| `false`                     | No prefetch at all.                                                                     |

For dynamic routes with the default `prefetch={null}` / `prefetch="auto"`:

- Next.js prefetches down to the nearest `loading.js` boundary — the layout and skeleton
- The actual page content is **not** prefetched
- On click: skeleton appears instantly (from cache), page content streams from server
- This is exactly why our `loading.tsx` files matter — they become the prefetchable shell

New in **v15.3.0**: `onNavigate` prop fires only during SPA navigation (not Ctrl+Click,
not external links). Useful for triggering optimistic UI the moment navigation starts.

---

## Other breaking changes that affect this app

### Async request APIs (significant)

`cookies()`, `headers()`, `params`, and `searchParams` must now be `await`ed:

```ts
// v14
const cookieStore = cookies();

// v15
const cookieStore = await cookies();
```

This affects every server component and server action that reads cookies, headers, or
route params. The automated codemod handles most of these:

```bash
npx @next/codemod@canary upgrade latest
```

### revalidatePath during render now throws

Calling `revalidatePath` or `revalidateTag` during the render phase throws an error in v15.
Must only be called from Server Actions or Route Handlers. This app already follows this
pattern (all `revalidatePath` calls are inside server actions) so no change needed.

### fetch no longer cached by default

`fetch()` in server components now uses `no-store` by default (was `force-cache` in v14).
This app uses Supabase's JS client for almost all data access (not raw `fetch`), so the
direct impact is minimal. Any `fetch` calls to external APIs should be audited.

### GET route handlers no longer cached by default

Any `GET` route handler that relied on v14's implicit caching must now add:

```ts
export const dynamic = 'force-static';
```

---

## React 19 requirement

Next.js 15 requires **React 19** for the App Router. The Pages Router still supports
React 18. Upgrading means upgrading React too — this is a larger change than just
updating Next.js.

React 19 brings:

- `useOptimistic` (stable — was experimental in v18)
- `useActionState` (replaces `useFormState` from react-dom)
- `use()` hook for unwrapping Promises and Context in render
- React Compiler (optional, experimental, requires React 19)

---

## The biggest new capability: Partial Prerendering (PPR)

PPR is the long-term Next.js answer to the "dynamic routes can't be meaningfully
prefetched" problem. It lets you mix a static shell with dynamic streaming content in
the same route:

```tsx
// app/context/[projectId]/notes/page.tsx
export const experimental_ppr = true;

export default function NotesPage() {
  return (
    <>
      <StaticPageChrome /> {/* prefetchable, renders instantly */}
      <Suspense fallback={<SkeletonNotes />}>
        <DynamicNotesContent /> {/* streams from server */}
      </Suspense>
    </>
  );
}
```

```ts
// next.config.ts
const nextConfig = {
  experimental: {
    ppr: 'incremental', // opt specific routes in
  },
};
```

With PPR: the static shell (chrome, skeleton) is prefetchable and renders instantly on
navigation. The dynamic data streams behind it. This directly solves the problem of
context tab pages being dynamic (and therefore not prefetchable in v15 without
`router.prefetch()`).

PPR is currently experimental and behind an opt-in flag.

---

## What this means for our Phase 1 implementation

### If staying on Next.js 14

No change needed. `router.prefetch()` works exactly as documented in the main research
doc. Prefetched dynamic routes are cached for 5 minutes.

### If upgrading to Next.js 15 before implementing prefetch

Two options:

**Option A — Add `staleTimes: { dynamic: 30 }`**
Restores v14 cache behavior. `router.prefetch()` benefits from the 30s window for
revisiting tabs without re-fetch. Simple config change, no code changes.

**Option B — Rely on `router.prefetch()` alone (without staleTimes)**
With `dynamic: 0` (v15 default), only explicitly prefetched routes get the 5-minute
cache. The tab bar prefetch loop we're building covers all enabled tabs, so every tab
gets the 5-minute window from the explicit prefetch. Navigation is still instant.
The difference: tab revisits after 5 minutes require a re-fetch (vs. 30 seconds in v14).
For this app that's acceptable.

**Recommendation: Option B** — don't fight the framework's new defaults. Use
`router.prefetch()` for all enabled tabs, get 5-minute cached navigation, and let stale
tabs re-fetch naturally. When `onInvalidate` fires after a mutation, re-prefetch
immediately to keep the cache warm.

### The `loading.tsx` files we created are even more valuable in v15

With v15's default `<Link>` behavior for dynamic routes, Next.js prefetches down to the
nearest `loading.js` boundary. Every tab click shows the skeleton instantly (from the
prefetched loading shell), then streams the content. Our 14 `loading.tsx` files
become the prefetchable first frame for every tab.

---

## Quick reference

```ts
// Restore v14 router cache (experimental)
experimental: { staleTimes: { dynamic: 30, static: 300 } }

// router.prefetch still gives 5-min cache for dynamic routes
router.prefetch('/context/abc/board')

// New: re-prefetch on invalidation (v15.4.0)
router.prefetch('/context/abc/board', {
  onInvalidate: () => router.prefetch('/context/abc/board', { ... })
})

// Dynamic route with default Link: prefetches loading shell only (not page content)
// loading.tsx files are therefore the "instantly prefetchable first frame"

// Upgrade command
npx @next/codemod@canary upgrade latest
npm install next@latest react@latest react-dom@latest
```
