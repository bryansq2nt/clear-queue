# Troubleshooting Log

This document tracks problems encountered during development and their solutions to prevent recurring issues.

---

## 2026-01-19: Type Error in tabs.tsx Build

### Context

Building Project Notes feature with shadcn/ui Tabs component.

### Problem

```
Type error: Type 'ForwardRefExoticComponent<TabsListProps & RefAttributes<HTMLDivElement>>'
does not satisfy the constraint...
```

Build failed during `npm run build` with TypeScript errors in `components/ui/tabs.tsx`.

### Root Cause

**Dependency version incompatibility:**

- React 19 was installed in the project
- `lucide-react@0.309.0` only supports React 16-18
- `@radix-ui/react-tabs` and other UI packages not yet compatible with React 19
- Peer dependency conflicts causing type errors

### Solution Implemented

**NO CODE CHANGES NEEDED** - The issue was dependency versions, not the code itself.

1. **Downgrade React to version 18:**

   ```bash
   npm install react@18 react-dom@18 @types/react@18 @types/react-dom@18
   ```

2. **Update @radix-ui/react-tabs to latest:**

   ```bash
   npm install @radix-ui/react-tabs@latest
   ```

3. **Verify build:**
   ```bash
   npm run build
   ```

### Prevention

- ✅ **DO NOT upgrade to React 19** until all packages (especially UI libraries like lucide-react, @radix-ui/\*) explicitly support it
- ✅ Check peer dependencies before upgrading React versions
- ✅ Verify compatibility of all UI packages before major React upgrades
- ✅ Keep React 18 until ecosystem catches up

### Related Issues

- Similar type errors may occur with other Radix UI components if React 19 is installed
- Recharts components also had similar issues (resolved with `as any` casts, but dependency fix is preferred)

---

## 2026-01-19: ESLint Config Error on Vercel Build

### Context

Deploying to Vercel after implementing Project Notes feature.

### Problem

```
ESLint: Invalid Options: - Unknown options: useEslintrc, extensions - 'extensions' has been removed.
Failed to compile.
./components/EditProjectModal.tsx:144:35
```

Build failed on Vercel with ESLint configuration errors.

### Root Cause

**ESLint version incompatibility:**

- `eslint-config-next@16.1.3` requires ESLint >= 9.0.0
- ESLint 9 uses flat config format, but Next.js 14.2.35 with `.eslintrc.json` uses old format
- The error "Unknown options: useEslintrc, extensions" indicates ESLint 9 is trying to use ESLint 8 options
- Version mismatch between ESLint 9 and the config format expected by Next.js 14

### Solution Implemented

**Downgrade to compatible versions (NOT ignoring the error):**

1. **Downgrade ESLint to version 8:**

   ```bash
   npm install eslint@^8.57.0 --save-dev
   ```

2. **Downgrade eslint-config-next to version 14 (compatible with ESLint 8):**

   ```bash
   npm install eslint-config-next@14.2.4 --save-dev
   ```

3. **Update package.json:**
   ```json
   "eslint": "^8.57.0",
   "eslint-config-next": "^14.2.4"
   ```

This ensures:

- ESLint 8 works with `.eslintrc.json` format (no flat config needed)
- `eslint-config-next@14.2.4` is compatible with ESLint 8
- No need to ignore ESLint errors - proper configuration is used
- Builds will pass on Vercel with correct ESLint checking

### Prevention

- ✅ **DO NOT upgrade to ESLint 9** until Next.js fully supports ESLint 9 flat config format
- ✅ Keep ESLint 8 with eslint-config-next 14.x for Next.js 14 projects
- ✅ Check compatibility before upgrading ESLint major versions
- ✅ Verify that Next.js version supports the ESLint version you want to use
- ✅ Always test builds locally before deploying to catch version mismatches early

### When to Upgrade

- Wait for Next.js 15+ which may have better ESLint 9 support
- Or wait for eslint-config-next to provide proper ESLint 9 flat config support
- Always test builds locally before deploying

---

## Development Guidelines

### Before Implementing New Features

1. ✅ Consult this troubleshooting log
2. ✅ Check for similar errors already resolved
3. ✅ Apply preventive solutions from the start
4. ✅ Verify React version compatibility with all packages

### During Development

- If you encounter a new error, document it immediately
- Add the solution once resolved
- Update this log with identified patterns

### React Version Policy

- **Current:** React 18.x
- **Do NOT upgrade to React 19** until:
  - lucide-react supports React 19
  - All @radix-ui/\* packages support React 19
  - All other UI dependencies are verified compatible

---

## Notes

- This log should be updated whenever a new problem is encountered and resolved
- Focus on root causes, not just symptoms
- Include exact commands/steps that fixed the issue

---

## 2026-02-01: Supabase TypeScript "Argument of type 'any' is not assignable to parameter of type 'never'" Error

### Context

Building Todo Lists feature with Supabase database operations using TypeScript.

### Problem

```
Type error: Argument of type 'any' is not assignable to parameter of type 'never'.
./lib/todo/lists.ts:153:13
  151 |   const { data, error } = await supabase
  152 |     .from('todo_lists')
> 153 |     .update(updateData as any)
      |             ^
Next.js build worker exited with code: 1
```

Build failed with TypeScript errors when calling `.insert()` and `.update()` methods on Supabase queries, even when using `as any` type assertions.

### Root Cause

**Supabase TypeScript type inference issue:**

- When explicitly typing the Supabase client with `SupabaseClient<Database>`, TypeScript loses proper type inference through the query chain
- The query builder methods (`.from()`, `.insert()`, `.update()`) couldn't properly infer types
- Simply casting with `as any` on the data wasn't enough - the entire query chain needed to be typed as `any`
- Different pattern needed compared to simple variable type assertions

### Solution Implemented

**Use the split query pattern with `any` typing (matching working files):**

1. **Remove explicit `SupabaseClient<Database>` typing:**

   ```typescript
   // ❌ BEFORE (causes type errors):
   const supabase: TypedSupabaseClient = await createClient();

   // ✅ AFTER (works):
   const supabase = await createClient();
   ```

2. **Split the query chain and cast `.from()` to `any`:**

   ```typescript
   // ❌ BEFORE (causes "never" type error):
   const { data, error } = await supabase
     .from('todo_lists')
     .update(updateData as any)
     .eq('id', id)
     .select()
     .single();

   // ✅ AFTER (works):
   const query: any = (supabase.from('todo_lists') as any).update(
     updateData as any
   );

   const result: any = await query.eq('id', id).select().single();

   const { data, error } = result;
   ```

3. **Keep type safety for data objects:**

   ```typescript
   // Still use proper types when building the data objects:
   const updateData: TodoListUpdate = {};
   if (updates.title !== undefined) {
     updateData.title = updates.title.trim();
   }
   // ... etc
   ```

4. **Apply this pattern to ALL update and insert operations:**
   - `createTodoList` - insert with `insertData as any`
   - `updateTodoList` - split query pattern
   - `archiveTodoList` - split query pattern
   - `createTodoItem` - insert with `insertData as any`
   - `updateTodoItem` - split query pattern
   - `toggleTodoItem` - split query pattern

### Why This Pattern Works

- Casting `.from()` to `any` prevents TypeScript from trying to infer complex generic types
- The `query: any` variable breaks the type inference chain
- You still get type safety when building `insertData` and `updateData` objects
- This is the **same pattern** used successfully in `projects.ts` and `tasks.ts`

### Prevention

- ✅ **DO NOT explicitly type Supabase client** with `SupabaseClient<Database>` in server actions/queries
- ✅ **Use the split query pattern** for all `.update()` operations: cast `.from()` to `any`, store in `query: any`, then destructure result
- ✅ **Use `insertData as any`** for `.insert()` operations after typing the data object
- ✅ **Keep typed data objects** (`TodoListInsert`, `TodoListUpdate`, etc.) for type safety when building data
- ✅ **Reference existing working files** (`projects.ts`, `tasks.ts`) for the correct pattern
- ✅ **Test builds frequently** during development to catch type errors early

### Related Files

- `lib/todo/lists.ts` - Fixed with split query pattern
- `lib/actions/projects.ts` - Working example to reference
- `lib/actions/tasks.ts` - Working example to reference

### Code Example (Complete Pattern)

```typescript
// Import types
import { Database } from '@/lib/supabase/types'
type TodoListUpdate = Database['public']['Tables']['todo_lists']['Update']

// Function with update
export async function updateTodoList(id: string, updates: {...}): Promise<TodoList> {
  const supabase = await createClient()  // No explicit typing

  // Build typed data object
  const updateData: TodoListUpdate = {}
  if (updates.title !== undefined) {
    updateData.title = updates.title.trim()
  }

  // Split query pattern with 'any' casting
  const query: any = (supabase
    .from('todo_lists') as any)
    .update(updateData as any)

  const result: any = await query
    .eq('id', id)
    .select()
    .single()

  const { data, error } = result

  if (error) throw new Error(error.message)
  return data
}
```

---

## 2026-02-08: Vercel Build — Supabase Insert/Update "parameter of type 'never'" (clients, businesses, client_links)

### Context

Deploying to Vercel after adding Clients, Businesses, and Client Links. Build passes locally with ESLint; Vercel runs **TypeScript** during `next build`, which failed.

### Problem

```
Failed to compile.
./app/clients/actions.ts:69:13

No overload matches this call.
  Overload 1 of 2, '(values: never, ...)' gave the following error:
    Argument of type '{ owner_id: string; full_name: string; ... }' is not assignable to parameter of type 'never'.
  Overload 2 of 2, '(values: never[], ...)' ...
```

Similar errors at:

- **Line 69** – `supabase.from('clients').insert({ ... })`
- **Line 104** – `supabase.from('clients').update({ ... })`
- **Line 176** – `clients` select result (e.g. `c.id`, `c.full_name`) typed as `never`
- **Lines 236, 276** – `businesses` insert/update
- **Lines 341, 368** – `client_links` insert/update

Linter did not report these; only `next build` / `tsc` did.

### Root Cause

**Supabase client inferring `never` for certain tables:**

- The Supabase client is typed with `createServerClient<Database>` (see `lib/supabase/server.ts`).
- If the hand-written `Database` type in `lib/supabase/types.ts` is missing the shape the client expects (e.g. **Views**, **Enums**, **CompositeTypes**), or there is a version mismatch, the generic for `.from('table_name')` can resolve to `never` for insert/update.
- Then `.insert(payload)` and `.update(payload)` expect `never`, so any real payload fails type-checking.
- Select results can also be inferred as `never`, so property access (e.g. `c.id`) fails.

### Solution Implemented

**1. Complete the `Database` type (lib/supabase/types.ts)**

Add empty `Views`, `Enums`, and `CompositeTypes` under `public` so the schema shape matches what the Supabase client expects:

```typescript
// Inside Database['public'], after Tables: { ... }:
Views: {
  [_ in never]: never
}
Enums: {
  [_ in never]: never
}
CompositeTypes: {
  [_ in never]: never
}
```

**2. Cast insert/update payloads to `never` in actions (app/clients/actions.ts)**

Keep type safety by building the payload with the correct `Insert`/`Update` type, then pass it to Supabase as `never` so the client accepts it:

```typescript
// Build payload with proper type (type safety preserved)
const insertPayload: Database['public']['Tables']['clients']['Insert'] = {
  owner_id: user.id,
  full_name,
  phone: (formData.get('phone') as string)?.trim() || null,
  // ... rest of fields
};

// Cast to never so Supabase client accepts it
const { data, error } = await supabase
  .from('clients')
  .insert(insertPayload as never)
  .select()
  .single();
```

Apply the same pattern for:

- **clients**: insert + update
- **businesses**: insert + update
- **client_links**: insert + update

**3. Type select results when they infer as `never`**

If a select (e.g. from `clients`) is inferred as `never[]`, cast the result before use:

```typescript
const { data: clientsData } = await supabase
  .from('clients')
  .select('id, full_name')
  .in('id', clientIds);

const clientsList = (clientsData || []) as { id: string; full_name: string }[];
// Now use clientsList in .reduce() or similar
```

### Why This Works

- The payload is still built with `Database['...']['Insert']` or `Update`, so your code stays type-safe.
- Casting to `never` only satisfies the client’s broken generic; runtime behavior is unchanged.
- Adding `Views`/`Enums`/`CompositeTypes` can fix inference for other projects; if it doesn’t, the `as never` pattern still unblocks the build.

### Prevention

- ✅ After adding new tables to `lib/supabase/types.ts`, ensure `Views`, `Enums`, and `CompositeTypes` exist under `public`.
- ✅ Run **`npx tsc --noEmit`** (or `npm run build`) locally before pushing; that matches what Vercel runs and catches these errors.
- ✅ For new Supabase insert/update in server actions, if you see “parameter of type 'never'”, use: typed payload variable + `insert(payload as never)` or `update(payload as never)`.
- ✅ Prefer regenerating types with `npx supabase gen types typescript` when possible so the schema matches the client.

### Related

- **2026-02-01** (this file): Different Supabase fix using split query + `.from('...') as any` in `lib/todo/lists.ts`. Use that pattern if `as never` on the payload is not enough or if the file already uses the split-query style.
- **Files changed:** `lib/supabase/types.ts` (Views/Enums/CompositeTypes), `app/clients/actions.ts` (payload variables + `as never`, clients list cast).

---

## 2026-02-13: "Property 'X' does not exist on type 'IntrinsicAttributes & SomeComponentProps'"

### Context

Next.js app with server components passing props to client components (e.g. Ideas page).

### Problem

```
Type error: Type '{ initialBoards: ...; initialIdeas: ...; initialProjects: ... }'
is not assignable to type 'IntrinsicAttributes & IdeasPageClientProps'.
  Property 'initialProjects' does not exist on type 'IntrinsicAttributes & IdeasPageClientProps'.

  20 |       initialProjects={projects}
      |       ^
```

Build fails because the server page passes a prop that the client component does not declare.

### Root Cause

**Missing prop in client component interface:**

- The server page fetches data and passes it to a client component (e.g. `initialProjects={projects}`).
- The client component’s props interface did not include that prop, so TypeScript rejects it.

### Solution Implemented

**Declare and forward the prop in the client component:**

1. Add the prop to the component’s props interface with the correct type (match what the server passes, e.g. `listProjectsForPicker()` returns `{ id: string; name: string }[]`):

   ```typescript
   interface IdeasPageClientProps {
     initialBoards: any[];
     initialIdeas: any[];
     initialProjects?: { id: string; name: string }[]; // add this
   }
   ```

2. Destructure it in the component (with default if optional):

   ```typescript
   export default function IdeasPageClient({
     initialBoards,
     initialIdeas,
     initialProjects = [],
   }: IdeasPageClientProps) {
   ```

3. Pass it through to any child that needs it:
   ```typescript
   <IdeasDashboardClient
     initialBoards={initialBoards}
     initialIdeas={initialIdeas}
     initialProjects={initialProjects}
   />
   ```

### Prevention

- ✅ When adding a new prop to a server→client call, update the client component’s props interface and destructuring.
- ✅ Keep prop types in sync with server data (e.g. return type of `listProjectsForPicker()`).

### Related Files

- `app/ideas/page.tsx` (server, passes `initialProjects`)
- `app/ideas/IdeasPageClient.tsx` (client, must declare and forward the prop)

---

## 2026-02-13: "This expression is not callable. Type 'String' has no call signatures" (i18n `t` shadowed)

### Context

Using `useI18n()` and `t()` for translations in a component that also uses a local variable named `t`.

### Problem

```
./app/notes/components/NoteEditor.tsx:139:16
Type error: This expression is not callable.
  Type 'String' has no call signatures.

  139 |       setError(t('notes.error_select_project'))
      |                ^
```

Build fails even though `t` from `useI18n()` is a function; TypeScript reports `t` as type `String`.

### Root Cause

**Variable shadowing:**

- The component does `const { t } = useI18n()` (translation function).
- In the same function (e.g. `handleSaveClick`), a later line declares `const t = title.trim()`.
- In TypeScript, that later declaration makes `t` have type `string` for the **entire** function body, so the earlier call `t('notes.error_select_project')` is invalid (string is not callable).

### Solution Implemented

**Rename the local variable so it does not shadow the i18n `t`:**

```typescript
// ❌ BEFORE (shadows useI18n's t):
const t = title.trim()
if (!t) {
  setError(t('notes.error_title_required'))  // t is string here
}
// ...
title: t,

// ✅ AFTER:
const trimmedTitle = title.trim()
if (!trimmedTitle) {
  setError(t('notes.error_title_required'))   // t still the translation function
}
// ...
title: trimmedTitle,
```

### Prevention

- ✅ Do **not** use the name `t` for local variables in components that use `const { t } = useI18n()`.
- ✅ Prefer names like `trimmedTitle`, `trimmed`, or `value` for local string variables in those components.

### Related Files

- `app/notes/components/NoteEditor.tsx` (fixed by renaming local `t` to `trimmedTitle`)
