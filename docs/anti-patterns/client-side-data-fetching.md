# Anti-Pattern: Client-Side Data Fetching in useEffect

**Severity:** 🔴 Critical Performance Issue  
**Impact:** 3-10 second load times, 10-16x request overhead  
**Instances Found:** Multiple pages (being fixed)  
**Pattern Status:** ❌ FORBIDDEN

---

## What This Anti-Pattern Looks Like

```typescript
// ❌ ANTI-PATTERN: Client component fetching data
'use client'
import { useEffect, useState } from 'react'
import { getFeatureData } from './actions'

export default function FeaturePage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const result = await getFeatureData()
      setData(result)
      setLoading(false)
    }
    loadData()
  }, [])

  if (loading) return <Spinner />

  return <div>{/* render data */}</div>
}
```

---

## Why This Is Bad

### 1. Performance Impact

**Request cascade observed in real logs:**

```
GET /profile 200 in 4697ms        ← Page loads
POST /profile 200 in 799ms         ← useEffect fetch #1
POST /profile 200 in 600ms         ← Nested action
POST /profile 200 in 346ms         ← Another nested action
POST /profile 200 in 292ms         ← ...
... (12 more POSTs)
POST /profile 200 in 621ms         ← Final fetch

Total: ~10 seconds, 16 POST requests
```

**Root causes:**

- useEffect runs AFTER component mounts (extra round trip)
- React Strict Mode doubles execution in dev (2x requests)
- Multiple components fetching same data (no deduplication)
- Nested action calls compound the problem

### 2. User Experience Impact

**Users see:**

- Blank page or skeleton (bad)
- Loading spinner for 3-10 seconds (terrible)
- Content finally appears (relief)

**Instead of:**

- Content appears immediately (<1 second)

### 3. Server Load Impact

- 10-16x more database queries than necessary
- Can trigger rate limits in production
- Wastes Supabase/database resources
- Increases hosting costs

---

## Real-World Example from Our Codebase

### Before (ProfilePageClient.tsx - BAD)

```typescript
'use client'

export default function ProfilePageClient() {
  const [profile, setProfile] = useState(null)
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async () => {
    const [profileData, prefsData] = await Promise.all([
      getProfileWithAvatar(),  // ← POST #1
      getPreferences()         // ← POST #2
    ])

    if (profileData.avatar_asset_id) {
      const avatarUrl = await getAssetSignedUrl(profileData.avatar_asset_id) // ← POST #3
      setProfile({ ...profileData, avatarUrl })
    }

    setPreferences(prefsData)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  if (loading) return <Spinner />
  return <div>{/* ... */}</div>
}
```

**Measured impact:**

- Load time: 10 seconds
- POST requests: 16
- User sees: Spinner for 10 seconds

### After (page.tsx + ProfilePageClient - GOOD)

```typescript
// app/profile/page.tsx
export default async function ProfilePage() {
  const profile = await getProfileWithAvatar()  // ← Cached
  const preferences = await getPreferences()     // ← Cached

  let avatarUrl = null
  if (profile?.avatar_asset_id) {
    avatarUrl = await getAssetSignedUrl(profile.avatar_asset_id) // ← Cached
  }

  return (
    <ProfilePageClient
      profile={profile}
      preferences={preferences}
      initialAvatarUrl={avatarUrl}
    />
  )
}

// ProfilePageClient.tsx
'use client'
export default function ProfilePageClient({
  profile,
  preferences,
  initialAvatarUrl
}) {
  const [localProfile, setLocalProfile] = useState(profile)
  const [localPrefs, setLocalPrefs] = useState(preferences)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)

  // NO useEffect for data loading
  // Only mutation handlers remain

  return <div>{/* ... */}</div>
}
```

**Measured impact:**

- Load time: 0.8 seconds (91% improvement ✅)
- POST requests: 4 (75% reduction ✅)
- User sees: Content immediately ✅

---

## How to Detect This Anti-Pattern

### In Code Review

Look for:

```typescript
'use client'
// ...
useEffect(() => {
  fetch*()  // or any server action call
}, [])
```

### In Browser DevTools

1. Open Network tab
2. Filter by "Fetch/XHR"
3. Navigate to page
4. Count POST requests  
   **If > 5 POSTs → investigate**

### In Terminal Logs

```bash
npm run dev
# Navigate to page
# Count POST logs
```

Pattern to watch for:

```
GET /page 200 in XXXms
POST /page 200 in XXXms  ← Many of these
POST /page 200 in XXXms
POST /page 200 in XXXms
...
```

---

## How to Fix

Follow this checklist:

1. **Identify the client component**  
   Usually named `[Feature]PageClient.tsx`

2. **Find useEffect fetches**  
   Search for `useEffect` + async function or server action calls

3. **Move to page.tsx**

   ```typescript
   // page.tsx
   export default async function Page() {
     const data = await getData() // ← Move here
     return <ClientComponent data={data} />
   }
   ```

4. **Wrap actions with cache()**

   ```typescript
   import { cache } from 'react'
   export const getData = cache(async () => { ... })
   ```

5. **Update client to receive props**

   ```typescript
   'use client';
   export default function ClientComponent({ data }) {
     const [localData, setLocalData] = useState(data);
     // Remove useEffect
   }
   ```

6. **Test and measure**

   ```bash
   # Before fix: count POSTs
   # After fix: should be 50-75% fewer
   ```

---

## Prevention

### In .cursorrules

Already documented:

```
## Data Loading

- ALWAYS fetch data in Server Components when possible
- NEVER use useEffect to fetch initial page data
- Use React cache() for read-only server actions
- Pass data to client components as props
```

### In Code Review

Reject PRs that:

- Add useEffect with server action calls for initial data
- Create client components that fetch on mount
- Don't use cache() on read actions

### In ESLint (Future)

Consider custom rule:

```javascript
// rules/no-useeffect-server-actions.js
// Warn: useEffect that calls server actions
```

---

## Exceptions

There ARE valid uses of client-side fetching:

✅ **Valid cases:**

- User-triggered actions (button click → fetch)
- Polling for updates (setInterval → fetch)
- Infinite scroll / pagination (scroll → fetch next page)
- Search-as-you-type (debounced → fetch results)
- Conditional fetches (if user clicks tab → fetch tab data)

❌ **Invalid cases:**

- Initial page load data
- Data needed for first render
- Data that could be server-fetched

---

## See Also

- `docs/patterns/data-loading.md` - Correct pattern
- `docs/patterns/server-actions.md` - Server action best practices
- `templates/nextjs-page.template.tsx` - Copy-paste template
