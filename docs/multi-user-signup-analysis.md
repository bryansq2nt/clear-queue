# Multi-User & Signup – Analysis

This document summarizes how the app works today (single admin-only) and the **easiest path** to add signup and per-user data (projects, ideas, budgets, etc.) so each user only sees their own data.

---

## 1. Current Auth & Access Model

| Piece             | Behavior                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Login**         | `LoginForm` + `signIn()` in `app/actions/auth.ts`. Supabase `signInWithPassword`.                                                                                                                                                                                                                                                    |
| **Gate**          | After login, `signIn()` checks `data.user?.email === ADMIN_EMAIL`; if not, signs out and returns "Not authorized".                                                                                                                                                                                                                   |
| **requireAuth()** | `lib/auth.ts`: redirects to `/` if no user; **redirects to `/?error=unauthorized` if `user.email !== ADMIN_EMAIL`**. So only the admin email can use the app.                                                                                                                                                                        |
| **Middleware**    | Protects **only `/dashboard`**: no user → redirect to `/`; user not admin → redirect to `/?error=unauthorized`. Redirects logged-in admin from `/` to `/dashboard`. **Other routes** (`/project`, `/ideas`, `/todo`, `/budgets`) are **not** protected in middleware; they rely on each page’s `requireAuth()` which enforces admin. |
| **Signup**        | **None.** No signup page, no `signUp` action.                                                                                                                                                                                                                                                                                        |

So today: one user (ADMIN_EMAIL), no signup, and admin check in both auth action and `requireAuth()`.

---

## 2. Data Ownership & RLS (Who Can See What)

### Already multi-tenant (have `owner_id` / `user_id` and RLS by `auth.uid()`)

| Area          | Tables                                                           | Owner column | RLS                     |
| ------------- | ---------------------------------------------------------------- | ------------ | ----------------------- |
| **Ideas**     | `ideas`, `idea_connections`, `idea_boards`, `idea_project_links` | `owner_id`   | `owner_id = auth.uid()` |
| **Todo**      | `todo_lists`, `todo_items`                                       | `owner_id`   | `owner_id = auth.uid()` |
| **Favorites** | `project_favorites`                                              | `user_id`    | `user_id = auth.uid()`  |

Server code for ideas/todo already uses `getUser()` and passes `owner_id` on create. **No schema change needed** for these; they will automatically be per-user once we allow non-admin users to log in.

### Not multi-tenant (no owner, or RLS allows any authenticated user)

| Area         | Tables                                         | Current RLS                                       | Issue                                                                                                            |
| ------------ | ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Projects** | `projects`                                     | `auth.uid() IS NOT NULL` (any authenticated user) | No `owner_id`; everyone would see everyone’s projects.                                                           |
| **Tasks**    | `tasks`                                        | Same                                              | No owner; scoped only by `project_id`. Once projects are per-user, we must scope tasks by “project owned by me”. |
| **Budgets**  | `budgets`, `budget_categories`, `budget_items` | `auth.role() = 'authenticated'`                   | No owner; everyone would see all budgets.                                                                        |

So the **minimal set of changes** is: add ownership for **projects** (and scope **tasks** and **budgets** by that or by an explicit owner where needed).

---

## 3. Where Auth Is Used in Code

- **requireAuth()** – Used in:
  - Page routes: `app/dashboard/page.tsx`, `app/dashboard/analytics/page.tsx`, `app/project/[id]/page.tsx`, `app/budgets/page.tsx`, `app/budgets/[id]/page.tsx`, `app/todo/page.tsx`, `app/ideas/page.tsx`, `app/ideas/[id]/page.tsx`, `app/ideas/boards/page.tsx`, `app/ideas/boards/[id]/page.tsx`, `app/ideas/boards/[id]/canvas/page.tsx`, and loaders like `app/ideas/load-idea-data.ts`, `app/ideas/load-board-data.ts`.
  - Server actions: `app/actions/projects.ts`, `app/actions/tasks.ts`, `app/actions/auth.ts` (indirectly), `app/budgets/actions.ts`, `app/budgets/[id]/actions.ts`, `app/todo/actions.ts`, `app/ideas/actions.ts`, `app/ideas/[id]/project-link-actions.ts`, `app/ideas/boards/actions.ts`, `app/ideas/boards/[id]/canvas/actions.ts`, `app/ideas/boards/[id]/canvas/connection-actions.ts`, `app/ideas/boards/[id]/canvas/batch-actions.ts`.
- **getUser()** – Used in:
  - `lib/auth.ts` (inside `requireAuth` and `checkIsAdmin`), `app/actions/projects.ts` (favorites: `getFavoriteProjectIds`, `addProjectFavorite`, `removeProjectFavorite`).
  - Idea/todo libs: `lib/idea-graph/ideas.ts`, `lib/idea-graph/connections.ts`, `lib/idea-graph/project-links.ts`, `lib/idea-graph/boards.ts`, `lib/todo/lists.ts` (they get `owner_id` and pass it on insert).

**Conclusion:**

- Switching to “any authenticated user” only requires changing **`requireAuth()`** and **middleware** (and sign-in flow); no need to change every call site.
- For **projects/tasks/budgets**, we need **schema + RLS + one place that sets owner** (create project, create budget).

---

## 4. Recommended Approach (Easiest Path)

### Principle

1. **Auth:** Add signup (Supabase `signUp`), allow **any** authenticated user (remove ADMIN_EMAIL gate for app access).
2. **Projects:** Add `owner_id` to `projects`; RLS: user sees only rows where `owner_id = auth.uid()`; on create set `owner_id = auth.uid()`.
3. **Tasks:** Do **not** add a column; RLS: allow access if the task’s project is owned by the current user (subquery on `projects`).
4. **Budgets:** Scope by project ownership (budget’s `project_id` must point to a project owned by the user), **or** add `owner_id` to `budgets` for consistency and “unassigned” budgets. Recommended: **add `owner_id`** to `budgets` and set it on create so RLS is simple and consistent.
5. **Ideas / Todo / Favorites:** Already correct; no change beyond allowing non-admin users.

### Optional

- Keep **ADMIN_EMAIL** for a future “admin” role (e.g. global settings, user list) but **do not** use it to block normal users from the app.
- **Email confirmation:** Configure in Supabase (Auth → Email); no code change required for basic signup.

---

## 5. Concrete Steps (Checklist)

### 5.1 Auth & signup

| Step | What to do                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Signup action** in `app/actions/auth.ts`: e.g. `signUp(formData)` using `supabase.auth.signUp({ email, password })`. Return success/error (no ADMIN_EMAIL check for signup).                                                                                                                                                                                                                |
| 2    | **Signup UI**: Add a signup form (new page `/signup` or tab on home). Same fields as login (email + password); call `signUp` and then redirect to `/dashboard` or show “Check your email” if you enable email confirmation.                                                                                                                                                                   |
| 3    | **requireAuth()** in `lib/auth.ts`: Remove the `ADMIN_EMAIL` check. Only redirect to `/` if `!user`. So any logged-in user is allowed.                                                                                                                                                                                                                                                        |
| 4    | **signIn()** in `app/actions/auth.ts`: Remove the block that signs out and returns error when `email !== ADMIN_EMAIL`. After successful `signInWithPassword`, redirect to `/dashboard` (any authenticated user).                                                                                                                                                                              |
| 5    | **Middleware**: (a) Treat all app routes as protected: e.g. if path is `/dashboard`, `/project`, `/ideas`, `/todo`, `/budgets` (and their children), require `user`; if no user, redirect to `/`. (b) Redirect **any** authenticated user from `/` to `/dashboard` (remove `isAdmin` condition). (c) Optionally keep `ADMIN_EMAIL` only for future admin-only routes, not for general access. |
| 6    | **Home page** `app/page.tsx`: Use “any authenticated user” for redirect (e.g. `if (user) redirect('/dashboard')` without admin check). Keep or adjust error message for `?error=unauthorized` (e.g. remove or repurpose).                                                                                                                                                                     |

No change to **LoginForm** except if you add a “Sign up” link to the signup page.

### 5.2 Projects (schema + RLS + app)

| Step | What to do                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7    | **Migration – projects**: Add `owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`. For existing rows: either set to a single “legacy” user (e.g. from ADMIN_EMAIL lookup in `auth.users`) or leave nullable and backfill, then set NOT NULL. Add index on `owner_id`. |
| 8    | **Migration – projects RLS**: Drop policy “Authenticated users can access projects”. Add SELECT/INSERT/UPDATE/DELETE policies with `owner_id = auth.uid()`. For INSERT, use a trigger or app code to set `owner_id = auth.uid()`.                                             |
| 9    | **createProject** in `app/actions/projects.ts`: After `requireAuth()`, get `user.id` and include `owner_id: user.id` in the insert.                                                                                                                                           |
| 10   | **TypeScript** `lib/supabase/types.ts`: Add `owner_id` to `projects` Row/Insert/Update.                                                                                                                                                                                       |

All other project reads/writes go through Supabase client or server with the user session; RLS will restrict to current user’s projects. No need to change every component that lists projects.

### 5.3 Tasks (RLS only)

| Step | What to do                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11   | **Migration – tasks RLS**: Replace “Authenticated users can access tasks” with policies that allow access only if the task’s project is owned by the current user, e.g. `USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()))` for SELECT/UPDATE/DELETE; INSERT with `WITH CHECK (same EXISTS)`. |

No new column on `tasks`. Server actions already use `requireAuth()` and operate by `project_id`; RLS will enforce that the project is owned by the user.

### 5.4 Budgets (schema + RLS + app)

| Step | What to do                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12   | **Migration – budgets**: Add `owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`. Backfill: set from `projects.owner_id` where `budgets.project_id = projects.id`, or set to same legacy user for budgets with null `project_id`. Then set NOT NULL. Add index. |
| 13   | **Migration – budgets RLS**: Replace “authenticated” policy with `owner_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE.                                                                                                                                               |
| 14   | **createBudget** in `app/budgets/actions.ts`: Get current user after `requireAuth()` and set `owner_id: user.id` on insert.                                                                                                                                             |
| 15   | **TypeScript**: Add `owner_id` to `budgets` in types.                                                                                                                                                                                                                   |

`budget_categories` and `budget_items` are tied to a budget; if access to `budgets` is per-user, you can keep their RLS as “authenticated” **or** tighten to “only if the parent budget is owned by the user” (e.g. EXISTS subquery). Easiest: add RLS on `budget_categories` and `budget_items` that checks ownership via `budgets.owner_id` so everything is consistent.

### 5.5 Client-side and other routes

| Step | What to do                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16   | **Protected routes in middleware**: Extend the “protected path” list to include `/project`, `/ideas`, `/todo`, `/budgets` (and optionally `/dashboard/analytics`) so unauthenticated users are redirected to `/` before hitting the page. |
| 17   | **Existing client components**: No change needed for “list projects / tasks / budgets” – they use Supabase with the session; RLS will filter. Only **create** flows needed the explicit `owner_id` (projects and budgets).                |

---

## 6. Migration Order (to avoid breakage)

1. **Auth first**: Change `requireAuth()`, `signIn()`, middleware, and add signup. Deploy. Now multiple users can log in, but **projects/tasks/budgets are still shared** (same RLS as today). Good for testing signup/login.
2. **Projects**: Add `owner_id`, backfill, add RLS, update `createProject`. Deploy. Now new projects are per-user; existing ones can be assigned to a single “migration” user.
3. **Tasks**: New RLS. Deploy. Tasks become scoped by project ownership.
4. **Budgets**: Add `owner_id`, backfill, RLS, update `createBudget`. Deploy.

If you prefer a single “big bang” migration, you can do 2–4 in one migration and deploy after auth changes; the important part is that **existing rows get an owner** (e.g. backfill from one user id).

---

## 7. Summary Table

| Layer                        | Current                          | After changes                                   |
| ---------------------------- | -------------------------------- | ----------------------------------------------- |
| **Login**                    | Admin email only                 | Any user with password                          |
| **Signup**                   | None                             | New signup page + `signUp()`                    |
| **requireAuth**              | Redirect if not admin            | Redirect only if not logged in                  |
| **Middleware**               | Protects /dashboard, admin check | Protects all app routes, any authenticated user |
| **Projects**                 | No owner, shared                 | `owner_id`, RLS by `auth.uid()`                 |
| **Tasks**                    | No owner, shared                 | RLS by project ownership                        |
| **Budgets**                  | No owner, shared                 | `owner_id` (recommended), RLS by `auth.uid()`   |
| **Ideas / Todo / Favorites** | Already per-user                 | No change                                       |

This is the smallest set of changes to get to multi-user with signup and per-user projects, ideas, budgets, and todo, without refactoring the whole app.
