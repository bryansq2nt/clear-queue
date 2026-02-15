# useEffect dependency audit: ProfilePageClient

**File:** `app/settings/profile/ProfilePageClient.tsx`  
**Purpose:** Identify whether useEffect dependencies could cause multiple runs and cascade of POST requests.

---

## Summary

There is **one** `useEffect` in this file. Dependencies are correctly set; the likely cause of multiple requests is elsewhere (e.g. parent re-mounts, Strict Mode, or inline action calls in Select handlers).

---

## useEffect #1

**Location:** Lines 76–79

```typescript
useEffect(() => {
  console.log('🟡 [CLIENT] useEffect running - loading profile data');
  loadProfile();
}, [loadProfile]);
```

**What it does:** Runs on mount (and when `loadProfile` reference changes). Calls `loadProfile()`, which:

- Calls `getProfileWithAvatar()` (server action)
- Calls `getPreferences()` (server action from appearance/actions)
- If profile has avatar, calls `getAssetSignedUrl(p.avatar_asset_id)` (server action)

So one run of this effect can trigger **2–3** server actions (POSTs).

**Dependencies:** `[loadProfile]`

**Where `loadProfile` comes from:** It is defined with `useCallback` and an **empty** dependency array (lines 50–75):

```typescript
const loadProfile = useCallback(async () => {
  // ... getProfileWithAvatar(), getPreferences(), getAssetSignedUrl()
}, []); // ← empty array = stable reference
```

So `loadProfile` is **stable** across renders (same function reference). The effect should only run:

1. On initial mount.
2. If `loadProfile` ever changed (it does not, given `[]`).

**Assessment:** **GOOD** — Dependencies are correct. The effect is not re-running because of changing dependencies.

**Why you might still see multiple POSTs:**

1. **Component remounting** — If the parent of `ProfilePageClient` re-renders in a way that unmounts/remounts (e.g. `key` change, or conditional render that toggles), this effect runs again and triggers another batch of server actions.
2. **React Strict Mode (dev)** — In development, Strict Mode can double-invoke effects, so you may see the effect (and thus `loadProfile`) run twice on first load.
3. **Locale/currency Selects** — The locale and currency dropdowns call `updateProfile({ locale: v })` and `updatePreferences({ currency: v })` **on every value change** (lines 291, 307). Each change = 1 POST. If the component re-renders and the Selects fire `onValueChange` again (e.g. controlled value reset or re-initialization), that could add more POSTs.
4. **Multiple mounts** — If the profile route or layout renders this client component in more than one place (or multiple instances due to routing/layout), each instance will run this effect once per mount.

---

## Recommendations

1. **Check parent and layout** — Ensure nothing in the profile route or layout is causing `ProfilePageClient` to unmount/remount (e.g. no `key` that changes, no conditional wrapper that flips).
2. **Debounce or avoid inline updates** — Consider not calling `updateProfile` / `updatePreferences` on every locale/currency change; e.g. only update on explicit “Save” or debounce the calls.
3. **Keep the effect as-is** — No change needed to the dependency array; the current setup is correct.
