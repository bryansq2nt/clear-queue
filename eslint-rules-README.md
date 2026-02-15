# Custom ESLint Rules (clear-queue)

This project defines three custom ESLint rules to enforce architecture and data-fetching patterns.

## Setup

The rules are implemented in `eslint-plugin-clear-queue/` and wired in `.eslintrc.js`. The plugin is linked via `package.json` (`"eslint-plugin-clear-queue": "file:./eslint-plugin-clear-queue"`). Run `npm install` once so ESLint can resolve the plugin. If you had `.eslintrc.json` before, you can remove it; ESLint will use `.eslintrc.js`.

Run lint:

```bash
npm run lint
```

To see violations for all three rules on a single file:

```bash
npx eslint app/EslintRulesViolationsClient.tsx
```

---

## Rule 1: `no-client-supabase-in-components`

**What it blocks:** Using `createClient()` (from the browser Supabase client) in any file that has the `'use client'` directive and matches:

- `components/**/*`
- `app/**/*Client.tsx`

**Why:** Client components run in the browser. Calling `createClient()` from `@/lib/supabase/client` there exposes the anon key and bypasses server-side auth and RLS in the intended way. Data access and mutations should go through server actions or server components that use `createClient()` from `@/lib/supabase/server`, so the app stays secure and consistent.

**Fix:** Remove Supabase usage from the client component. Prefer:

- Server components that call Supabase and pass data as props.
- Server actions that use the server Supabase client and are called from the client (e.g. form actions or `useTransition`).
- Passing pre-fetched data from a server component into the client component.

**Example violation:**

```tsx
// app/dashboard/DashboardClient.tsx
'use client';
import { createClient } from '@/lib/supabase/client';

export default function DashboardClient() {
  const supabase = createClient(); // ❌ reported
  // ...
}
```

---

## Rule 2: `no-select-star`

**What it blocks:** `.select('*')` in Supabase query chains.

**Why:** Selecting all columns with `'*'` pulls more data than needed, makes the API contract unclear, and can break when the table schema changes (new columns suddenly exposed). Explicit column lists keep payloads smaller and dependencies explicit.

**Fix:** Replace `.select('*')` with a list of the columns you actually use, e.g. `.select('id, name, created_at')`.

**Example violation:**

```ts
const { data } = await supabase.from('projects').select('*'); // ❌ reported
```

**Allowed:**

```ts
const { data } = await supabase.from('projects').select('id, name, created_at');
```

---

## Rule 3: `no-manual-refetch-after-action`

**What it blocks:** In the same function, the pattern of `await someServerAction()` (or similar) followed by `await loadSomething()` (e.g. `loadProjects()`, `loadLinks()`). The rule treats:

- “Action” as a function whose name ends with `Action` (e.g. `createProjectAction`, `updateClientLinkAction`).
- “Load” as a function whose name starts with `load` (e.g. `loadProjects`, `loadLinks`).

**Why:** After a server action, manually calling a `load*` function duplicates refetch logic and can get out of sync with the server. Prefer letting the server drive updates (e.g. `router.refresh()`, revalidation, or returning updated data from the action) so the UI updates in one place.

**Fix:** After calling a server action:

- Use `router.refresh()` so the current route’s server components re-fetch.
- Or return the new/updated data from the action and update client state from that result instead of calling `load*()`.

**Example violation:**

```tsx
async function handleSave() {
  await createProjectAction(formData); // server action
  await loadProjects(); // ❌ reported: manual refetch in same function
}
```

**Allowed:**

```tsx
async function handleSave() {
  const result = await createProjectAction(formData);
  if (result.data) setProject(result.data);
  router.refresh();
}
```

---

## Files

| Path                                   | Purpose                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `.eslintrc.js`                         | ESLint config; loads the plugin and enables the rules (with overrides for rule 1). |
| `eslint-plugin-clear-queue/index.js`   | Plugin entry; exports the three rules.                                             |
| `eslint-plugin-clear-queue/rules/*.js` | Implementation of each rule.                                                       |
| `app/EslintRulesViolationsClient.tsx`  | Example file that triggers all three rules (for testing).                          |
