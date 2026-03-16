# Teams Module & RBAC — Manual Testing Guide

**Created:** 2026-03-16
**Purpose:** Structured test plan covering every feature built across the Teams Module and RBAC architecture. Work through each section in order — later sections depend on earlier ones.

---

## Setup: You Need Three Browser Profiles

Most scenarios require 2–3 distinct logged-in users. The easiest way:

- **Browser A / User A** — the **project owner** (your main account)
- **Browser B / User B** — a **project member** (second account, e.g. a test Gmail)
- **Browser C / User C** — a **third user** to test restricted access

Keep all three open at the same time so you can observe what each user sees.

---

## Section 1 — Project Creation & Module Setup

### What was built

- `create_project_atomic` RPC: creates project + org assignment + initial role in one transaction
- `projects.toggle_module` permission: only the project owner can enable/disable modules
- Quota enforcement: free plan allows max 3 projects per org

### Test 1.1 — Create a project (User A)

1. Log in as User A
2. Click "New project" (or equivalent)
3. Fill in name and any optional fields
4. Submit

**Verify:**

- Project appears in the sidebar/project list
- You are automatically the project owner
- All modules are visible (board, notes, links, ideas, budgets, billings, calendar, todos, documents, media, milestones, copilot)

### Test 1.2 — Enable/disable modules (User A)

1. Open the project you just created
2. Go to **Settings** (gear icon, or via the project settings drawer)
3. Find the module toggle list (ProjectModulesSettingsView)
4. Disable one module (e.g., Billing)
5. Navigate to the project

**Verify:**

- The disabled module's tab is no longer visible in the tab bar
- Re-enable it and it reappears

### Test 1.3 — Module visibility for members (test later after inviting)

Skip for now, return after Section 3.

---

## Section 2 — Understanding Roles and Permissions

Before testing, understand the role hierarchy:

| Role              | Who has it                       | What they can do                                                                       |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| `project_owner`   | The user who created the project | Everything. Manage members, delete project, toggle modules                             |
| `project_editor`  | Invited editors                  | Create/edit/delete content in all modules. Cannot manage members or delete the project |
| `project_viewer`  | Invited viewers                  | Read-only. Cannot create, edit, or delete anything                                     |
| `project_member`  | Invited contributors             | Create and edit their own content only. Read-only for others' content                  |
| `team_manager`    | Promoted sub-team leader         | Sees and manages their team's content, can manage sub-team members                     |
| `project_manager` | Senior team lead                 | Sees all project content, manages sub-teams, delegates work                            |

**The six default Access Profiles (used when inviting):**

1. **Owner** — same as project_owner role
2. **Editor** — all modules, project_editor role (most common invite)
3. **Viewer** — all modules, project_viewer role (read-only)
4. **Finance** — only Budgets module, project_editor role
5. **External reviewer** — only Board, Notes, Documents, project_viewer role
6. **Developer** — Board, Notes, Documents, Links, Milestones, project_editor role

---

## Section 3 — Inviting Project Members

### What was built

- `project_invites` table with token-based email links
- 2-step invite form: enter email → choose access profile or custom role
- Email notification with accept/reject links
- Quota enforcement: free plan max 3 members per project
- `/invite/[token]` landing page with module preview

### Test 3.1 — Invite a member as Editor (User A invites User B)

1. As User A, open your project → go to the **Team** tab
2. Click **Invite member** (or similar button)
3. **Step 1:** Enter User B's email address → click Next/Continue
4. **Step 2:** You should see a list of access profiles
   - Select **Editor** profile
   - Confirm the effective role shows "Editor"
5. Click Send invite

**Verify (User A's view):**

- A pending invite entry appears in the "Pending invites" list
- It shows User B's email, the "Editor" profile, and the expiry date
- A "Copy link" / share option is available for the token

**Verify (User B receives email):**

- Email arrives with accept/reject links
- The link format is: `/invite/[token]`

### Test 3.2 — Accept the invite (User B)

1. As User B, click the invite link from the email (or paste the token URL)
2. You land on `/invite/[token]`

**Verify on invite page:**

- Shows project name and invited role/profile
- Shows User B's email address
- Shows "Accept" and "Decline" buttons
- If profile has restricted modules, you see module badges (e.g. "Tasks", "Notes")

3. Click **Accept**

**Verify:**

- Redirect to the project (e.g. `/context/[projectId]`)
- User B can see the project in their sidebar
- User B can see all module tabs (Editor profile = all modules)

**Verify (User A's view, refresh Team tab):**

- User B appears in the Members list
- Shows role "Editor" and joined date

### Test 3.3 — Verify Editor permissions (User B)

As User B (Editor):

1. Go to the **Board** tab → create a task → **should work**
2. Edit the task title → **should work**
3. Go to **Notes** tab → create a note → **should work**
4. Go to **Team** tab → try to invite someone → **should be blocked** (no invite button or error)

### Test 3.4 — Invite a member as Viewer (User A invites User C)

1. As User A, invite User C with the **Viewer** profile
2. User C accepts the invite

**Verify (User C, Viewer):**

- Can open the Board tab and see tasks
- **Cannot** create a task (no "Add task" button, or button is hidden/disabled)
- **Cannot** create a note
- **Cannot** see the invite button in the Team tab

### Test 3.5 — Invite with restricted modules (Finance profile)

1. As User A, invite a new test email with the **Finance** profile
2. Have that user accept the invite

**Verify (Finance user):**

- Only the **Budgets** tab is visible in the project tab bar
- Other tabs (Board, Notes, etc.) are hidden
- They can create/edit budgets (Editor-level access to Budgets only)

### Test 3.6 — Invite with custom role (advanced)

1. As User A, invite a new test email
2. In Step 2 of the invite form, instead of choosing a profile, choose **Custom**
3. Manually check/uncheck specific action keys (e.g., allow `tasks.read` and `tasks.create` but not `tasks.delete`)
4. Send the invite and have the user accept

**Verify:**

- That user can create tasks but cannot delete them
- The Team tab → member row shows their custom permission set

### Test 3.7 — Revoke an invite

1. As User A, go to Team tab → Pending invites
2. Click Revoke on one of the pending invites

**Verify:**

- Invite disappears from Pending list
- If the invitee clicks the link now, they see an "invite revoked" error page

### Test 3.8 — Reject an invite (invitee declines)

1. As User A, send a new invite to a test email
2. As the invitee, open the invite link and click **Decline**

**Verify (User A, Team tab):**

- The invite moves from "Pending" to "Rejected invites" section
- Shows rejection status (and reason if provided)

### Test 3.9 — Quota enforcement (free plan, max 3 members)

1. You already have 2 members (User B + User C). The owner counts as 1 (even if not in project_members table, the quota RPC counts project_members rows).
2. As User A, try to invite a 4th user (beyond the free plan limit of 3 members)

**Verify:**

- You get an error message about quota exceeded
- No invite is created

> **Note:** If you want to test beyond quota, update the plan_quotas table directly in Supabase Studio: `UPDATE plan_quotas SET max_members_per_project = 10 WHERE plan = 'free';`

---

## Section 4 — Member Access Control (Edit After Joining)

### What was built

- `get_member_access` RPC: returns current granted actions + effective role
- `update_member_access_rpc`: atomically replaces role assignments for a member
- `user_project_action_grants`: per-member action-level overrides
- Team tab UI: click any member → edit their permissions

### Test 4.1 — View member access

1. As User A (owner), go to Team tab
2. Click the edit/expand button on User B's row

**Verify:**

- A panel or modal opens showing User B's current permissions
- Each module is listed with checkboxes for individual action keys
- The "effective role" label is shown (e.g. "Editor")
- Their allowed_modules is shown (null = all modules)

### Test 4.2 — Downgrade a member from Editor to Viewer

1. As User A, edit User B's access
2. Uncheck all write permissions (tasks.create, tasks.delete, notes.create, etc.)
3. Keep only `*.read` keys checked
4. Save

**Verify:**

- User B's effective role label changes to "Viewer"
- User B refreshes → can no longer create tasks or notes
- Create buttons disappear or show "permission denied"

### Test 4.3 — Grant a scoped read permission (Own scope)

1. As User A, edit User B's access
2. Instead of giving `notes.read` (full project scope), give `notes.read.own` only
3. Save

**Verify (User B):**

- In the Notes tab, User B can only see notes they created
- Notes created by User A are not visible to User B

---

## Section 5 — Sub-Teams

### What was built

- `project_teams` + `project_team_members` tables
- `createProjectTeam`, `updateProjectTeam`, `deleteProjectTeam` actions
- `addTeamMember`, `removeTeamMember`, `updateTeamMemberRole` actions
- Sub-teams section in the Team tab UI
- Three new roles: `project_member`, `team_manager`, `project_manager`

### Test 5.1 — Create a sub-team (User A)

1. As User A (owner), go to Team tab
2. Find the **Sub-teams** section (below the members list)
3. Click **Create team**
4. Enter name "Frontend Team" and optional description
5. Save

**Verify:**

- "Frontend Team" appears in the sub-teams list
- It shows 0 members

### Test 5.2 — Add members to the sub-team

1. As User A, expand "Frontend Team"
2. Click **Add member**
3. Select User B from the project members list
4. Save

**Verify:**

- User B appears in the Frontend Team member list
- Role shows "Member"

### Test 5.3 — Promote a member to team manager

1. As User A, in the Frontend Team list, find User B
2. Click the role selector next to User B
3. Change role to **Manager**

**Verify:**

- User B's role shows "Manager" in the sub-team
- User B now holds the `team_manager` role in the project (if the system seeds that role on promotion — check the team tab)

### Test 5.4 — Test team_manager read scope

1. Create two notes in the project: one as User A (owner), one as User B (team_manager)
2. As User A, grant User B `notes.read.team` instead of `notes.read.project`
3. Create User C as another project member NOT in Frontend Team

As User B (team manager):

- Should see: both User A's notes AND User B's notes (team scope = all members of user's sub-teams)

Wait — `notes.read.team` means "see notes from all members of my sub-teams". User B's sub-team contains User B. If User A is not in User B's sub-team, User B should only see User B's own notes plus any sub-team members' notes.

Actually re-read: `getTeamMemberIds` returns all members of all sub-teams the user belongs to. If Frontend Team has User B only, team scope = just User B. If we add User C to Frontend Team, team scope for User B = User B + User C.

### Test 5.5 — Team read scope with multiple team members

1. Add User C to Frontend Team as well (now team has User B + User C)
2. As User A, ensure User B has `notes.read.team` permission
3. Create notes: one as User B, one as User C, one as User A (owner, not in the team)
4. Log in as User B

**Verify (User B, notes.read.team):**

- User B sees: their own note + User C's note (same team)
- User B does NOT see: User A's note (User A is not in User B's sub-team)

### Test 5.6 — Delete a sub-team

1. As User A, delete "Frontend Team"

**Verify:**

- Team disappears from the sub-teams list
- User B and User C remain as project members (deletion cascades team membership, not project membership)
- If User B had `team_manager` role, check if that assignment is also cleaned up

---

## Section 6 — Read Scope Enforcement (Per-Module)

### What was built

- Phase 4 migration: `*.read.own`, `*.read.team`, `*.read.project` keys for 8 modules
- `getReadScope()` helper used in all list queries
- Updated actions: getNotes, listProjectLinks, getBudgetsByProjectId, getBillingsByProjectId, getBoardsByProjectIdAction, getDocuments, getMedia, getProjectCalendarFeed

### The three tiers

| Scope            | Filter applied                               | Who gets this                                 |
| ---------------- | -------------------------------------------- | --------------------------------------------- |
| `*.read.own`     | Only records with `owner_id = current_user`  | project_member role                           |
| `*.read.team`    | Records with `owner_id IN (team member IDs)` | team_manager role                             |
| `*.read.project` | No owner filter — all project records        | project_viewer, project_editor, project_owner |

### Test 6.1 — Notes read.own scope

1. As User A (owner), create 3 notes: "Note A1", "Note A2", "Note A3"
2. As User B (granted `notes.read.own` only), create 1 note: "Note B1"
3. Log in as User B → go to Notes tab

**Verify:**

- User B sees only "Note B1"
- "Note A1", "Note A2", "Note A3" are not visible

### Test 6.2 — Notes read.project scope

1. As User A, change User B's permission to `notes.read.project`
2. User B refreshes Notes tab

**Verify:**

- User B now sees all 4 notes (Note A1, A2, A3, B1)

### Test 6.3 — Documents scope

Repeat the same test as 6.1/6.2 but with the Documents module:

1. User A uploads a document
2. User B has `documents.read.own` → cannot see User A's document
3. Change to `documents.read.project` → now visible

### Test 6.4 — Billings scope

1. User A creates a billing entry: "Invoice #1"
2. User B has `billings.read.own` → goes to Billing tab
3. **Verify:** Cannot see "Invoice #1" (was created by User A, not User B)
4. Change User B to `billings.read.project` → now sees "Invoice #1"

### Test 6.5 — Calendar read scope

1. User A creates a calendar event: "Planning session"
2. User B has `calendar.read.own` → goes to Calendar tab
3. **Verify:** User B's calendar doesn't show "Planning session"
4. Change User B to `calendar.read.project` → event appears

### Test 6.6 — Media scope

Same pattern for the Media module.

### Test 6.7 — Links scope

Same pattern for the Links module.

### Test 6.8 — Budgets scope

Same pattern for the Budgets module. Note: test with `budgets.read.own` vs `budgets.read.project`.

---

## Section 7 — Module Visibility Gates

### What was built

- `getCanViewModule(projectId, 'module')` called on each module page.tsx
- If user doesn't have `*.read` (any tier) for a module, they see `ModuleDisabledView`
- Module tabs are hidden for members whose access profile excludes the module

### Test 7.1 — Tab bar only shows accessible modules

1. User C has the **Finance** profile (only Budgets module)
2. Log in as User C and open the project

**Verify:**

- Only the Budgets tab is visible in the left sidebar or tab bar
- If User C manually navigates to `/context/[projectId]/notes`, they should see a "Module not accessible" view (or be redirected)

### Test 7.2 — ModuleDisabledView

1. Create a member with a custom access profile that includes NO modules at all (empty allowed_modules array)
2. Log in as that member

**Verify:**

- No module tabs are visible
- Attempting to visit any module URL shows ModuleDisabledView

### Test 7.3 — Enable/disable module from Settings (owner only)

1. As User A (owner), disable the Milestones module from Settings
2. Verify the Milestones tab disappears for ALL users (including editors and viewers)
3. Re-enable it

---

## Section 8 — Project Manager & Team Manager Roles

### What was built

Three new roles (Phase 3 sub-teams):

- `project_member`: can create/edit own records, own read scope
- `team_manager`: can see all team records, manage sub-team membership
- `project_manager`: can see all project records, create sub-teams

### Test 8.1 — Invite as project_manager

1. As User A, invite a new user with a custom role that grants `project_teams.create`, `project_teams.update`, `project_teams.delete`, `project_teams.manage_members`, and `project_teams.read`
   - Note: The built-in profiles don't expose project_teams keys directly; you'll need to check if the invite form exposes project_teams.\* action keys in the module permission list
   - Alternatively, invite as Editor first, then edit their access to add project_teams.\* keys

2. Log in as the project_manager user

**Verify:**

- Sub-teams section is visible in Team tab
- Can create a new sub-team
- Can add/remove members from sub-teams

### Test 8.2 — project_manager cannot delete the project

1. Log in as the project_manager user
2. Go to project Settings

**Verify:**

- The "Delete project" button is absent or disabled
- The "Toggle module" controls are absent (only owner can toggle modules)

### Test 8.3 — team_manager can manage their own team

1. User B is a team_manager in "Frontend Team"
2. The team has User C as a member
3. As User B, go to Team tab → Sub-teams section

**Verify:**

- User B can add/remove members from Frontend Team
- User B cannot create a new sub-team (requires project_teams.create which project_manager has, not team_manager by default)
- User B cannot manage the "Backend Team" (a different sub-team they don't manage)

---

## Section 9 — Copilot Permissions

### What was built

- Phase 5: copilot chat route now accepts project members (not only owner)
- `approveProposal` checks `can(userId, capability.requiredAction, ...)` before executing
- `buildProjectContext` respects read scope when building the system prompt

### Test 9.1 — Member can open Copilot

1. Log in as User B (Editor role)
2. Go to the **Copilot** tab of the project

**Verify:**

- User B can see the copilot chat interface
- User B can type a message and get a response (not a 403 error)

### Test 9.2 — Copilot respects read scope in context

1. Ensure User B has `notes.read.own` (can only see their own notes)
2. User A has 3 notes; User B has 1 note
3. User B opens Copilot and asks: "What notes do we have in this project?"

**Verify:**

- Copilot response only references User B's 1 note
- Does NOT mention User A's notes (they were excluded from the context prompt)

### Test 9.3 — Copilot proposal approval is RBAC-gated

1. User B has `notes.read` but NOT `notes.create`
2. User B asks Copilot: "Create a note about architecture decisions"
3. Copilot proposes a `note` type proposal
4. User B clicks **Approve** on the proposal

**Verify:**

- Approval is rejected with a "Permission denied: you do not have 'notes.create'" error
- No note is actually created

### Test 9.4 — Member with note.create can approve note proposals

1. Grant User B `notes.create`
2. Repeat the Copilot flow from Test 9.3

**Verify:**

- The note is created successfully
- User B's Notes tab shows the new note

### Test 9.5 — Viewer cannot use Copilot (if copilot.create_session is required)

1. User C has Viewer role (has `copilot.read_sessions`, `copilot.read_proposals` but NOT `copilot.create_session`)
2. User C goes to Copilot tab

**Verify:**

- If `getCanViewModule` checks the copilot module, User C may see the Copilot tab but cannot start a new session
- OR the copilot tab is hidden if User C's profile excludes the copilot module

---

## Section 10 — Audit Log

### What was built

- `rbac_audit_log` table: append-only, immutable
- Written by: inviteProjectMember, revokeInvite, removeProjectMember, updateMemberAccess, acceptInvite, rejectInvite, createProjectTeam, deleteProjectTeam, addTeamMember, removeTeamMember

### Test 10.1 — Verify audit events are recorded

After performing the tests above, go to Supabase Studio and run:

```sql
SELECT actor_user_id, action, resource_type, resource_id, project_id, metadata, created_at
FROM rbac_audit_log
ORDER BY created_at DESC
LIMIT 20;
```

**Verify you see entries for:**

- `invite.created` (from Section 3.1)
- `invite.accepted` (from Section 3.2)
- `invite.revoked` (from Section 3.7)
- `invite.rejected` (from Section 3.8)
- `member.removed` (if you tested removing a member)
- `team.created` (from Section 5.1)
- `member.roles_updated` (from Section 4.2)

### Test 10.2 — Audit log is immutable

In Supabase Studio, try to DELETE or UPDATE an audit log row:

```sql
DELETE FROM rbac_audit_log WHERE id = '<any-id>';
```

**Verify:**

- The query fails with RLS policy denial (no DELETE policy exists on the table)

---

## Section 11 — Edge Cases & Security

### Test 11.1 — Non-member cannot access project

1. Create a brand new user account that has never been invited
2. Have them navigate directly to `/context/[projectId]`

**Verify:**

- They are redirected or see a "Project not found" / "Not authorized" error
- They cannot see any project data

### Test 11.2 — Expired invite cannot be accepted

1. In Supabase Studio, manually set an invite's `expires_at` to a past date:
   ```sql
   UPDATE project_invites SET expires_at = NOW() - INTERVAL '1 hour' WHERE email = 'test@example.com';
   ```
2. Have the invitee visit the invite link

**Verify:**

- They see an "Invite expired" error on the invite landing page
- They cannot accept the invite

### Test 11.3 — Wrong-account invite rejection

1. User B is logged in to Browser B
2. User A sent an invite to a DIFFERENT email (not User B's email)
3. User B opens the invite link

**Verify:**

- They see a "This invite was sent to a different email address" message
- They are prompted to sign in with the correct account
- They cannot accept the invite as User B

### Test 11.4 — Re-inviting an already-accepted member

1. User B has already accepted their invite
2. User A tries to invite User B again (same email)

**Verify:**

- An error is shown: "This user is already a project member" or similar
- No duplicate project_members row is created

### Test 11.5 — Member cannot invite other members (Viewer role)

1. User C has Viewer role
2. User C goes to Team tab and tries to invite someone

**Verify:**

- The invite button is not shown (or is disabled)
- If they somehow POST the request, they get a 403 with "Forbidden: missing permission 'teams.invite_project_member'"

### Test 11.6 — Owner bypass works

1. User A is the project owner
2. Remove User A from user_role_assignments entirely in Supabase Studio:
   ```sql
   DELETE FROM user_role_assignments WHERE user_id = '<user_a_id>' AND project_id = '<project_id>';
   ```
3. User A tries to access the project

**Verify:**

- User A still has full access (owner bypass in `can()` checks `projects.owner_id` first)
- All write operations still work

---

## Section 12 — Calendar Feed with Scope

### What was built

- Updated `get_project_calendar_feed` RPC now accepts project members
- New `p_owner_ids UUID[]` parameter for scope filtering
- `getProjectCalendarFeed` server action resolves `calendar.read.*` scope

### Test 12.1 — Member can see calendar feed

1. User A creates a calendar event: "Sprint planning - March 20"
2. User B has `calendar.read.project` → goes to Calendar tab

**Verify:**

- User B sees "Sprint planning - March 20"
- User B sees tasks and billings with due dates on the calendar (if they have read access to those modules)

### Test 12.2 — Own scope on calendar

1. User A creates event "Owner's event"
2. User B creates event "Member's event" (requires `calendar.create`)
3. Give User B `calendar.read.own`
4. User B views Calendar tab

**Verify:**

- User B sees "Member's event"
- User B does NOT see "Owner's event"
- User B also does NOT see User A's billing entries or other owner-created items (because p_owner_ids filters billings and events to User B only)

### Test 12.3 — Tasks always show regardless of scope

Tasks in the calendar feed are always project-scoped (no owner filter applies to tasks).

1. User A creates a task with a due date
2. User B has `calendar.read.own`
3. User B views Calendar

**Verify:**

- User B can see the task on the calendar (tasks are project-scoped, scope filter doesn't apply)

---

## Section 13 — Full End-to-End Scenario

This final scenario simulates a real team setup from scratch.

### Scenario: "Mobile App Launch" project with 4 users

**Setup:**

- User A = Project owner (you)
- User B = Project Manager (can manage sub-teams)
- User C = Developer (Frontend Team)
- User D = Designer (Frontend Team)

**Steps:**

1. **Create project** "Mobile App Launch" as User A

2. **Invite User B** as custom role with:
   - All `project_teams.*` keys (create, update, delete, manage_members, read)
   - `tasks.read.project`, `tasks.create`, `tasks.update_title`, `tasks.update_status`
   - `notes.read.project`, `notes.create`

3. **Invite User C** with **Developer** profile (Board, Notes, Documents, Links, Milestones, project_editor)

4. **Invite User D** with **Viewer** profile

5. Have all three users accept their invites

6. **Create sub-team** "Frontend Team" (as User A or User B)

7. **Add User C and User D** to Frontend Team

8. **Promote User C** to team manager of Frontend Team

9. **Test permissions:**
   - User B (project_manager): can create sub-teams? Can add User D to a new sub-team?
   - User C (team_manager): can add/remove members from Frontend Team? Cannot create new sub-teams?
   - User D (viewer): can see tasks but not create them?

10. **Create content as each user:**
    - User A creates "Task A", "Note A"
    - User C creates "Task C", "Note C"
    - User D creates NO content (viewer)

11. **Grant User C `notes.read.team`** (team scope)

12. **Verify:**
    - User C sees "Note C" (own) but NOT "Note A" (User A not in User C's team)
    - Change Frontend Team to include User A → User C now sees "Note A"

13. **Test Copilot as User C:**
    - Open Copilot
    - Ask "What tasks do we have?"
    - Copilot should reference both Task A and Task C (tasks are always project-scoped)
    - Ask "What notes do we have?"
    - Copilot should only reference "Note C" (notes.read.team excludes User A's notes if User A not in team)

14. **Remove User D from project** (User A does this)
    - **Verify:** User D can no longer access the project

15. **Check audit log** in Supabase Studio — should show all the above actions

---

## Quick Reference: Where Things Live in the UI

| Feature                 | Where to find it                                      |
| ----------------------- | ----------------------------------------------------- |
| Invite a member         | Project → Team tab → Invite button                    |
| See pending invites     | Project → Team tab → Pending invites section          |
| Edit member permissions | Project → Team tab → click member row                 |
| Create sub-team         | Project → Team tab → Sub-teams section                |
| Add member to sub-team  | Project → Team tab → expand sub-team                  |
| Toggle modules          | Project → Settings drawer → Modules section           |
| Accept invite           | Click link in email, or navigate to `/invite/[token]` |
| View copilot            | Project → Copilot tab                                 |

## Quick Reference: Supabase Studio Queries

```sql
-- See all project members and their roles
SELECT pm.user_id, p.display_name, ura.*, r.name as role_name
FROM project_members pm
JOIN profiles p ON p.user_id = pm.user_id
LEFT JOIN user_role_assignments ura ON ura.user_id = pm.user_id AND ura.project_id = pm.project_id
LEFT JOIN rbac_roles r ON r.id = ura.role_id
WHERE pm.project_id = '<your-project-id>';

-- See all action keys a user has in a project
SELECT ma.action_key, ma.description
FROM user_role_assignments ura
JOIN rbac_role_module_actions rrma ON rrma.role_id = ura.role_id
JOIN rbac_module_actions ma ON ma.id = rrma.action_id
WHERE ura.user_id = '<user-id>'
  AND ura.project_id = '<project-id>';

-- See all pending invites for a project
SELECT email, status, expires_at, token
FROM project_invites
WHERE project_id = '<project-id>'
ORDER BY created_at DESC;

-- See recent audit events
SELECT action, resource_type, metadata, created_at
FROM rbac_audit_log
WHERE project_id = '<project-id>'
ORDER BY created_at DESC;

-- See all sub-teams and their members
SELECT pt.name as team_name, p.display_name, ptm.role
FROM project_teams pt
JOIN project_team_members ptm ON ptm.team_id = pt.id
JOIN profiles p ON p.user_id = ptm.user_id
WHERE pt.project_id = '<project-id>';

-- Check what module access a user has
SELECT allowed_modules
FROM user_project_access_grants
WHERE project_id = '<project-id>'
  AND user_id = '<user-id>';
```

---

## What to Report If Something Breaks

For each failing test, note:

1. Which test number and step failed
2. What the expected behavior was
3. What actually happened (error message, wrong data shown, etc.)
4. Which user account was performing the action
5. Any relevant browser console errors or network request failures (open DevTools → Network tab)

The most common failure modes to watch for:

- **403 Forbidden** when a user should have access → RBAC resolver issue
- **Empty data** when a user should see records → read scope filter too aggressive
- **Data leakage** when a user sees records they shouldn't → read scope filter not applied
- **Invite link shows error** → token mismatch, RPC issue, or expired invite
- **Proposal approval fails** → `requiredAction` key not in user's granted set
