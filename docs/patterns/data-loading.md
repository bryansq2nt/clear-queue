# Data Loading Pattern

**Status:** Standard  
**Date:** 2025-02-15  
**Context:** Performance optimization - eliminated 10-16 POST cascades by moving data fetching server-side

---

## Core Principle

**In Next.js 14 App Router: Data fetching belongs on the SERVER, not the client.**

---

## The Pattern

### Step 1: Server Component Fetches Data

```typescript
// app/[feature]/page.tsx
import { getFeatureData } from './actions'
import FeatureClient from './FeatureClient'

// ✅ CORRECT: Async Server Component
export default async function FeaturePage() {
  // Fetch data server-side
  const data = await getFeatureData()

  // Pass to client as props
  return <FeatureClient initialData={data} />
}
```

### Step 2: Wrap Read Actions with cache()

```typescript
// app/[feature]/actions.ts
'use server'
import { cache } from 'react'

// ✅ CORRECT: Wrapped with cache()
export const getFeatureData = cache(async () => {
  const supabase = await createClient()
  const user = await requireAuth()

  const { data } = await supabase
    .from('features')
    .select('id, name, status')
    .eq('user_id', user.id)

  return data
})

// ❌ WRONG: Don't cache mutations
export async function updateFeature(id: string, updates: object) {
  // NO cache() here - this is a mutation
}
```

### Step 3: Client Component Receives Props

```typescript
// app/[feature]/FeatureClient.tsx
'use client'
import { useState } from 'react'
import type { Feature } from './actions'

interface Props {
  initialData: Feature[]
}

// ✅ CORRECT: Client receives data as props
export default function FeatureClient({ initialData }: Props) {
  const [data, setData] = useState(initialData)

  // NO useEffect to fetch data
  // Only mutation handlers

  const handleUpdate = async (id: string) => {
    await updateFeatureAction(id, { ... })
    // Router refresh or optimistic update
  }

  return <div>{/* render */}</div>
}
```

---

## When to Use This Pattern

✅ **ALWAYS use for:**

- Initial page data loading
- Data that doesn't change frequently
- User-scoped data (projects, tasks, settings)
- Reference data (categories, tags)

❌ **DON'T use for:**

- Real-time data (use Supabase Realtime instead)
- Data that changes every second (use polling or websockets)
- Public data that's truly static (can use ISR/SSG)

---

## Why This Pattern Works

### Performance Benefits

**Before (Client Fetch):**

```
1. Server renders page → 200ms
2. Browser receives HTML → 50ms
3. React hydrates → 100ms
4. useEffect runs → 0ms
5. Fetch to server → 300ms (round trip)
6. Render data → 50ms
Total: ~700ms + visible loading spinner
```

**After (Server Fetch):**

```
1. Server fetches data → 300ms
2. Server renders with data → 200ms
3. Browser receives complete HTML → 50ms
4. React hydrates → 100ms
Total: ~650ms, NO loading spinner, data visible immediately
Savings: ~50ms + better UX (no spinner)
```

### Request Deduplication

With `cache()`:

```typescript
// Multiple components call this in same render
const data1 = await getFeatureData() // → DB query
const data2 = await getFeatureData() // → cached (0ms)
const data3 = await getFeatureData() // → cached (0ms)

// Result: 1 DB query instead of 3
```

---

## Common Mistakes

### ❌ Mistake 1: useEffect Fetch

```typescript
'use client'
function MyPage() {
  const [data, setData] = useState([])

  useEffect(() => {
    fetchData().then(setData) // ❌ WRONG
  }, [])
}
```

**Why wrong:**

- Slower (extra round trip)
- Causes loading spinners
- Can't be cached across components
- Runs twice in Strict Mode

### ❌ Mistake 2: No cache() on Reads

```typescript
'use server'
// ❌ WRONG: Not cached
export async function getData() {
  return supabase.from('table').select()
}
```

**Why wrong:**

- Multiple components calling this = multiple DB queries
- Can't deduplicate requests

### ❌ Mistake 3: cache() on Mutations

```typescript
'use server'
import { cache } from 'react'

// ❌ WRONG: Mutations should NOT be cached
export const updateData = cache(async (id, data) => {
  return supabase.from('table').update(data).eq('id', id)
})
```

**Why wrong:**

- Mutations should always execute
- Caching them breaks updates

---

## Migration Checklist

When converting an existing page:

- [ ] Find the client component (usually `[Feature]PageClient.tsx`)
- [ ] Identify data fetched in useEffect
- [ ] Move page.tsx to async Server Component
- [ ] Fetch data in page.tsx
- [ ] Wrap read actions with cache()
- [ ] Pass data to client as props
- [ ] Remove useEffect fetch from client
- [ ] Remove loading state (if data is guaranteed)
- [ ] Test: should see 3-5 POSTs instead of 10+
- [ ] Commit with clear description

---

## Examples in Codebase

✅ **Good examples (follow these):**

- `app/profile/page.tsx` + `ProfilePageClient.tsx`
- `app/settings/appearance/page.tsx` + appearance client (if migrated)

❌ **Bad examples (DO NOT COPY):**

- Any `[Feature]PageClient.tsx` with useEffect fetch for initial data
- Any page with loading spinners for initial data

---

## Related Patterns

- See: `docs/patterns/server-actions.md` for mutation patterns
- See: `docs/patterns/database-queries.md` for query optimization
- See: `docs/anti-patterns/client-side-data-fetching.md` for what NOT to do
