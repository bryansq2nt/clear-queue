# Project Creation V2 — Revised Technical Audit

**Feature name:** Project Creation V2 — Conversational Project Intake  
**Date:** 2026-03-16  
**Scope:** Conversational intake only. No general AI assistant, no milestones/tasks/mind maps/team assignment. Gather info → structured draft → confirm → create. Stop there.

---

## PART 1 — REVISED AUDIT

### A. Scope correction

**Assumptions in the current audit/plan that are too broad:**

1. **“Infer goal, probable next steps, module recommendations by type”** — The original audit treats the AI as a planner that suggests modules (e.g. “business → Inventory, Budgets, Billing”) and hints at “more modules later.” For **intake only**, we should infer the minimum needed to create the project: category, name, optional client/business link. Module suggestions are optional polish; they must not drive the flow or prompt complexity. **Remove** from “required” any language that implies the AI recommends modules as a first-class behavior; treat modules as “optional overrides the AI may suggest” only if we have spare capacity.

2. **“Follow-up: add client/company now or later”** — The current plan implies multi-step onboarding (add client now vs later, add business now vs later). For **intake only**, the only requirement is: we can **link** an existing client/business if the user says so. We do **not** create clients or businesses in this flow. **Remove** “add client/company basics now” as a first-phase feature; keep “link existing client/business” only.

3. **“Long-term intelligence: suggest milestones, starter tasks, mind maps, module activations based on project maturity”** — This appears in the original product vision. **Remove entirely** from this feature. Non-goal.

4. **“Help naming”** — The AI “helping” to name the project can drift into creative copy. For intake, we either have a name (user provided) or we ask once: “What should we call this project?” and accept the answer. **Narrow** to: ask for name if missing; do not offer to “generate” names unless we define a very tight rule (e.g. “suggest one name based on category only, user must confirm”).

5. **Phase 4 “Follow-ups and module recommendation polish” and Phase 5 “Replace default and cleanup”** — Phase 4 as written mixes “client/business now” (link existing is enough) with “module recommendations.” **Simplify:** follow-ups = only what is needed to fill required fields (name, category) and optional link (client_id, business_id). Module recommendation becomes a **hardening** option (suggest defaults by category) not a separate phase.

6. **“Conversation state model” and “session”** — Current plan leaves “stateless vs session” open. For this feature, **stateless first**: every request sends full message history. No DB-backed pre-project sessions. Removes scope and coupling to copilot session tables.

**What should be removed from the current plan (future phases, not this feature):**

- Any milestone generation, task generation, mind maps, skill-based assignment.
- Full client/business onboarding (create client/business in flow).
- “Coaching” or “improvement suggestions” after creation.
- Reuse of copilot session storage for pre-project chat.
- A separate “Phase 4” dedicated to module recommendations; fold minimal module hint into prompt and Phase 2/3 if at all.
- Phase 5 “Replace default” as a separate phase; make it part of rollout in Phase 4 (hardening) or a one-line product decision: “FAB opens V2; classic form in menu.”

---

### B. Current reusable foundation

**Reuse as-is:**

- **createProject(formData)** — Auth, quota, RPC, notes update, audit, revalidation are correct. Do not duplicate. We add a **wrapper** that builds FormData from a structured draft and calls createProject, then applies module overrides.
- **create_project_atomic** — No changes. Same signature and behavior.
- **PROJECT_CATEGORIES** (`lib/constants.ts`) — Single source of truth for valid category keys. Validation in createProject and in draft validation must use this.
- **MODULE_REGISTRY / ORDERED_MODULES** (`lib/modules/registry.ts`) — For validating module keys in a draft and for setProjectModuleEnabled. Use as-is.
- **setProjectModuleEnabled(projectId, moduleKey, enabled)** — Use as-is after project is created from draft.
- **getClients**, **getBusinessesByClientId** — Use as-is when we need to pass “existing clients/businesses” into the intake prompt so the AI can suggest “link to X” by id. Same as AddProjectModal.
- **requireAuth**, **getUser** — Use as-is in the new route and in createProjectFromDraft.
- **checkOrgProjectQuota** — Already inside createProject; no change.
- **logAuditEvent**, **revalidatePath**, **captureWithContext** — Patterns stay; used by the wrapper action.

**Wrap, do not rewrite:**

- **createProjectFromDraft(draft)** — Implement as: validate draft → build FormData from draft → createProject(formData) → on success, for each module override in draft, setProjectModuleEnabled(projectId, key, value). No copy-paste of createProject internals.
- **Rate limiting** — Copilot uses copilot_messages count per user (daily/hourly). Pre-project chat has no projectId and no copilot_messages. **Option A:** Add a small table or use a simple in-memory/Redis counter for “project_creation_chat” requests per user per day/hour. **Option B:** Reuse the same rate-limit numbers but count something else (e.g. a dedicated table `project_creation_chat_turns` with user_id, created_at). Prefer a **thin wrapper** around a simple limit (e.g. same daily/hourly caps, different counter) rather than reusing copilot_messages (wrong semantic).

**Do NOT reuse (too coupled to project-scoped copilot):**

- **buildProjectContext(projectId, …)** — Not used. No project exists yet.
- **Copilot session/message/proposal tables** — Do not store pre-project messages in copilot_sessions. Stateless: client sends full history each time.
- **CopilotChatWindow / CopilotInputBar** — They are tied to projectId, sessionId, proposals, approve/reject. For intake we need a **slim conversation UI**: message list + input + optional draft summary. Reuse **patterns** (streaming, scroll, input) but implement a dedicated component or a very thin adapter that does not depend on projectId or proposal parsing. Do not import copilot session actions or proposal types.
- **Proposal parsing (<<PROPOSALS>>, approve/reject)** — Different contract. We only have `<<PROJECT_DRAFT>>` and no approve/reject of entities; we have “user confirms draft” then create.

---

### C. True requirements for this feature

**Minimum technical requirements:**

1. **Structured draft schema**
   - Required: `name: string`, `category: string` (must be one of PROJECT_CATEGORIES keys).
   - Optional: `notes?: string`, `color?: string`, `client_id?: string`, `business_id?: string`, `moduleOverrides?: Record<ModuleKey, boolean>`.
   - No extra fields (e.g. “goal”, “next steps”) in the create path; they can exist in the prompt for inference only but are not stored on the project.

2. **Required vs optional fields**
   - **Required for creation:** name (non-empty), category (valid key).
   - **Optional:** notes, color, client_id, business_id, moduleOverrides.
   - Server must reject creation if name is missing or category invalid; optional fields can be omitted or null.

3. **Conversation state model**
   - **Stateless:** Client holds `messages: Array<{ role, content }>`. Each API call sends the full array. No server-side session store for pre-project chat in this phase.
   - **Outcomes per turn:** (a) assistant asks for a missing required field, (b) assistant resolves ambiguity (e.g. which client?), (c) assistant returns a structured draft for confirmation. No other outcomes.

4. **createProjectFromDraft(draft)**
   - Input: typed draft (name, category, notes?, color?, client_id?, business_id?, moduleOverrides?).
   - Validate required fields and category; validate module keys if present.
   - Build FormData, call createProject(formData). On success, apply moduleOverrides via setProjectModuleEnabled. Return same ActionResult<ProjectRow>.

5. **Pre-project chat route**
   - POST `/api/project-creation/chat` (or similar).
   - Auth: requireAuth(); 401 if not authenticated.
   - Body: `{ messages: Array<{ role: 'user' | 'assistant', content: string }> }`.
   - Response: streamed assistant text; optionally a structured block `<<PROJECT_DRAFT>>` with JSON.
   - No projectId; no project context. Optional: pass list of existing client/business names+ids for the prompt.

6. **Validation rules**
   - **Server (draft):** name non-empty string; category in PROJECT_CATEGORIES; client_id/business_id UUID or null; moduleOverrides: only valid ModuleKeys; color: string or null.
   - **Server (after parse):** If AI returns invalid category → default `'business'`. Invalid module keys → ignore. Missing name in draft → do not return “ready to create”; prompt must ask for name.

7. **Confirmation step**
   - Create is allowed **only** after explicit user action (e.g. “Create project” button) with the current draft. No “create on last message” or implicit create.
   - UI must show a summary (name, category, optional client/business) and a single “Create project” (or “Use this and create”) button.

8. **Fallback rules for invalid AI output**
   - Category not in list → use `'business'`.
   - name null/empty in draft → treat as “not ready”; API can return draft with `name: null` and `next_question` asking for name; client must not show “Create” until name is present.
   - Invalid client_id/business_id → ignore (do not link).
   - Unknown module keys in suggested_modules → filter out before applying.

---

### D. Risks (for this narrower feature)

- **AI output drift** — Model returns wrong category or invents fields. Mitigation: strict server-side validation; allowlist category and module keys; fallback category; no creation without valid required fields.
- **Over-asking** — AI asks more than necessary (e.g. “tell me more about your goals”). Mitigation: prompt must state “ask only for missing required fields or to resolve ambiguity”; no open-ended “coaching” questions.
- **Creating invalid projects** — Draft with empty name or invalid category. Mitigation: createProjectFromDraft validates exactly like createProject; never call createProject with invalid inputs.
- **Coupling chat to project-copilot** — Reusing copilot components or session storage pulls in projectId and proposal logic. Mitigation: separate route, no copilot session tables, dedicated slim UI component; reuse only streaming/HTTP pattern and auth.
- **Scope creep** — Adding “suggest milestones”, “suggest tasks”, “add client creation”. Mitigation: strict non-goals doc; Phase 0 product contract; code review checklist.
- **Form parity gaps** — V2 cannot set something the form can (e.g. color, notes, client, business, modules). Mitigation: draft schema matches form fields; createProjectFromDraft + setProjectModuleEnabled give parity; document any intentional omission (e.g. “create new client” deferred).
- **i18n gaps** — Opening line and errors only in one language. Mitigation: Phase 4 hardening includes ES/EN for all user-facing strings in the flow.
- **Abuse / rate limiting** — Pre-project chat is unbound without a limit. Mitigation: rate limit the new route (e.g. same daily/hourly caps as copilot, different counter); no dependency on copilot_messages.
- **Confirmation ambiguity** — User thinks they confirmed but UI didn’t. Mitigation: only one explicit “Create project” button; no create on natural-language “yes” without showing the draft summary first.

---

### E. Non-goals (strict)

- **No** milestone generation, task generation, mind maps, or skill-based assignment.
- **No** full client/business onboarding (creating new client/business in this flow).
- **No** “coaching” or improvement suggestions after creation.
- **No** changes to create_project_atomic, teams, or RBAC beyond existing requireAuth and quota.
- **No** reuse of copilot session DB for pre-project messages (stateless only).
- **No** general “project copilot” behavior; this is intake only.
- **No** new large subsystem (e.g. new DB schema for conversations) unless justified; prefer stateless + client-held history.

---

_Next: [implementation-plan-revised.md](./implementation-plan-revised.md) and product contract in Phase 0._
