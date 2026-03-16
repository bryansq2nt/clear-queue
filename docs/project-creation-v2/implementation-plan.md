# Project Creation V2 — Implementation Plan

**Date:** 2026-03-16  
**Prerequisite:** [audit.md](./audit.md)

This plan is phased so we can deliver and test incrementally without touching the teams/RBAC work. Each phase ends with a testable slice.

---

## Phase 1: Backend contract and create-from-draft

**Goal:** Ability to create a project from a structured payload (same as form) without changing the existing form or FAB. No UI yet.

### 1.1 Create project from structured draft

- **Add** a server action that accepts a typed “draft” instead of FormData, e.g.:
  - `createProjectFromDraft(draft: ProjectDraft)` in `app/actions/projects.ts` (or a dedicated file under `app/actions/` if preferred).
  - **ProjectDraft type:** `{ name: string; category: string; notes?: string; color?: string; client_id?: string; business_id?: string; moduleOverrides?: Record<ModuleKey, boolean> }`.
  - **Validation:** Same as current createProject (category in PROJECT_CATEGORIES, name non-empty, optional client_id/business_id). Validate module keys against MODULE_REGISTRY/ORDERED_MODULES.
  - **Implementation:** Either build FormData from draft and call existing `createProject(formData)` then apply module overrides, or inline the same logic (quota, RPC, notes update, audit, revalidatePath) and call `setProjectModuleEnabled` for each override. Prefer reusing createProject to avoid drift.
  - **Return:** Same `ActionResult<ProjectRow>`.

- **Constraints:** No new RPC; no changes to create_project_atomic. Existing requireAuth, quota, revalidation, and audit logging must remain.

### 1.2 Tests and verification

- **Unit (Vitest):** If you extract validation or draft→FormData into `lib/` (e.g. `lib/validation/project-draft.ts`), add tests for valid/invalid categories and module keys.
- **Manual:** Call createProjectFromDraft from a temporary script or one-off route with a known draft; confirm project and module state in DB.

**Exit criteria:** CreateProjectFromDraft exists, is covered by project rules (auth, quota, validation), and creates a project + module overrides without using the form.

---

## Phase 2: Pre-project chat API and prompt

**Goal:** An API route that accepts conversation history and returns assistant replies with optional structured “project draft” and follow-up questions. No UI yet.

### 2.1 API route

- **New route:** e.g. `app/api/project-creation/chat/route.ts` (POST).
  - **Auth:** `getUser()` or `requireAuth()` first; 401 if not authenticated.
  - **Body:** `{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }`. Optional: `sessionId` for future session persistence.
  - **Rate limiting:** Apply a simple limit (e.g. same or stricter than copilot: daily/hourly per user) to avoid abuse. Reuse or mirror copilot strategy (see `docs/project-copilot/architecture/project-copilot-rate-limit-strategy.md`).
  - **No projectId** in URL or context.

### 2.2 Context for the LLM

- **Inputs to system prompt:**
  - User’s locale (from Accept-Language or a simple user preference if available); default ES/EN.
  - Optional: list of existing clients (id, full_name) and businesses (id, name, client_id) for the user, so the AI can suggest “link to existing X” or “create new later.” Fetch via getClients + getBusinessesByClientId (or equivalent server-side). Keep payload small (e.g. names and ids only).
- **No** project-specific context (no tasks, notes, etc.).

### 2.3 System prompt (Project Creation V2)

- **File:** e.g. `lib/project-creation-v2/prompt.ts` or under `docs/project-creation-v2/prompts/` as reference; actual prompt in code.
- **Responsibilities:**
  - Greet and ask what kind of project (opening line in locale).
  - From natural language, infer: project type → category, goal, for-me vs for client, client/business involvement, suggested modules (map type → modules per audit: business → budgets/billings, website → tasks/milestones/notes/documents, etc.).
  - Ask follow-ups: name? help naming? client? add client/company now or later?
  - Output format: either free text only, or a structured block, e.g. `<<PROJECT_DRAFT>>` with JSON: `{ "name"?, "category"?, "notes"?, "client_id"?, "business_id"?, "color"?, "suggested_modules"?, "next_question"? }`. Prefer one structured block per turn when the AI has enough info to suggest a draft or next question.
- **Contract doc:** Add `docs/project-creation-v2/contract.md` describing the response format (and any `<<...>>` blocks) so client and server stay in sync.

### 2.4 Response parsing and validation

- **Parse** assistant content for `<<PROJECT_DRAFT>>` (or chosen tag); extract JSON.
- **Validate** category against PROJECT_CATEGORIES; suggested_modules against ModuleKey; fallback category to `'business'` if invalid or missing.
- **Return** from API: streamed text (like copilot) and/or a JSON envelope at the end with `{ draft?: ProjectDraft; next_question?: string }`. Client can then show summary and “Create” when user confirms.

### 2.5 Tests and verification

- **Unit:** Prompt builder and parser (given a string with `<<PROJECT_DRAFT>>`, parse and validate).
- **Manual:** Call the API with a few messages (e.g. “Quiero crear un proyecto para un sitio web de un cliente”) and verify response contains valid draft or follow-up.

**Exit criteria:** POST to the new route returns assistant reply; optional structured draft in response; validation and fallbacks in place.

---

## Phase 3: Conversational UI (Create Project V2)

**Goal:** FAB in the projects view opens the V2 flow instead of the form. User can still access the classic form (e.g. from a menu or secondary entry).

### 3.1 UI components

- **Create project V2 flow:** A modal or full-screen overlay with:
  - Message list (assistant + user), scroll to bottom, streaming support.
  - Input bar (single line or textarea) to send messages.
  - Optional: “Use classic form” link that closes V2 and opens AddProjectModal.
- **Reuse:** Prefer reusing patterns from CopilotChatWindow/CopilotInputBar where possible (simplified: no proposals, no approve/reject). If the copilot components are too coupled to projectId/sessions, implement a slim “conversation” component for project-creation only.
- **State:** Messages in React state; no need for DB-backed sessions in Phase 3 (stateless: send full history each time). Optional: persist last N messages in sessionStorage for refresh recovery.

### 3.2 Flow

1. User clicks FAB → open V2 modal; no projectId.
2. Initial message: system sends opening line (or first assistant message from API with empty/salutation user message).
3. User types → append to messages, call POST `/api/project-creation/chat` with `messages`; stream response; append assistant message.
4. When response includes a **draft** and user has confirmed (e.g. “Create” or “Yes, create it”):
   - Call `createProjectFromDraft(draft)` (from Phase 1).
   - On success: close modal, refresh project list (e.g. router.refresh() or invalidate cache), optionally navigate to the new project.
   - On error: show error in UI (quota, validation, etc.).
5. If draft is present but user hasn’t confirmed, show a summary card and “Create project” / “Edit” (e.g. go back to one more question).

### 3.3 Wiring the FAB

- **ContextProjectPicker:** Change FAB (and “Add project” when no projects) to open the V2 flow instead of AddProjectModal. Add a way to open the classic form (e.g. “Use classic form” inside V2 modal, or a dropdown on the FAB: “Chat” vs “Form”).
- **TopBar:** Decide: same as above (FAB opens V2, form in menu) or keep TopBar opening the form. Prefer consistency: both open V2, with “Classic form” available in both.

### 3.4 i18n

- Add keys for: opening line, follow-up templates, module suggestion text, “Create project”, “Use classic form”, errors (quota, validation). ES + EN.
- **File:** `locales/en.json`, `locales/es.json` under a namespace like `projectCreationV2.*` or `projects.create_v2.*`.

### 3.5 Tests and verification

- **E2E (Playwright):** Happy path: open projects view → click FAB → see chat → send “un sitio web para un cliente” → get reply → confirm draft → project appears in list.
- **Manual:** Test in both locales; test “Use classic form”; test quota and validation errors.

**Exit criteria:** FAB opens V2; user can complete creation via conversation; classic form still reachable; no regression in existing project creation.

---

## Phase 4: Follow-ups and module recommendation polish

**Goal:** Refine follow-up logic, module recommendations, and “add client/company now or later” in the prompt and UI.

### 4.1 Prompt and contract

- **Follow-ups:** Ensure the prompt asks: name (or help naming), for-you vs client, add client/business now or later. Map answers into draft (client_id, business_id) or “add later.”
- **Module recommendation:** Implement the mapping (business → budgets/billings, website → tasks/milestones/notes/documents, event → tasks/calendar/budgets/notes, app → tasks/milestones/notes/ideas/documents) in the prompt or in a small `lib/project-creation-v2/module-recommendations.ts` used by the prompt builder. Mention that more modules can be enabled later.
- **Structured output:** If not already in Phase 2, add `suggested_modules: ModuleKey[]` and `next_question?: string` to the contract; parser and UI already handle draft and confirmation.

### 4.2 Client/business “now”

- **Scope:** Phase 4 can keep “link existing client/business only” (dropdown or AI-suggested existing). “Create new client/business in this flow” can be a later phase (separate createClient/createBusiness calls or future RPC).
- **UI:** If the draft includes client_id/business_id, show which client/business is linked; allow “Change” that opens a small picker (existing clients/businesses) and updates the draft before create.

### 4.3 Tests

- **E2E:** Client project with existing client selected; business project with modules suggested; “add later” path.
- **Manual:** Verify suggested modules match project type; follow-ups feel natural in ES and EN.

**Exit criteria:** Follow-up and module logic match the product spec; “add later” and “link existing” work; no new backend RPC for client/business creation in this phase.

---

## Phase 5: Replace default and cleanup (after V2 is proven)

**Goal:** Make V2 the default project creation experience; keep classic form as an option. Optional cleanup.

### 5.1 Default behavior

- FAB and “Add project” already open V2 (done in Phase 3). Ensure “Use classic form” is visible and works everywhere.
- Consider analytics or feedback to confirm V2 is used and successful before hiding the form (e.g. move “Classic form” to settings or “Advanced”).

### 5.2 Documentation and handoff

- Update user-facing docs (if any) to describe the new flow.
- Mark Phase 5 “done” only when the team agrees to treat V2 as the primary path.

### 5.3 Optional cleanup

- If the form is rarely used, consider moving it to a single entry (e.g. settings or “Create project (classic)” in a menu). Do not remove it until explicitly agreed.

**Exit criteria:** V2 is the default; classic form still available; docs updated.

---

## File and folder map (suggested)

| Item                       | Location                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Audit                      | `docs/project-creation-v2/audit.md`                                                   |
| Implementation plan        | `docs/project-creation-v2/implementation-plan.md`                                     |
| Contract (response format) | `docs/project-creation-v2/contract.md` (Phase 2)                                      |
| Prompt text / builder      | `lib/project-creation-v2/prompt.ts` or `lib/project-creation-v2/`                     |
| Module recommendations     | `lib/project-creation-v2/module-recommendations.ts` (Phase 4)                         |
| API route                  | `app/api/project-creation/chat/route.ts`                                              |
| createProjectFromDraft     | `app/actions/projects.ts` (or `app/actions/project-creation-v2.ts`)                   |
| V2 modal / flow            | `components/projects/CreateProjectV2Modal.tsx` (or under `app/context/` if preferred) |
| i18n                       | `locales/en.json`, `locales/es.json` under a dedicated key space                      |

---

## Dependencies and order

- **Phase 1** must be done first (create-from-draft).
- **Phase 2** can start in parallel with Phase 1 (API + prompt + contract).
- **Phase 3** depends on Phase 1 and 2 (UI calls API and createProjectFromDraft).
- **Phase 4** builds on Phase 3 (prompt and UI polish).
- **Phase 5** is final switch and docs; no code dependency on teams/RBAC.

---

## Summary

| Phase | Deliverable                                              | Test                    |
| ----- | -------------------------------------------------------- | ----------------------- |
| 1     | createProjectFromDraft + validation                      | Unit + manual create    |
| 2     | POST /api/project-creation/chat + prompt + draft parsing | Unit parser; manual API |
| 3     | V2 modal, FAB wired, i18n, create from draft in UI       | E2E + manual            |
| 4     | Follow-ups, module suggestions, client/business “now”    | E2E + manual            |
| 5     | Default = V2, “Classic form” option, docs                | Product sign-off        |

All phases avoid changing the existing form implementation and the teams/RBAC module; the FAB is the only entry we switch to V2, with an explicit path back to the classic form.
