# Project Creation V2 — Revised Implementation Plan

**Feature:** Conversational Project Intake only.  
**Prerequisite:** [audit-revised.md](./audit-revised.md)

---

## Phase 0 — Product contract

**Goal:** Lock scope and contracts so implementation does not drift.

### 0.1 Exact scope

- Replace the rigid create-project form with a **conversational intake** flow.
- User describes the project in natural language.
- System infers only what is needed to create the project (name, category, optional notes, client/business link, optional color and module overrides).
- System asks **only** for missing required fields or to resolve ambiguity.
- System produces a **structured draft** and user **confirms**.
- System creates the project using the existing backend (createProject + setProjectModuleEnabled). **Stop there.** No milestones, tasks, mind maps, or post-creation guidance.

### 0.2 Required project fields (for creation)

| Field        | Source                                | Rule                                      |
| ------------ | ------------------------------------- | ----------------------------------------- |
| **name**     | User or AI ask                        | Non-empty string; required.               |
| **category** | Inferred from user description or ask | One of PROJECT_CATEGORIES keys; required. |

### 0.3 Optional project fields

| Field           | Source                            | Rule                                                                      |
| --------------- | --------------------------------- | ------------------------------------------------------------------------- |
| notes           | User or omit                      | Trimmed string or null.                                                   |
| color           | User or omit                      | Hex string or null.                                                       |
| client_id       | User says “for client X” / pick   | Valid UUID of existing client or null.                                    |
| business_id     | User says “for business Y” / pick | Valid UUID of existing business or null (if client_id set).               |
| moduleOverrides | Inferred or omit                  | Record<ModuleKey, boolean>; only keys that differ from registry defaults. |

### 0.4 What the AI may infer

- **Category** from natural language (e.g. “sitio web” → development, “evento” → operations, “personal” → personal).
- **client_id / business_id** only by matching user’s words to the **provided list** of existing clients/businesses (id + name). The AI may output an id from that list; it must not invent ids.
- **notes** from a short user description if we want to store it.
- **moduleOverrides** (optional): suggest enabling a small set of modules by project type; server will validate and apply only valid keys.

### 0.5 What the AI must ask

- **Only** when a **required** field is missing: “What should we call this project?” (name), or “What type of project is this?” (category) if truly ambiguous.
- **Only** when needed to **resolve ambiguity**: e.g. “You have two clients named X; which one?” (then list ids/names we sent in context).
- Must **not** ask open-ended “tell me more” or “what are your goals?” except as a single opening: “What’s this project about?” to get initial description.

### 0.6 What the user must confirm

- Before **create** is called: user must see a **summary** of the draft (name, category, optional client/business) and take an **explicit action** (“Create project” button). No implicit create on last message.

### 0.7 Structured output contract

- **Tag:** `<<PROJECT_DRAFT>>`
- **Body (JSON):**  
  `{ "name": string | null, "category": string, "notes": string | null, "color": string | null, "client_id": string | null, "business_id": string | null, "suggested_modules": string[] | null, "next_question": string | null }`
- **Rules:**
  - `name`: null if not yet provided; required to be non-empty for “ready to create.”
  - `category`: must be a valid PROJECT_CATEGORIES key; server will fallback to `'business'` if invalid.
  - `next_question`: optional; only when we still need a required field or to resolve ambiguity.
  - One structured block per assistant turn when the model has enough to propose a draft or ask one question.

### 0.8 Safe fallback behavior

- **Category** invalid or missing → server uses `'business'`.
- **name** null or empty in draft → client must not show “Create project”; show “next_question” or ask for name.
- **client_id / business_id** not in allowed list or invalid UUID → ignore (do not link).
- **suggested_modules** → server filters to valid ModuleKeys only; unknown keys dropped.
- **Rate limit exceeded** → return 429; client shows “Use classic form” or try again later.
- **Create fails** (quota, validation) → show error; allow “Use classic form” or retry.

---

## Phase 1 — Create project from structured draft

**Goal:** Backend can create a project from a typed draft with no UI change.

### Deliverables

- **createProjectFromDraft(draft)** in `app/actions/projects.ts` (or a single file under `app/actions/`).
- **Draft type:** See “Recommended draft schema” below.
- **Implementation:** Validate draft (name, category, optional fields, module keys). Build FormData from draft. Call existing **createProject(formData)**. On success, for each key in `draft.moduleOverrides` where value differs from registry default, call **setProjectModuleEnabled(projectId, key, value)**. Return same `ActionResult<ProjectRow>`.
- No new RPC; no change to create_project_atomic. Auth, quota, audit, revalidation unchanged (handled by createProject).

### Dependencies

- None (first phase).

### Risks

- Duplicating createProject logic. Mitigation: only build FormData and call createProject; do not reimplement validation or RPC.

### Test strategy

- **Unit:** Draft validation (valid/invalid category, empty name, invalid module keys) in isolation if extracted to `lib/validation/project-draft.ts`.
- **Integration:** Call createProjectFromDraft with a known good draft from a test or script; verify project row and project_modules rows in DB.

### Exit criteria

- createProjectFromDraft exists.
- Given a valid draft, a project is created and optional module overrides applied.
- Invalid draft (empty name, bad category) returns `{ ok: false, error }`.
- No change to existing form or FAB.

---

## Phase 2 — Conversational intake API

**Goal:** A pre-project chat route that returns assistant text + optional structured draft; stateless; prompt focused only on intake.

### Deliverables

- **Route:** POST `app/api/project-creation/chat/route.ts`.
  - Auth: requireAuth(); 401 if not authenticated.
  - Body: `{ messages: Array<{ role: 'user' | 'assistant', content: string }> }`.
  - Optional: `locale` for opening line (default from Accept-Language or app default).
- **Rate limiting:** Simple daily/hourly per user (e.g. same caps as copilot). Do **not** use copilot_messages; use a dedicated counter (e.g. new table `project_creation_chat_turns` with user_id, created_at, or in-memory/Redis if acceptable). Return 429 with clear body when exceeded.
- **Context for LLM:** List of existing clients and businesses (id, name) for the current user, so the AI can suggest “link to X” by id. No project data.
- **System prompt:** Intake-only. See “Recommended prompt behavior rules” below. No milestones, tasks, coaching, or copilot behavior.
- **Streaming:** Same pattern as copilot route (Anthropic messages.stream, return ReadableStream). No proposals; only text + optional `<<PROJECT_DRAFT>>` block at end of content.
- **Parsing:** After stream (or in a final chunk), parse assistant content for `<<PROJECT_DRAFT>>`; extract JSON; validate category and module keys; apply fallbacks. Return streamed text; optionally in a trailing non-streamed JSON envelope `{ draft?: ProjectDraft, next_question?: string }` if client needs it (or client parses from streamed text).
- **Validation:** Server-side validation and fallbacks as in Phase 0.

### Dependencies

- Phase 0 (contract). Phase 1 is not required for the API to respond, but create will fail until Phase 1 exists; acceptable for Phase 2 to deliver “chat + draft” without a working create button until Phase 3 wires it.

### Risks

- Prompt drift (AI asks too much or suggests milestones). Mitigation: tight prompt; review prompts in PR.
- Rate limit implementation scope. Mitigation: start with a simple per-user count (e.g. new table with one row per request, count last 24h/1h).

### Test strategy

- **Unit:** Parser for `<<PROJECT_DRAFT>>` and validation/fallback (category, modules).
- **Manual:** POST with 2–3 messages; verify streamed reply and presence of valid draft when enough info given.

### Exit criteria

- POST returns 200 with streamed assistant reply.
- When conversation has enough info, response contains `<<PROJECT_DRAFT>>` with valid category and (when name given) name.
- Invalid category in block → server normalizes to `'business'`.
- Rate limit returns 429 when over cap.
- No projectId in route; no project context in prompt.

---

## Phase 3 — Project creation chat UI

**Goal:** FAB opens V2 flow; user chats, sees summary, confirms; project is created. Classic form remains available.

### Deliverables

- **UI component:** Modal or overlay with (1) message list (user + assistant), scroll to bottom, (2) input bar, (3) when draft is present and has name: summary card (name, category, optional client/business) + “Create project” button, (4) “Use classic form” link.
- **No** reuse of CopilotChatWindow/CopilotInputBar components if they depend on projectId/sessions/proposals; implement a **slim** conversation component (messages state, streaming, append assistant message). Reuse only streaming/HTTP pattern.
- **Flow:** Open V2 → show opening line (from first API call with empty or greeting user message, or from i18n). User types → POST with full history → stream reply → append to messages. When response includes draft with name: show summary + “Create project.” On “Create project”: call createProjectFromDraft(draft). On success: close modal, refresh list (router.refresh() or cache invalidate), optionally navigate to new project. On error: show error, keep modal open; offer “Use classic form.”
- **Confirmation:** Create **only** on explicit “Create project” click. Never create on “yes” in chat without showing the summary and button.
- **FAB:** ContextProjectPicker FAB (and “Add project” when no projects) opens V2 modal. TopBar “Add project”: same (open V2). Inside V2: “Use classic form” closes V2 and opens AddProjectModal.
- **i18n (minimal):** Opening line, “Create project,” “Use classic form,” one generic error key. ES + EN. Full i18n in Phase 4.

### Dependencies

- Phase 1 (createProjectFromDraft). Phase 2 (API).

### Risks

- User expects “create” from chat text. Mitigation: always show summary + button; no create without button.
- Streaming + draft parsing on client. Mitigation: parse `<<PROJECT_DRAFT>>` from streamed content when stream ends; or API returns draft in a final JSON envelope.

### Test strategy

- **E2E (Playwright):** Open projects view → FAB → V2 opens → send “un sitio web para mi cliente” (or similar) → get reply → when draft with name appears, click “Create project” → project in list. Then: “Use classic form” opens form.
- **Manual:** No name in draft → “Create project” not shown. Invalid draft → error shown.

### Exit criteria

- FAB opens V2 flow.
- User can complete: describe → see reply → see summary → click “Create project” → project created.
- Classic form reachable via “Use classic form”; both flows work.
- No regression in existing project creation.

---

## Phase 4 — Hardening

**Goal:** Edge cases, i18n, rate limiting, testing, rollout, fallback.

### Deliverables

- **Edge cases:** Empty first message; very long message (truncate or reject with clear limit); draft with name but invalid category (server already fallback); two clients with same name (prompt: ask which one by id/name).
- **i18n:** All user-facing strings in the flow: opening line, follow-ups, “Create project,” “Use classic form,” errors (quota, validation, rate limit, generic). ES + EN. Namespace e.g. `projectCreationV2.*` or `projects.create_v2.*`.
- **Rate limiting:** Document and verify; ensure 429 response and client message.
- **Testing:** E2E for happy path and “Use classic form”; unit for parser and draft validation; manual for both locales.
- **Rollout:** FAB opens V2 by default; classic form in menu/modal. No removal of form. Optional: feature flag to default FAB to form if needed.
- **Fallback on failure:** On create failure (quota, validation, network), show error and “Use classic form” so user can complete creation.

### Dependencies

- Phases 1–3 done.

### Risks

- i18n incomplete. Mitigation: list all strings in Phase 3/4 and add to locales.
- Rate limit too strict. Mitigation: use same or slightly more permissive than copilot for this route.

### Test strategy

- Full E2E; manual in both languages; rate limit test (e.g. exceed limit, expect 429).

### Exit criteria

- All user-facing text in ES/EN.
- Rate limit enforced and handled in UI.
- E2E passes; no critical edge case open.
- Rollout strategy documented; “Use classic form” always available.

---

## Recommended draft schema (TypeScript)

```ts
import type { ModuleKey } from '@/lib/modules/registry';

export interface ProjectDraft {
  /** Required for create. Non-empty. */
  name: string;
  /** Required. One of PROJECT_CATEGORIES keys. */
  category: string;
  notes?: string | null;
  color?: string | null;
  client_id?: string | null;
  business_id?: string | null;
  /** Only keys that differ from registry default. Server validates ModuleKey. */
  moduleOverrides?: Record<ModuleKey, boolean>;
}
```

- **API/parser output** may use `name: string | null` until name is collected; **createProjectFromDraft** must receive `name: string` (non-empty). Client should only call create when draft has non-empty name.

---

## Recommended conversation states

- **Initial:** No messages; show opening line (from API or i18n).
- **Collecting:** Messages in progress; last assistant turn may contain `next_question` or a draft with `name: null`.
- **Draft ready:** Last assistant turn contains draft with non-empty `name` and valid `category`. UI shows summary + “Create project.”
- **Creating:** User clicked “Create project”; createProjectFromDraft in flight.
- **Done:** Project created; modal closed; list refreshed.
- **Error:** Create failed or rate limit; show message and “Use classic form.”

No server-side state; client holds messages and current draft.

---

## Recommended server validation rules

- **name:** Required. `typeof name === 'string' && name.trim().length > 0`.
- **category:** Required. `PROJECT_CATEGORIES.some(c => c.key === category)`; else use `'business'`.
- **notes:** Optional. If present, trim; max length optional (e.g. 5000).
- **color:** Optional. If present, string (e.g. hex); else null.
- **client_id / business_id:** Optional. If present, must be valid UUID; optionally verify existence and ownership (same as form). Invalid → treat as null.
- **moduleOverrides:** Optional. For each key, must be in MODULE_REGISTRY; ignore unknown keys. Only apply overrides that differ from registry default.

---

## Recommended prompt behavior rules

1. **Role:** You only help the user create a new project. You do not give advice on milestones, tasks, or planning. You only collect: project name, type (category), optional description (notes), optional client/business link, optional color and modules.
2. **Opening:** One short question in the user’s language: e.g. “What’s this project about?” or “¿De qué trata el proyecto que quiere crear?”
3. **Infer:** From the answer, infer category (map to exact PROJECT_CATEGORIES key). If the user mentions a client or business, match to the provided list (id + name) and set client_id/business_id if unambiguous.
4. **Ask only when needed:** If name is missing, ask once: “What should we call this project?” If category is ambiguous, ask once. If multiple clients match, ask which one. Do not ask for optional fields (notes, color, modules) unless the user offered and we need a clarification.
5. **Output:** When you have at least name and category, output a single `<<PROJECT_DRAFT>>` JSON block with the draft and `next_question: null`. If a required field is still missing, output draft with that field null and `next_question` set to the one question to ask.
6. **No coaching:** Do not suggest milestones, tasks, or “next steps.” Do not say “I recommend…” except for optional category or optional module hints. Keep responses short.

---

## Cut list: what to postpone to future phases

- Milestone generation, task generation, mind maps, skill-based assignment.
- Creating new client/business in this flow (only link existing).
- “Help naming” beyond asking “What should we call this project?” (no AI-generated names unless a later product decision).
- Storing pre-project conversation in DB (stateless only).
- Reusing copilot session/proposal tables or components.
- Phase 5 as a separate “replace default” phase (fold into rollout in Phase 4).
- Rich module recommendation logic (optional: simple “suggest these modules for this category” in prompt; server applies only valid keys).

---

## Final recommendation: what to build first this week

1. **Phase 0:** Lock the product contract (this document + contract.md updated). No code.
2. **Phase 1:** Implement **createProjectFromDraft** and draft validation; add unit/integration test. **Do this first** (1–2 days).
3. **Phase 2:** Implement the **conversational intake API** (route, prompt, parser, rate limit). No UI yet; test with curl/Postman. **Next** (2–3 days).
4. **Phase 3:** Build the **slim chat UI** and wire FAB; add E2E. **Then** (2–3 days).
5. **Phase 4:** Harden (i18n, edge cases, rate limit verification, “Use classic form” on errors). **Last** (1–2 days).

**First this week:** Phase 0 + Phase 1. That gives a clear contract and a working “create from draft” path so Phase 2 can focus on the API and prompt without blocking on UI.
