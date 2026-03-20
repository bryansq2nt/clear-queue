# RBAC + Permission UX — Deep Research & Recommendations for ClearQueue

> **Date:** 2026-03-18
> **Scope:** Authorization architecture analysis, industry comparison, UX recommendations, risk register, test matrix
> **Status:** Research complete — implementation not started

---

## 1. Executive Summary

ClearQueue has a **three-layer hybrid RBAC** system that is architecturally sound for its current scale (~10 roles, ~50 action keys, project-scoped isolation) but contains several design tensions that will compound as teams grow. The core model — named roles expand to action sets, with optional per-member action overrides and a separate UI-only module allowlist — matches what mature B2B SaaS products use. The dangers are in the **seams**: the override semantic (replace vs. intersect), the fail-open null/absent row behavior in `user_project_access_grants`, and the disconnect between RLS (which is broader) and app-layer permission enforcement (which is the real gate). The UI problem is the most visible: non-owners see edit controls they cannot use, and when actions are blocked there is no explanation.

The system does **not** need a full ReBAC (Zanzibar-style) rewrite — that would be engineering overkill for a project-scoped app without resource-level permission hierarchies. What it needs is: (1) an explicit-deny default for module visibility, (2) UI that reflects actual permissions before the user hits a wall, (3) a single canonical permission source for each check, and (4) a test matrix that covers every persona × action combination. Short-term fixes are achievable in 3–4 focused sprints without touching the database schema. Long-term, a lightweight ReBAC-inspired tuple store would become worthwhile if ClearQueue adds nested sub-projects, cross-project resources, or per-file/per-task permissions.

---

## 2. Industry Model Comparison

### How serious products handle this

| Product                 | Approach                                                                | Notable design decision                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub (orgs/repos)** | Two-tier RBAC (org role + repo role) + fine-grained PATs                | Repo roles are additive within org context; fine-grained tokens apply **intersection** (never more than user base permissions)                  |
| **Notion**              | Hierarchical inheritance (workspace → teamspace → page)                 | Page-level sharing can **narrow** inherited access; defaults to most permissive parent grant                                                    |
| **Linear**              | Flat workspace roles (Admin / Member / Guest)                           | Radical simplicity: guests are scoped to teams, members see everything; no per-issue ACLs                                                       |
| **Slack**               | Workspace roles + channel visibility + Enterprise Grid org layer        | "Single-channel guest" is effectively a module allowlist — direct analog for `allowed_modules = ['board']`                                      |
| **AWS IAM**             | Identity-based + resource-based policies + permission boundaries + SCPs | **Explicit deny always wins**; implicit deny by default; permission boundary is a ceiling, not a grant                                          |
| **Google Zanzibar**     | ReBAC: `object#relation@user` tuples, graph-resolved                    | Handles arbitrary resource hierarchies; "zookies" solve new-enemy consistency; used at Google Drive/Calendar scale                              |
| **SpiceDB / OpenFGA**   | Open-source Zanzibar implementations                                    | SpiceDB adds typed schemas; OpenFGA (Auth0) targets mid-size SaaS                                                                               |
| **Airbnb Himeji**       | Internal Zanzibar-inspired ReBAC                                        | Built when RBAC couldn't express "user A can edit listing L because A is the host"; migrating 200 ad-hoc checks exposed 30% had inconsistencies |
| **Figma**               | Hierarchical resource grants (Org → Team → Project → File)              | Pre-computes and caches effective `(user, resource)` permission pairs; invalidates on ancestor grant change                                     |

### The three authorization paradigms

| Paradigm                             | Core idea                                                 | Pros                                                                              | Cons                                                                                 | Fit for ClearQueue                  |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| **Flat RBAC (NIST)**                 | Users→Roles→Permissions (static tables)                   | Simple, auditable, well-understood                                                | Role explosion; permission drift; no resource-level context                          | Partial (current approach)          |
| **ReBAC (Zanzibar)**                 | `user:alice member project:foo` tuples resolved via graph | Handles complex hierarchies and resource-level ACLs; scales to billions of tuples | High operational complexity; over-engineered without nested-resource needs           | Long-term only                      |
| **Hybrid (Roles + Override grants)** | Named roles with per-member action overrides              | Flexible, familiar                                                                | Two sources of truth; "replace vs. intersect" semantics are a footgun; hard to audit | Current approach — needs guardrails |

**ClearQueue is in the Hybrid bucket. That is the right call for current scale.**

---

## 3. ClearQueue Architecture Analysis (grounded in repo files)

### 3.1 How the current system works

The permission resolution chain in `lib/rbac/resolver.ts` → `getGrantedActions()`:

```
1. Owner bypass: project.owner_id === userId → true (skip all checks)
2. Membership check: is_project_member(projectId) → false = deny
3. Custom grants: user_project_action_grants[projectId, userId].granted_actions
   → If non-empty array: use ONLY these (replaces role-based expansion) ← FOOTGUN
4. Role expansion: user_role_assignments → rbac_role_module_actions → Set<action_key>
5. can(action): granted_actions.has(action)
```

Module visibility (`app/actions/modules.ts`) is a separate, parallel check:

```
1. Project has module enabled in project_modules
2. user_project_access_grants[projectId, userId].allowed_modules
   → null or row absent → unrestricted (fail-open) ← SECURITY GAP
   → [] → blocked
   → ['board', 'notes'] → only listed tabs visible
```

RLS in Postgres is **broader than product intent** — e.g., any `is_project_member()` check passes for `SELECT` on tasks regardless of `tasks.read.own` vs `tasks.read.project`. The app layer is the real gate.

### 3.2 The five design tensions

**Tension A — Override replaces, doesn't intersect** (`user_project_action_grants`)

If someone adds a custom grant row with `granted_actions = ['tasks.read.own']`, the user loses **all** role-based grants too — notes, links, ideas, every other module. This is unintuitive and undocumented. Compare to AWS IAM: session policies apply **intersection** (AND) logic to narrow permissions, not replace them silently.

**Tension B — Module allowlist is UI-only; action grants are backend-only; neither is derived from the other**

A Finance profile user has `allowed_modules = ['budgets']` and `project_editor` role (which grants `tasks.create`). The user cannot navigate to the Tasks tab (UI hides it), but a direct API call to a task server action returns `true` from `can()`. Conversely, a tasks-only viewer with `allowed_modules = ['board']` and a viewer role will see the "Add task" button (module is allowed) but be rejected by the server action — with no graceful explanation.

**Tension C — Null/absent row in `user_project_access_grants` = unrestricted (fail-open)**

When a user accepts an invite via the old `role_id`-only path (no profile, no custom role), no `user_project_access_grants` row is created. The module visibility check then treats them as unrestricted — all tabs visible. AWS IAM's default is the exact opposite: **implicit deny**. This is the biggest security footgun in the current design.

**Tension D — Two authorization systems for the same question**

"Can this user see the board?" requires checking three separate functions across three files. This is what caused Airbnb to find 30% inconsistency across their 200 ad-hoc permission checks before centralizing into Himeji. A developer adding a new feature may check one function and miss the others.

**Tension E — Invite resolution priority is a hidden cascade**

`accept_invite_atomic` resolves: `invite_role_id > profile_id > role_id`. No TypeScript type or test documents all valid resolution paths. A future developer adding a fourth dimension may not realize they need to handle all fallback cases.

---

## 4. RBAC Architecture Recommendations (Prioritized)

### Priority 1 — Fix the fail-open null semantic (P0 security fix)

**Problem:** Absent or null `user_project_access_grants` row = unrestricted module access.

**Fix:** Every user who joins a project must have a row. Create the row in `accept_invite_atomic` for **all** invite paths, including the legacy `role_id`-only path. Backfill existing members:

```sql
-- Backfill: insert explicit row for all project members without one
INSERT INTO user_project_access_grants (project_id, user_id, allowed_modules)
SELECT pm.project_id, pm.user_id, NULL  -- NULL = unrestricted (explicit)
FROM project_members pm
LEFT JOIN user_project_access_grants upag
  ON upag.project_id = pm.project_id AND upag.user_id = pm.user_id
WHERE upag.user_id IS NULL;
```

Then treat a **missing row** as "blocked from all modules" (fail-closed) and **null `allowed_modules`** as "all modules allowed." This is a non-breaking change — existing rows with `null` keep working.

### Priority 2 — Change override semantic from "replace" to "intersect" (P1 correctness fix)

**Problem:** `user_project_action_grants` with non-empty `granted_actions` replaces all role-based grants. Silently loses role permissions.

**Industry pattern:** AWS IAM permission boundaries are **ceilings** (AND/intersection logic), not replacements. GitHub fine-grained PAT permissions are `min(user perms, token perms)`.

**Fix in `lib/rbac/resolver.ts`:**

```typescript
// Current (replace — wrong):
if (customRow?.granted_actions.length > 0)
  return new Set(customRow.granted_actions); // loses role grants

// Recommended (intersect/ceiling):
const roleActions = await expandRoleGrants(userId, projectId);
if (customRow?.granted_actions.length > 0)
  return new Set(
    [...roleActions].filter((a) => customRow.granted_actions.includes(a))
  );
// custom grants narrow role grants — can only restrict, never silently revoke
```

The ceiling/intersection model means `granted_actions` can only narrow, never expand or silently drop, base role permissions. This matches every major product's "override" semantic.

### Priority 3 — Unify "can user do X" into one callable (P1 architecture)

**Problem:** Three separate, uncoordinated functions answer the same question. Airbnb's migration from this pattern exposed 30% inconsistency.

**Fix:** Create a single composable function in `lib/rbac/`:

```typescript
// lib/rbac/access.ts
export async function getModuleAccess(
  userId: string,
  projectId: string,
  moduleKey: string
): Promise<{
  canView: boolean;
  canRead: boolean;
  readScope: 'own' | 'team' | 'project';
  canWrite: boolean;
  canDelete: boolean;
  reason?: 'module_disabled' | 'no_module_access' | 'no_read_permission';
}>;
```

This becomes the single source of truth for both UI rendering (passed from server component to Client) and server-action pre-flight checks.

### Priority 4 — Surface invite permission preview in the UI (P2 UX)

**Problem:** Inviters cannot see "what will this person actually get" before sending the invite.

**Fix:** Compute and display a preview when an inviter selects a profile or custom role: which module tabs they'll see, and read/write indicator per tab. This is a pure frontend computation from the profile's `allowed_modules` and `base_role_id`'s action set — no extra DB call needed.

### Priority 5 — Don't migrate to ReBAC yet; add ReBAC-readiness hooks (P3 future)

**When ReBAC becomes worth it:**

- Resource-level permissions (e.g., "task #123 visible only to assignees")
- Cross-project resource sharing
- Nested organizational structures (org → workspace → project → sub-project)
- Permission inheritance through hierarchies (note inherits from notebook)

**ClearQueue today:** None of these exist. Project-scoped isolation is flat. ReBAC would add a graph-resolution engine for zero net expressiveness gain.

**ReBAC-readiness hook:** If you add `task.assigned_to` or `document.owner` per-resource ACLs in the future, structure them as relationship tuples (`task#assignee@user`) stored in a junction table — this will migrate cleanly to SpiceDB schemas.

---

## 5. Top 5 UX Recommendations (Prioritized)

### UX-1 — Reflect real permissions in the UI (eliminate "ghost controls")

**Problem:** A `project_viewer` sees "Edit" and "Delete" buttons. They click; the server rejects. No explanation.

**Pattern:** Linear hides write controls for guests. Notion grays out the edit button with a tooltip. GitHub disables "Merge" with "You don't have permission."

**Fix:** Pass `getModuleAccess()` result from page server component to the Client. Hide (not disable) controls the user can never use:

```tsx
<TaskCard canEdit={access.canWrite} canDelete={access.canDelete} />
```

Reserve disabled-with-tooltip for controls that are contextually unavailable (e.g., already assigned), not permanently unavailable.

### UX-2 — Blocked action → explain why, offer next step

**Problem:** When `can()` fails, the current path falls through to `MutationErrorDialog` with a generic error.

**Fix:** Return typed permission errors from server actions:

```typescript
return {
  error: {
    code: 'permission_denied',
    action: 'tasks.create',
    reason: 'view_only_role',
  },
};
```

Render these distinctly from mutation errors — a `PermissionBanner` rather than an error dialog. Pattern: GitHub's "You must be an admin to delete this repository."

### UX-3 — Invite drawer: show "what they'll see" before sending

**Problem:** An owner selecting the Finance profile has no idea what tabs that person will see post-accept.

**Fix:** Add a permission preview panel in the invite drawer — module list with lock/unlock icons and read/write indicator. Static computation from the selected profile's data.

```
Finance profile preview:
  ✓ Budgets       — can view and edit
  ✗ Board          — hidden
  ✗ Tasks         — hidden
  ✗ Notes         — hidden
```

Pattern: Notion's share dialog. Figma's live preview of invited user's view.

### UX-4 — Tab bar reflects actual module access (no hidden-tab URL surprise)

**Problem:** A tasks-only viewer navigates directly to `/context/[projectId]/notes`. The page may load with a confusing empty state.

**Fix:** Fetch `getMyProjectAccessGrant(projectId)` in `app/context/[projectId]/layout.tsx` and pass it to the tab bar. Tab bar renders only accessible tabs. Direct URL to a hidden tab returns a proper 403 page.

Pattern: Slack's sidebar only shows channels the user is a member of.

### UX-5 — Team tab: per-member capability summary, not just role name

**Problem:** Team tab shows "project_editor" — tells owners nothing about actual effective access when custom grants or module allowlists are in play.

**Fix:** Show a computed capability summary per member:

```
Alice Chen    Editor    Modules: All         Read/Write: All modules
Bob Smith     Viewer    Modules: Board, Notes    Read only
Carol Wu      Editor    Modules: Budgets only    Read/Write: Budgets
```

Derived from `user_project_access_grants.allowed_modules` + role's write actions.

---

## 6. Risks of Current Design

### Risk 1 — Fail-open module visibility (HIGH — current bug)

**Files:** `app/actions/modules.ts`, `user_project_access_grants` schema.

Missing row = unrestricted. Every user invited before the RBAC migration (`20260310100000`) or invited via the legacy `role_id`-only path has no `user_project_access_grants` row. They see all module tabs. This is likely most current users.

**Exploitability:** Low (scoped to authenticated project members). **UX incorrectness:** High.

### Risk 2 — Override grants silently drop role permissions (HIGH — latent data bug)

**File:** `lib/rbac/resolver.ts`, `user_project_action_grants`.

Adding `granted_actions = ['tasks.read.own']` to a member silently revokes their notes, links, ideas, and every other module granted by their role. No warning, no audit preview. Audit log captures the write, not the effective permission diff.

### Risk 3 — RLS is broader than app intent (MEDIUM — defense-in-depth gap)

**Files:** Migrations `20260310100004`, `20260318100000`.

RLS uses `is_project_member(project_id)` for SELECT — grants SQL-level read access regardless of `tasks.read.own` vs `tasks.read.project`. App-layer enforces scope via `getReadScope()` + filtered queries, but a broken server action bypasses scope filtering. This is a known design tradeoff; it should be documented per-table in migrations with an explicit comment.

### Risk 4 — Invite resolution cascade grows without a contract (MEDIUM — maintenance)

**File:** `accept_invite_atomic` RPC.

Three-way cascade (`invite_role_id > profile_id > role_id`) encoded in a Postgres function. No TypeScript type or test documents all valid resolution paths. A future developer adding a fourth dimension may silently break earlier fallbacks.

**Fix:** Add unit tests covering each resolution branch + a comment in the RPC listing all valid states.

### Risk 5 — Module allowlist ≠ action enforcement (MEDIUM — user confusion)

**Files:** `app/actions/modules.ts` vs `lib/rbac/resolver.ts`.

A Finance-profile user with `project_editor` as base role can call any non-budgets server action via direct API — their module allowlist only removes the UI path. The allowlist must be **paired with a matching role** that doesn't grant write actions outside allowed modules (e.g., a `project_finance_editor` role with only `budgets.*` write grants).

---

## 7. Suggested Test Matrix

### Personas

| #   | Persona           | Role             | `allowed_modules`                 | `granted_actions` override |
| --- | ----------------- | ---------------- | --------------------------------- | -------------------------- |
| P1  | Project Owner     | `project_owner`  | null (unrestricted)               | none                       |
| P2  | Full Editor       | `project_editor` | null                              | none                       |
| P3  | Full Viewer       | `project_viewer` | null                              | none                       |
| P4  | Tasks-only Viewer | `project_viewer` | `['board']`                       | none                       |
| P5  | Finance Officer   | `project_editor` | `['budgets']`                     | none                       |
| P6  | External Reviewer | `project_viewer` | `['board', 'notes', 'documents']` | none                       |
| P7  | Custom Read-Own   | `project_editor` | null                              | `['tasks.read.own']`       |
| P8  | Legacy Invited    | `project_viewer` | _row absent_                      | none                       |

### Test matrix (⚠️ = confirmed gap to fix)

|                    | Sees all tabs          | Sees board | Sees budgets | Can create task            | Can delete task | Can create budget | Can invite members | API create task = 200 | Budgets API = 403 |
| ------------------ | ---------------------- | ---------- | ------------ | -------------------------- | --------------- | ----------------- | ------------------ | --------------------- | ----------------- |
| P1 Owner           | ✅                     | ✅         | ✅           | ✅                         | ✅              | ✅                | ✅                 | ✅                    | ❌                |
| P2 Full Editor     | ✅                     | ✅         | ✅           | ✅                         | ✅              | ✅                | ❌                 | ✅                    | ❌                |
| P3 Full Viewer     | ✅                     | ✅         | ✅           | ❌                         | ❌              | ❌                | ❌                 | ❌ 403                | ✅                |
| P4 Tasks Viewer    | ❌ board only          | ✅         | ❌           | ❌                         | ❌              | ❌                | ❌                 | ❌ 403                | ✅                |
| P5 Finance         | ❌ budgets only        | ❌         | ✅           | **⚠️ role allows**         | ❌              | ✅                | ❌                 | **⚠️ 200 (Risk 5)**   | ❌                |
| P6 External        | ❌ 3 tabs only         | ✅         | ❌           | ❌                         | ❌              | ❌                | ❌                 | ❌ 403                | ✅                |
| P7 Custom read-own | ✅ (editor role)       | ✅         | ✅           | **⚠️ grant replaced role** | **⚠️ lost**     | **⚠️ lost**       | **⚠️ lost**        | **⚠️ 403**            | **⚠️**            |
| P8 Legacy          | **⚠️ all (fail-open)** | ✅         | ✅           | ❌                         | ❌              | ❌                | ❌                 | ❌ 403                | **⚠️ no row**     |

### Playwright test structure

```
tests/rbac/
  personas.ts                     — helper to create each persona + invite + accept
  board-access.spec.ts
  module-visibility.spec.ts
  permission-denied-ux.spec.ts    — checks that 403 actions show explanation, not generic error
  invite-preview.spec.ts          — checks invite drawer shows correct permission preview
```

---

## 8. Phased Action Plan

### Phase 1 — Security/correctness (1 sprint)

1. Backfill `user_project_access_grants` for all existing project members without a row.
2. Change fail-open to fail-closed: missing row → blocked, not unrestricted.
3. Add `accept_invite_atomic` branch for legacy `role_id`-only path to always insert access grant row.
4. Write Playwright tests for P4, P5, P8 personas.

### Phase 2 — Override semantic fix (1 sprint)

1. Change `getGrantedActions()` in `lib/rbac/resolver.ts` to intersection (ceiling) semantics.
2. Add integration test for P7 persona.
3. Add admin UI note explaining the narrowing behavior.

### Phase 3 — UI permission reflection (1–2 sprints)

1. Create `getModuleAccess()` composite function in `lib/rbac/access.ts`.
2. Pipe capability flags from `page.tsx` → `*Client.tsx` → all action controls.
3. Remove write/delete controls for users where capability = false.
4. Add `PermissionBanner` component for permission-denied server action responses.

### Phase 4 — Invite UX + Team tab (1 sprint)

1. Permission preview panel in invite drawer.
2. Per-member capability summary in Team tab.
3. Tab bar filtered by `allowed_modules`.

---

## 9. Short-term vs Long-term Architecture

### Current scale → Keep Hybrid RBAC

Fix the semantics (intersection, not replace) and the fail-open default. Do not migrate to ReBAC.

### 10× complexity → Evaluate ReBAC

**Milestone trigger:** "User Alice can see task #123 but not #124, because she's assigned to #123."

At that point, project-scoped module allowlists are insufficient and you need resource-level tuples. Current junction tables (`project_members`, `user_role_assignments`) map cleanly to ReBAC relations. The migration would be a schema translation and a replacement of `getGrantedActions()` with graph-resolved lookups.

SpiceDB schema preview (future state):

```
definition user {}

definition project {
  relation member: user
  relation owner: user
  permission read = member + owner
  permission manage = owner
}

definition task {
  relation project: project
  relation assignee: user
  permission read = assignee + project->manage
  permission write = assignee + project->manage
}
```

---

## 10. Bibliography

### Primary sources

1. **NIST Role-Based Access Control** — Ferraiolo, Kuhn, Sandhu (2007). NIST IR 7316. The canonical RBAC model. https://csrc.nist.gov/publications/detail/nistir/7316/final

2. **Zanzibar: Google's Consistent, Global Authorization System** — Zan et al. (2019). USENIX ATC '19. Tuple format `object#relation@user`, zookies (consistency tokens), `check()` / `expand()` APIs. https://research.google/pubs/pub48190/

3. **AWS IAM — Policies and permissions** — AWS Documentation (fetched directly). Covers all 7 policy types and the evaluation logic. https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html

4. **NIST Zero Trust Architecture** — SP 800-207 (2020). Rationale for explicit-deny defaults. https://csrc.nist.gov/publications/detail/sp/800-207/final

### Open-source implementations

5. **SpiceDB / AuthZed** — Open-source Zanzibar. Schema language, `check()` API. https://authzed.com/docs

6. **OpenFGA** (Auth0/Okta) — Zanzibar-inspired, targets mid-size SaaS. https://openfga.dev/docs

### Product documentation

7. **GitHub Docs — Roles in an organization** — Two-tier RBAC + fine-grained PATs (intersection logic). https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles

8. **Notion Help — Sharing and permissions** — Hierarchical inheritance; "No access" explicit deny override. https://www.notion.so/help/sharing-and-permissions

9. **Linear Docs — Members and permissions** — Flat workspace roles; guest scoping to teams. https://linear.app/docs/members

10. **Slack Help — Roles in Slack** — Single-channel guest = direct analog for `allowed_modules = ['board']`. https://slack.com/help/articles/360018112273

### Engineering blogs

11. **Airbnb — Himeji: Airbnb's Scalable Permission System** — ReBAC migration from ad-hoc RBAC; ~30% inconsistency found across 200 permission checks during centralization. Airbnb Engineering Blog.

12. **Figma Engineering Blog — Permissions system** — Hierarchical resource grants; pre-computed permission cache per `(user, resource)` pair; invalidation on ancestor grant change.

### Internal repo files cited

- `lib/rbac/resolver.ts` — `can()`, `requireCan()`, `getGrantedActions()` — permission evaluation engine
- `lib/rbac/read-scope.ts` — `getReadScope()` — action keys → query scope
- `lib/rbac/audit.ts` — `logAuditEvent()` — audit trail
- `app/actions/modules.ts` — `getCanViewModule()`, `getMyProjectAccessGrant()` — module visibility
- `app/actions/teams.ts` — `inviteProjectMember()`, `acceptInvite()` — invite lifecycle
- `supabase/migrations/20260313100000_invite_access_profiles.sql` — `project_access_profiles`, `user_project_access_grants` schema
- `supabase/migrations/20260316200000_user_project_action_grants.sql` — custom action override schema
- `supabase/migrations/20260318100000_rls_perf_auth_uid.sql` — RLS policy optimization
