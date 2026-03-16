# Project Creation V2 — Initial Audit

**Date:** 2026-03-16  
**Goal:** Determine what we have and what we need to implement the conversational project-creation flow (V2) without replacing the current form until V2 is built and tested.

---

## 1. Current project creation flow (as-is)

### 1.1 Entry points

| Location          | Trigger                                                    | Behavior                     |
| ----------------- | ---------------------------------------------------------- | ---------------------------- |
| **Projects view** | FAB (fixed bottom-right) or “Add project” when no projects | Opens `AddProjectModal`      |
| **TopBar**        | “Add project” in nav                                       | Opens same `AddProjectModal` |

- **ContextProjectPicker** (`app/context/ContextProjectPicker.tsx`): FAB at lines 218–224, modal at 227–234. `onProjectAdded` closes modal and calls `router.refresh()`.
- **TopBar** (`components/shared/TopBar.tsx`): Renders `AddProjectModal`; same contract.

### 1.2 AddProjectModal (current form)

**File:** `components/projects/AddProjectModal.tsx`

- **Fields:** name (required), description (notes), category (select), client (optional), business (optional, depends on client), color (optional), **module toggles** (overrides vs registry defaults).
- **Data loading:** `useEffect` loads `getClients()` when open; `getBusinessesByClientId(clientId)` when client changes.
- **Submit:** Builds `FormData` (name, category, notes, color, client_id, business_id) → `createProject(formData)` → on success applies module overrides via `setProjectModuleEnabled(projectId, mod.key, value)` for each override → reset form, `onProjectAdded()`, `onClose()`.
- **No** `router.refresh()` inside the modal; parent’s `onProjectAdded` does `router.refresh()`.

### 1.3 createProject (server action)

**File:** `app/actions/projects.ts` — `createProject(formData)`

- **Auth:** `requireAuth()` first.
- **Inputs from FormData:** name, color, category, notes, client_id, business_id.
- **Validation:** category in `PROJECT_CATEGORIES`; name non-empty; optional trim for notes/ids.
- **Quota:** Resolves user’s org (first `organization_members.org_id`), then `checkOrgProjectQuota(orgId)`; returns error if not allowed.
- **Persistence:** Calls RPC `create_project_atomic(in_name, in_color, in_category, in_org_id, in_client_id, in_business_id)`. Then, if `notes` provided, updates `projects.notes` for the created project.
- **Audit:** `logAuditEvent({ action: 'project.created', ... })`.
- **Revalidation:** `revalidatePath('/dashboard')`, `revalidatePath('/context')`.
- **Return:** `{ ok: true, data: ProjectRow }` or `{ ok: false, error: string }`.

### 1.4 create_project_atomic (RPC)

**File:** `supabase/migrations/20260320100001_fix_create_project_atomic_and_members_rls.sql`

- **Signature:** `(in_name, in_color, in_category, in_org_id, in_client_id, in_business_id)` — **no notes**; notes are set in a separate update in the action.
- **Behavior:** SECURITY DEFINER; validates `auth.uid()` and non-empty name; creates `projects` row (owner_id = auth.uid()); inserts `project_members`; assigns `project_owner` role; returns the created project row.
- **Categories:** Any string allowed at DB; app validates against `PROJECT_CATEGORIES`.

### 1.5 Project categories and modules

- **Categories** (`lib/constants.ts`): `business`, `clients`, `development`, `internal_tools`, `operations`, `personal`, `research`, `archived` (archived filtered out in create form).
- **Modules** (`lib/modules/registry.ts`): `board` (lock), `owner`, `documents`, `media`, `calendar`, `notes`, `links`, `ideas`, `budgets`, `billings`, `milestones`, `copilot`, `team`. Each has `defaultEnabled`, `lock`, `nav`, etc.
- **Module toggles after create:** `app/actions/modules.ts` — `setProjectModuleEnabled(projectId, moduleKey, enabled)`; used to apply overrides after project creation.

---

## 2. Existing conversational / AI assets

### 2.1 Project Copilot (in-context chat)

- **Route:** `/context/[projectId]/copilot` — requires an existing project.
- **API:** `POST /api/copilot/[projectId]/chat` — expects `sessionId`, `messages[]`; validates project access (owner or project_member); builds context from `buildProjectContext(projectId, contextScope)`; streams LLM response; parses proposals (task, note, milestone, etc.) for approve/reject.
- **Components:** `CopilotChatWindow`, `CopilotInputBar` in `components/context/copilot/`. Sessions and messages stored in DB (copilot_sessions, copilot_messages, copilot_proposals).
- **Relevance for V2:** Same UX pattern (chat window + input, streaming, structured output) is reusable. Copilot is **project-scoped**; project creation has **no projectId** until the project is created. So we need a **separate** API and flow for “pre-project” conversation.

### 2.2 Copilot context builder

- **File:** `lib/copilot/context.ts` — `buildProjectContext(projectId, scope)` pulls project, tasks, notes, milestones, links, todos, budgets, billings, clients, etc. for the system prompt.
- **Relevance for V2:** Not used for creation flow. For V2 we need a **different** system prompt and no project context (or only user/org context: e.g. existing clients/businesses for suggestions).

### 2.3 Rate limiting and auth

- Copilot route enforces daily/hourly limits and message length.
- **Relevance for V2:** Any new project-creation chat API should enforce similar rate limits and auth.

---

## 3. Gaps for V2 (what we need)

### 3.1 Product / UX

| Need                      | Current state                       | Required                                                                                                                                                           |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Entry**                 | FAB opens form modal                | FAB opens V2 flow (conversational). Form remains available elsewhere (e.g. menu or “Classic form”) until V2 is default.                                            |
| **Opening line**          | N/A                                 | System message in user’s locale (e.g. “Qué bueno que está aquí. ¿De qué trata el proyecto que quiere crear?”).                                                     |
| **User intent**           | User fills category/client/business | User describes in natural language; AI infers type, goal, for-me vs client, client/business, suggested modules.                                                    |
| **Follow-up questions**   | N/A                                 | Dynamic: name, help naming, client?, business?, add client/company now or later.                                                                                   |
| **Module recommendation** | User toggles all                    | AI suggests modules by project type (e.g. business → Inventory, Budgets, Billing; website → Tasks, Milestones, Notes, Files); hint that more can be enabled later. |
| **Structured output**     | N/A                                 | At “create” moment: project name, category, notes, client_id, business_id, color, list of module keys to enable (or defaults only).                                |
| **Creation**              | Single form submit                  | One call to same backend: create project (existing RPC/action) + apply module overrides.                                                                           |

### 3.2 Technical

| Need                           | Current state                    | Required                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-project chat API**       | No projectId                     | New route, e.g. `POST /api/project-creation/chat` (or under `/api/...`). Auth: requireAuth(); no project scoping. Optional: lightweight “session” (e.g. in-memory or short-lived store) to keep conversation turn history.                                                                                              |
| **System prompt**              | Project Copilot prompt           | New “Project Creation V2” system prompt: infer category, goal, client/business, recommend modules; output structured project payload + optional follow-up question.                                                                                                                                                     |
| **Structured output contract** | Proposals (task, note, …)        | New contract: e.g. `<<PROJECT_DRAFT>>` or `<<CREATE_PROJECT>>` with `{ name, category, notes?, client_id?, business_id?, color?, suggested_modules[] }` and/or next question.                                                                                                                                           |
| **Conversation state**         | N/A                              | Either stateless (each request = full history) or short-lived session (e.g. Redis or DB table) keyed by anonymous session id. Stateless is simpler; session allows “resume” and analytics.                                                                                                                              |
| **Client list for AI**         | N/A                              | For “add client now”: need to pass user’s clients (and businesses) into context so AI can suggest “use existing X” or “create new”. Same data as AddProjectModal: getClients(), getBusinessesByClientId.                                                                                                                |
| **Create from draft**          | FormData from form               | New server action, e.g. `createProjectFromDraft(draft)`, that takes the same logical inputs as current createProject (name, category, notes, color, client_id, business_id) plus optional `moduleOverrides` or `suggestedModules`, and calls existing createProject logic + setProjectModuleEnabled. No new RPC needed. |
| **UI**                         | Modal with form                  | New modal or full-screen “Create project” flow: chat UI (message list + input), possibly show inferred summary (category, modules) before final “Create” confirmation. Reuse CopilotChatWindow/CopilotInputBar patterns where possible, or a slimmer variant.                                                           |
| **i18n**                       | projects.\*, sidebar.add_project | New keys for V2: opening line, follow-ups, module suggestions, confirm/create, errors. Support ES/EN.                                                                                                                                                                                                                   |

### 3.3 Non-goals (explicit)

- **Do not** change `create_project_atomic` or project/RLS/teams logic for this feature.
- **Do not** replace the existing form in code until V2 is tested and approved; only **add** V2 and switch the FAB to it (with option to “Use classic form” if desired).
- **Do not** couple to teams/RBAC work; no dependency on pending migrations or role checks beyond existing requireAuth and quota.

---

## 4. Summary: what we have vs what we need

**We have:**

- Working project creation: `createProject` + `create_project_atomic` + optional notes update and module overrides.
- Full project form: AddProjectModal with categories, client, business, modules, color.
- Project-scoped copilot: chat API, streaming, proposals, CopilotChatWindow/CopilotInputBar.
- Module registry and setProjectModuleEnabled.
- Categories and client/business lists (getClients, getBusinessesByClientId).
- Auth, quota, revalidation, audit logging patterns.

**We need:**

1. **New API route** for pre-project conversational flow (auth, optional rate limit, no projectId).
2. **New system prompt + response contract** for inferring project type, goal, client/business, suggested modules, and emitting a project draft (and/or next question).
3. **New server action** (or extended createProject) to create project from a structured draft (same RPC + notes + module overrides).
4. **New UI flow** for “Create project (V2)”: chat surface + optional summary/confirmation + call to create from draft; FAB wired to this flow with option to use classic form.
5. **i18n** for all new user-facing strings (ES/EN).
6. **Lightweight session/history** for the pre-project conversation (optional; can start stateless).

---

## 5. Risks and constraints

- **AI output reliability:** Structured output (category, modules) must be validated and fallback to safe defaults (e.g. category “business”) if invalid.
- **Client/business creation:** V2 spec says “add client/company basics now or later.” “Now” could mean creating client/business in the same flow; that would require either multi-step RPC or separate createClient/createBusiness calls before createProject. Current form only links existing client/business; creating new ones is done elsewhere. Scope for V2 Phase 1 can be “link existing only” and add “create client/business in flow” in a later phase.
- **Quota and errors:** Same quota and error handling as current create; surface clear messages (e.g. quota_projects_per_org) in the chat or confirmation step.

---

_Next: [implementation-plan.md](./implementation-plan.md) for phased delivery._
