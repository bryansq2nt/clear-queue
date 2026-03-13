# Invite Access Profiles — Implementation Plan (revised)

> Written: 2026-03-13 · Revised: 2026-03-13
> Status: Ready for implementation
> Depends on: Teams Module Phases A–G (all complete)
> Supersedes: original draft (denylist-based, single-scope)

---

## 1. Executive Summary

The current invite flow assigns one of three system roles (Owner / Editor / Viewer). Inviters cannot choose which modules the invitee can access, cannot save named permission templates, and the accept flow is non-atomic. This phase adds:

1. **`accept_invite_atomic` RPC** — fixes the 3-sequential-write race condition in `acceptInvite`
2. **`project_access_profiles` table** — reusable named permission profiles; allowlist-first
3. **`user_project_access_grants` table** — records the effective module allowlist for each member
4. **Invite form redesign** — 2-step flow with profile picker and module preview
5. **Backward compatibility** — existing invites and members are unaffected

Three design decisions are resolved explicitly in this document:

- **§5** — allowlist-first, not denylist (with rationale)
- **§6** — project-scoped in Phase 1; org-scoped schema-ready but deferred
- **§8** — billings and copilot excluded from Phase 1 profiles due to incomplete RBAC coverage

The team/group concept is deferred. Access profiles are the prerequisite.

---

## 2. Why Teams/Groups Are Deferred

Teams require schema that does not yet exist:

| Required                                  | Status                       |
| ----------------------------------------- | ---------------------------- |
| `project_teams (id, project_id, name)`    | Missing                      |
| `project_team_members (team_id, user_id)` | Missing                      |
| Team assignment in invite flow            | Impossible without the above |
| Team display in member list               | Impossible without the above |

Access profiles solve the real user pain (inviters cannot configure module access) without team management complexity. When teams ship, they will reference a profile — teams are a grouping on top of profiles, not a replacement.

---

## 3. Why Access Profiles Are the Right Phase

The three system roles are coarse-grained. Common real-world needs:

- **Finance consultant** — needs Budgets; should not see Tasks, Notes, or media
- **External reviewer** — read-only on Tasks and Notes; no access to financial data
- **Developer** — full access to Tasks, Milestones, Documents; no Billing or Budget visibility

None of these map cleanly onto Editor or Viewer. "Editor" grants create/edit rights across everything, including financial data that should be confidential to that member.

Profiles layer a module allowlist on top of a base role. The base role determines what the member _can do_ inside a visible module (create, edit, delete). The allowlist determines which module tabs they _see at all_.

---

## 4. `acceptInvite` Atomicity Fix

### Current state (broken)

`acceptInvite` in `app/actions/teams.ts` performs three sequential writes:

```
1. upsert project_members (project_id, user_id)
2. insert user_role_assignments (user_id, role_id, project_id)
3. update project_invites → status = 'accepted', accepted_at = NOW()
```

If write 2 or 3 fails after write 1, the user is a project member with no role. The invite stays pending. On retry, write 1 silently no-ops (ON CONFLICT DO NOTHING), but write 2 may fail again — the member is permanently roleless.

### Fix: `accept_invite_atomic` RPC

All writes execute in one transaction. The RPC locks the invite row with `FOR UPDATE` to prevent double-accept races.

```sql
CREATE OR REPLACE FUNCTION public.accept_invite_atomic(
  p_token   TEXT,
  p_user_id UUID
) RETURNS UUID  -- project_id on success
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite  RECORD;
  v_profile RECORD;
  v_role    UUID;
BEGIN
  -- Lock invite row
  SELECT * INTO v_invite FROM project_invites
    WHERE token = p_token FOR UPDATE;

  IF NOT FOUND                     THEN RAISE EXCEPTION 'invite_not_found';   END IF;
  IF v_invite.status <> 'pending'  THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF v_invite.expires_at < NOW()   THEN RAISE EXCEPTION 'invite_expired';     END IF;

  -- Resolve effective role from profile (if set) or raw role_id
  v_role := v_invite.role_id;
  IF v_invite.profile_id IS NOT NULL THEN
    SELECT base_role_id INTO v_profile FROM project_access_profiles
      WHERE id = v_invite.profile_id;
    IF FOUND THEN v_role := v_profile.base_role_id; END IF;
  END IF;

  -- Add to project_members
  INSERT INTO project_members (project_id, user_id, invited_by)
    VALUES (v_invite.project_id, p_user_id, v_invite.invited_by)
    ON CONFLICT (project_id, user_id) DO NOTHING;

  -- Assign role
  INSERT INTO user_role_assignments (user_id, role_id, project_id, assigned_by)
    VALUES (p_user_id, v_role, v_invite.project_id, v_invite.invited_by)
    ON CONFLICT (user_id, role_id, project_id) DO NOTHING;

  -- Apply module allowlist from profile (only when profile has a restricted allowlist)
  IF v_invite.profile_id IS NOT NULL THEN
    SELECT allowed_modules INTO v_profile FROM project_access_profiles
      WHERE id = v_invite.profile_id;
    IF FOUND AND v_profile.allowed_modules IS NOT NULL THEN
      INSERT INTO user_project_access_grants (project_id, user_id, allowed_modules)
        VALUES (v_invite.project_id, p_user_id, v_profile.allowed_modules)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, updated_at = NOW();
    END IF;
  END IF;

  -- Mark accepted
  UPDATE project_invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = v_invite.id;

  RETURN v_invite.project_id;
END; $$;
```

---

## 5. Allowlist-First Design (not denylist)

### Why the original denylist was wrong

The first draft used a sparse JSONB denylist — `{ "billings": false, "budgets": false }` — where absence meant visible. This is the wrong mental model for an access control system.

**Problems with denylist:**

1. **New modules default to visible.** When a new module ships, every existing restricted profile silently gains access to it. A Finance profile created to show only Budgets would automatically start showing a new Contracts module, Approvals module, etc. The profile's scope expands without any action by the author.

2. **Opaque intent.** To understand what a Finance profile grants, you must compute the complement: "everything except the 10 things listed." As the module set grows, the denylist grows and intent becomes harder to read.

3. **Long denylists for narrow profiles.** A profile that grants access to 2 of 12 modules needs a 10-entry denylist instead of a 2-entry allowlist. The allowlist is both shorter and more explicit.

4. **"No overrides" ≠ "full access".** An empty denylist `{}` looks identical for both an Editor (full access by design) and a misconfigured restricted profile. The allowlist distinguishes these with `NULL` vs a non-empty array.

### The allowlist model

```
allowed_modules TEXT[]   -- NULL = unrestricted; array = explicit grant
```

- `NULL` — no module restrictions. All module tabs are visible. Used for Owner, Editor, Viewer system profiles and for members who accepted invites before this phase.
- `TEXT[]` (non-null) — explicit list of module keys. Only those tabs are shown. Any module key not in the array is hidden.

**When a new module ships:**

- Members with `allowed_modules IS NULL` see it automatically (correct: they have full access).
- Members with an explicit array do not see it until their profile is updated (correct: they should not gain access to new features implicitly).

### Two profile variants

| Variant          | `allowed_modules` | Used by                                                |
| ---------------- | ----------------- | ------------------------------------------------------ |
| **Unrestricted** | `NULL`            | Owner, Editor, Viewer — full access                    |
| **Restricted**   | `TEXT[]`          | Finance, Developer, External reviewer — explicit grant |

The invite form's "custom" option also produces a restricted profile (array of toggled-on modules).

### Effect on `user_project_access_grants`

The per-member table stores `allowed_modules TEXT[]` — also nullable.

- Row absent → member is unrestricted (backward compatible with pre-profile members)
- Row present, `allowed_modules IS NULL` → explicitly unrestricted (effectively the same)
- Row present, `allowed_modules IS NOT NULL` → restricted to that list

No row at all is the default for existing members. The tab bar queries this table; if no row exists, all tabs are shown.

### What `allowed_modules` is not

`allowed_modules` is a **UI navigation-visibility layer only**. It is not the canonical authorization source of truth and it does not replace server-side permission enforcement.

- It determines which tab-bar entries the member sees in the project navigation.
- It does **not** grant or deny permissions at the server level.
- If a member with `allowed_modules = ['board']` somehow calls `updateNote` directly — via a stale bookmark, a shared deep-link, or the API — the server action's `requireCan()` call and RLS policies are the actual gate. The profile has no bearing on that check.

The canonical authorization chain remains unchanged:

```
requireCan(userId, 'action.key', resource)
  → user_role_assignments → rbac_roles → rbac_role_module_actions
  → RLS (defense in depth)
```

Access profiles add a navigation filter on top of this chain. They cannot weaken it. Both layers are independently necessary and independently enforced: the profile controls what the UI shows; the role controls what the server permits.

---

## 6. Org-Scoped vs Project-Scoped Profiles

### The three possible scopes

| Scope                 | `project_id` | `org_id` | Description                                                           |
| --------------------- | ------------ | -------- | --------------------------------------------------------------------- |
| Global seeded default | NULL         | NULL     | Immutable; shipped by migrations; available to every project          |
| Project-scoped        | NOT NULL     | NULL     | Created by project owners for a specific project                      |
| Org-scoped            | NULL         | NOT NULL | Created at org level; reusable across all org projects — **deferred** |

### Why org-scoped is deferred

Org-scoped profiles require an org management interface. Users would need to navigate to org settings, create/edit profiles there, and have those profiles appear in every project's invite flow. That UI does not exist and is out of scope for this phase.

More importantly, the global seeded defaults (Finance, Developer, External reviewer) already fill the org-level role for Phase 1. They are available everywhere without any setup. Users who need org-specific variants can copy them to project-scope.

### Why the schema includes `org_id` now anyway

Adding `org_id` to the table after the fact requires a data migration and a schema revision. The column costs nothing to add now. The constraint `NOT (project_id IS NOT NULL AND org_id IS NOT NULL)` enforces mutual exclusivity. When org management ships, the column is already there.

### Phase 1 scoping rules

- The invite form shows: global seeded defaults + project-scoped profiles for the current project.
- Project owners can create project-scoped profiles (project_id = current project).
- No user can create or edit global seeded defaults (enforced by RLS: SELECT only on `project_id IS NULL AND org_id IS NULL` rows).
- No user can create org-scoped profiles via the UI (the column exists but no UI or server action surfaces it in Phase 1).

### Schema

```sql
CREATE TABLE public.project_access_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of (project_id, org_id) is NOT NULL, or both are NULL (global).
  project_id      UUID REFERENCES public.projects(id)      ON DELETE CASCADE,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  description     TEXT,
  base_role_id    UUID NOT NULL REFERENCES public.rbac_roles(id),

  -- NULL = unrestricted (all modules visible).
  -- Non-null = explicit allowlist; only listed module keys are shown.
  -- Only keys with full RBAC coverage are valid in Phase 1 (see §8).
  allowed_modules TEXT[],

  sort_order      INT NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_scope_exclusive
    CHECK (NOT (project_id IS NOT NULL AND org_id IS NOT NULL))
);
```

---

## 7. Seeded Default Profiles (Phase 1)

Seeded at migration time with `project_id = NULL, org_id = NULL` (global, immutable).

The Phase 1 safe module set has 10 keys. Billings and copilot are excluded (see §8).

| Name              | Base role      | `allowed_modules`                                        | Description                                         |
| ----------------- | -------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Owner             | project_owner  | `NULL`                                                   | Full access — unrestricted                          |
| Editor            | project_editor | `NULL`                                                   | Create and edit all content — **default selection** |
| Viewer            | project_viewer | `NULL`                                                   | Read-only access — unrestricted                     |
| Finance           | project_editor | `['budgets']`                                            | Budgets only, editor rights                         |
| External reviewer | project_viewer | `['board', 'notes', 'documents']`                        | Tasks/Notes/Docs, read-only                         |
| Developer         | project_editor | `['board', 'notes', 'documents', 'links', 'milestones']` | Dev workflow, editor rights                         |

**Known Phase 1 limitation on Finance:** The Finance profile restricts the 10 safe modules to only Budgets. However, Billings is outside the profile system in Phase 1, so all members — including those with the Finance profile — continue to see the Billing tab. This is documented and will be resolved in Phase 2 when the Billing RBAC gaps are patched (see §8).

---

## 8. Module Coverage and Phase 1 Inclusion

### The problem with partial RBAC coverage

A profile restricts which tabs are visible. But if a member navigates to a visible tab, the server actions behind it must enforce their role. If a server action lacks a `requireCan` call, a Viewer-role member can invoke write operations they should not have.

Including a partially gated module in the profile system creates a false guarantee: the profile UI implies "this member has restricted access to Billing" but the server allows them to perform ungated writes anyway.

**Decision: a module is only eligible for profile management when every write action in that module has a corresponding `requireCan` call.**

### Phase 1 — Safe (fully gated)

These 10 modules are eligible for use in profile `allowed_modules` arrays in Phase 1:

| Module key   | User-facing label | All writes gated? | Note                                         |
| ------------ | ----------------- | ----------------- | -------------------------------------------- |
| `board`      | Tasks             | ✅ Yes            | —                                            |
| `notes`      | Notes             | ✅ Yes            | `notes.update_content` is ungated; see below |
| `documents`  | Document Hub      | ✅ Yes            | —                                            |
| `media`      | Media             | ✅ Yes            | —                                            |
| `links`      | Links Vault       | ✅ Yes            | —                                            |
| `milestones` | Milestones        | ✅ Yes            | —                                            |
| `budgets`    | Budgets           | ✅ Yes            | —                                            |
| `ideas`      | Ideas             | ✅ Yes            | —                                            |
| `calendar`   | Calendar          | ✅ Yes            | —                                            |
| `todos`      | Todos             | ✅ Yes            | —                                            |

**Notes caveat — `notes.update_content`:** The action key is seeded but `updateNote` in `app/actions/notes.ts` only checks `notes.update_title`, not `notes.update_content`. A viewer-role member with Notes access could theoretically save content changes. This is low severity (the edit UI is not rendered for viewers), but it is documented. Notes is included in Phase 1 because the gap does not change behavior visible to the inviter and does not make the profile system unsafe.

### Phase 2 — Excluded until RBAC gaps are patched

These modules must NOT appear in `allowed_modules` arrays or the profile UI until the listed server actions have `requireCan` added:

**Billings (`billings`)**

| Missing call                               | File                      | Action                                           |
| ------------------------------------------ | ------------------------- | ------------------------------------------------ |
| `requireCan('billings.update_amount')`     | `app/actions/billings.ts` | `updateBilling` — amount field update            |
| `requireCan('billings.manage_categories')` | `app/actions/billings.ts` | `createBillingCategory`, `deleteBillingCategory` |

Once both are added, billings becomes eligible and the Finance profile can be updated to include `'billings'` in its allowlist.

**Copilot (`copilot`)**

| Missing call                             | File                                         | Action              |
| ---------------------------------------- | -------------------------------------------- | ------------------- |
| `requireCan('copilot.read_sessions')`    | `app/context/[projectId]/copilot/actions.ts` | list/read sessions  |
| `requireCan('copilot.read_proposals')`   | same                                         | list/read proposals |
| `requireCan('copilot.approve_proposal')` | same                                         | approve a proposal  |
| `requireCan('copilot.reject_proposal')`  | same                                         | reject a proposal   |
| `requireCan('copilot.bulk_approve')`     | same                                         | bulk approve        |
| `requireCan('copilot.bulk_reject')`      | same                                         | bulk reject         |
| `requireCan('copilot.undo_proposal')`    | same                                         | undo a proposal     |

Copilot has the most ungated actions. Until all 7 are gated, it must not be a profile-controlled module. Including it while ungated would give the invite UI the appearance of restricting copilot access while actually leaving all operations open.

### What "excluded" means for existing members

Excluding billings and copilot from the profile system does not change anything for existing members. Existing members have no `user_project_access_grants` row (`allowed_modules = NULL`) — they see all modules including billings and copilot. This is unchanged. The profile system starts controlling a module only when that module appears in a new invite's profile.

---

## 9. Per-Member Access Grant Table

```sql
CREATE TABLE public.user_project_access_grants (
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,

  -- NULL = unrestricted (equivalent to no row; kept for future admin override use)
  -- Non-null = explicit allowlist of visible module keys for this member/project pair
  allowed_modules TEXT[],

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (project_id, user_id)
);
```

Key decisions:

- Composite PK instead of surrogate UUID + UNIQUE. Simpler; the (project_id, user_id) pair is the natural identity.
- `allowed_modules IS NULL` is valid and means unrestricted. It allows the RPC to insert a row explicitly marking a member as unrestricted (useful for future admin overrides) without needing special-case handling in query logic.
- No row = unrestricted. The tab bar query does a LEFT JOIN; absent row is treated as `NULL` (unrestricted). Backward compatible with all existing members.

---

## 10. Invite Flow UX Redesign

### Step 1 — Email

```
Email:  [_______________________________]
[Cancel]                        [Next →]
```

### Step 2 — Access profile

```
Access profile:           Inviting: user@example.com

  ● Editor  (default)    Full access — all modules visible
  ○ Viewer               Read-only — all modules visible
  ○ Finance              Budgets only, editor rights
  ○ External reviewer    Tasks / Notes / Documents — read-only
  ○ Developer            Tasks / Milestones / Documents / Notes / Links
  ○ Custom...            Configure modules manually

  Preview (Editor):
  ✓ Tasks  ✓ Notes  ✓ Documents  ✓ Media  ✓ Links
  ✓ Milestones  ✓ Budgets  ✓ Ideas  ✓ Calendar  ✓ Todos

[← Back]                [Generate invite link]
```

The preview shows only the 10 Phase 1 modules. Billings and copilot appear outside the profile system — they are always shown in the project nav for all members in Phase 1 and are noted as "not configurable" in the UI.

### Custom configuration panel

When "Custom" is selected:

```
Base role:   [Editor ▼]

Modules:
☑ Tasks      ☑ Notes      ☑ Documents  ☑ Media
☑ Links      ☑ Milestones ☑ Budgets    ☑ Ideas
☑ Calendar   ☑ Todos

Note: Billing and Copilot are not configurable in this version.
```

### Custom profile validation rule

Before a custom profile can be submitted — and before a project-scoped profile can be saved — the following rule must be enforced at both the UX layer (disable submit + explain) and the server action layer (return `{ error }` without writing):

**Each module in `allowed_modules` must have at least one action key granted by the chosen base role.**

Rationale: if a member is restricted to a module that their role grants nothing in, the tab appears but is completely inert — they cannot read, create, or do anything. This is confusing and almost certainly a misconfiguration.

| Scenario                                                               | Valid? | Reason                                                       |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| `board` selected, base role = `project_editor`                         | ✅     | editor holds `tasks.create`, `tasks.update_status`, etc.     |
| `board` selected, base role = `project_viewer`                         | ✅     | viewer holds `tasks.read` — correct for an external reviewer |
| Any module selected, hypothetical role with zero grants in that module | ❌     | tab visible, nothing actionable — reject with explanation    |

**UX implementation:** before the "Generate invite link" button becomes active, compute which modules have at least one matching action key granted to the chosen base role. Disable any module toggle whose module has no grants under that role and show a tooltip ("This role has no permissions in [module]."). The check can be done client-side from the role's known action keys without an extra network call.

**Server action implementation:** when creating or updating a profile, the server action fetches granted action keys for the `base_role_id` from `rbac_role_module_actions` (one query), then verifies that each key in `allowed_modules` has at least one entry whose `action_key` starts with `moduleKey + '.'`. If any module fails this check, return `{ error: 'role_has_no_actions_in_module', moduleKey }` without writing.

### Pending invite display

- With profile: shows profile name badge (e.g. "Finance", "Developer")
- Without profile (old invites): shows role badge as before ("Editor", "Viewer")

---

## 11. Implementation Sequence

Each step is independently reviewable.

### Step 1 — Migration

File: `supabase/migrations/20260313100000_invite_access_profiles.sql`

- `project_access_profiles` table (schema in §6)
- `user_project_access_grants` table (schema in §9)
- `profile_id UUID` column on `project_invites` (ON DELETE SET NULL)
- `accept_invite_atomic` RPC (body in §4)
- RLS on both tables (details in §12)
- Seeded default profiles (6 rows, §7)
- Indexes and `updated_at` triggers

### Step 2 — `listProjectAccessProfiles` server action

File: `app/actions/teams.ts`

- Returns global defaults + project-scoped profiles for the given project
- Ordered by `sort_order`
- Wrapped in React `cache()`

### Step 3 — Update `inviteProjectMember`

File: `app/actions/teams.ts`

- Accept optional `profileId?: string` as 4th param
- Store on `project_invites.profile_id` when provided
- Existing callers that omit `profileId` are unchanged (`profile_id = NULL`)

### Step 4 — Refactor `acceptInvite`

File: `app/actions/teams.ts`

- Replace 3-write body with `supabase.rpc('accept_invite_atomic', { p_token, p_user_id })`
- Map RPC exception strings (`invite_not_found`, `invite_not_pending`, `invite_expired`) to user-facing error messages
- Retain audit log and `revalidatePath` calls

### Step 5 — Update `ContextTeamFromCache`

File: `app/context/[projectId]/team/ContextTeamFromCache.tsx`

- Add `listProjectAccessProfiles(projectId)` to the `Promise.all` on load
- Pass `profiles` prop to `ContextTeamClient`

### Step 6 — Redesign invite form

File: `app/context/[projectId]/team/ContextTeamClient.tsx`

- 2-step form: email → profile picker
- Profile cards with allowlist preview (show checked/unchecked for all 10 safe modules)
- Custom panel with module toggles (10 safe modules only) + base role select
- Pass `profileId` or fallback `roleId` to `inviteProjectMember`

### Step 7 — Update `listPendingInvites`

File: `app/actions/teams.ts`

- Join `project_access_profiles(name)` in query
- Add `profile_name: string | null` to `ProjectInvite` type

### Step 8 — Update `getInviteByToken`

File: `app/actions/teams.ts`

- Join `project_access_profiles(name, allowed_modules)` in query
- Add `profile_name` and `allowed_modules` to returned shape

### Step 9 — Update pending invite display

File: `app/context/[projectId]/team/ContextTeamClient.tsx`

- Show profile name badge when `profile_name` is set; fall back to role badge

### Step 10 — Update accept page

File: `app/invite/[token]/page.tsx`

- When invite has a profile with a non-null `allowed_modules`, show a compact module list so the invitee can see what they're joining with

### Step 11 — i18n keys

Files: `locales/en.json`, `locales/es.json`

- Profile picker labels, module list labels, custom config, Phase 1 limitation notice

---

## 12. Migration and Compatibility Notes

### Existing invite records

All existing rows have `profile_id = NULL`. The RPC uses `role_id` directly when `profile_id IS NULL` — identical to the old behavior.

### Existing accepted invites

Members accepted before this phase have no `user_project_access_grants` row. Absence = unrestricted. No change to their experience.

### `acceptInvite` signature is unchanged

The server action still takes `token: string`. The invite page requires no changes.

### Global seeded profile immutability

RLS on `project_access_profiles` allows SELECT on rows where `project_id IS NULL AND org_id IS NULL` for any authenticated user. INSERT/UPDATE/DELETE on those rows is never permitted via RLS — only migration-time inserts can create or modify them.

### RLS: `project_access_profiles`

```
SELECT: (project_id IS NULL AND org_id IS NULL)             -- global: anyone authenticated
     OR is_project_member(project_id)                       -- project-scoped: project members
     OR is_org_member(org_id)                               -- org-scoped: org members (future)

INSERT: project_id IS NOT NULL AND is_project_member(project_id)   -- floor only; see below
UPDATE: project_id IS NOT NULL AND is_project_member(project_id)   -- floor only; see below
DELETE: project_id IS NOT NULL AND is_project_member(project_id)   -- floor only; see below
```

**Application-layer guard on profile writes (required).** The RLS above permits any project member to mutate project-scoped profiles. That is too broad — a Viewer-role member should not be able to create, rename, or delete access profiles. RLS is the floor; the server action is the meaningful gate.

Every server action that performs an INSERT, UPDATE, or DELETE on `project_access_profiles` must call:

```ts
await requireCan(user.id, 'teams.invite_project_member', {
  type: 'project',
  projectId,
});
```

`project_owner` and `project_editor` roles hold `teams.invite_project_member`; `project_viewer` does not. This restricts profile management to users with invite authority, which is the right boundary: if you can invite someone with a profile, you can manage the profiles used for inviting.

RLS remains defense-in-depth. A direct DB call that bypasses the server action is still blocked by the RLS membership check. The `requireCan` call adds the role-level check that RLS alone cannot express.

### RLS: `user_project_access_grants`

```
SELECT: user_id = auth.uid() OR is_project_member(project_id)
INSERT: is_project_member(project_id)   -- only via accept_invite_atomic RPC in practice
UPDATE: is_project_member(project_id)
DELETE: is_project_member(project_id)
```

---

## 13. Phase 2 Checklist (gates for billings and copilot)

Before billings is added to the profile system:

- [ ] Add `requireCan(user.id, 'billings.update_amount', ...)` to `updateBilling` in `app/actions/billings.ts`
- [ ] Add `requireCan(user.id, 'billings.manage_categories', ...)` to `createBillingCategory` and `deleteBillingCategory`
- [ ] Add `'billings'` to the `ALL_MODULES` constant in `ContextTeamClient.tsx`
- [ ] Update the Finance seeded profile `allowed_modules` to include `'billings'`

Before copilot is added:

- [ ] Add `requireCan` for `copilot.read_sessions` and `copilot.read_proposals` to list/read actions
- [ ] Add `requireCan` for `copilot.approve_proposal`, `copilot.reject_proposal` to approve/reject
- [ ] Add `requireCan` for `copilot.bulk_approve`, `copilot.bulk_reject` to bulk actions
- [ ] Add `requireCan` for `copilot.undo_proposal` to undo
- [ ] All 7 added → add `'copilot'` to `ALL_MODULES`

None of these changes require a schema migration. They are server action additions only.
