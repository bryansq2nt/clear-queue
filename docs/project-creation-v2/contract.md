# Project Creation V2 — API Contract

**Feature:** Conversational Project Intake only.  
**Aligned with:** Phase 0 product contract in [implementation-plan-revised.md](./implementation-plan-revised.md).

---

## Request

**POST** `/api/project-creation/chat`

**Body:**

```json
{
  "messages": [
    { "role": "user", "content": "Quiero crear un sitio web para un cliente" },
    { "role": "assistant", "content": "..." }
  ]
}
```

- **messages:** Array of `{ role: 'user' | 'assistant', content: string }`, in order. Full history sent each time (stateless).
- Optional: **locale** (e.g. `"es"` | `"en"`) for opening line.

---

## Response

- **Streaming:** Same pattern as project copilot: stream assistant text (e.g. `text/event-stream`).
- Optionally at end of stream, or in a final chunk: one structured block `<<PROJECT_DRAFT>>` with JSON.
- **No** proposals; **no** approve/reject. Only draft + optional next_question.

---

## Structured block: project draft

**Tag:** `<<PROJECT_DRAFT>>`

**Body (JSON):**

```json
{
  "name": "string | null",
  "category": "string",
  "notes": "string | null",
  "color": "string | null",
  "client_id": "string | null",
  "business_id": "string | null",
  "suggested_modules": ["board", "notes", "budgets", ...] | null,
  "next_question": "string | null"
}
```

**Semantics:**

- **name:** Required for “ready to create.” `null` until user provides it; then non-empty string. Client must not show “Create project” until name is set.
- **category:** Required. Must be one of `PROJECT_CATEGORIES` keys. Server validates; invalid → fallback `'business'`.
- **notes, color, client_id, business_id:** Optional. Server accepts null or valid values; invalid UUIDs ignored.
- **suggested_modules:** Optional. Array of `ModuleKey`. Server filters to valid keys only; unknown keys dropped. Applied as module overrides when creating (only keys that differ from registry default).
- **next_question:** Optional. When a required field is missing or ambiguity must be resolved, AI sets this to the single follow-up question. Otherwise null.

**Rules:**

- One structured block per assistant turn when the model has enough to propose a draft or ask one question.
- AI must **not** output drafts for milestones, tasks, or any entity other than the project.

---

## Server validation (after parse)

- **category:** Must be in `PROJECT_CATEGORIES.map(c => c.key)`. If not → use `'business'`.
- **name:** If null or empty, draft is “not ready”; client must not call create.
- **client_id / business_id:** If present, must be valid UUID; optionally check existence/ownership. Invalid → ignore (do not link).
- **suggested_modules:** Filter to valid `ModuleKey`; drop unknown. When creating, apply only overrides that differ from registry default.

---

## Create-from-draft (server action)

**Input (createProjectFromDraft):** Typed draft with **name** (required, non-empty), **category** (required, valid key), and optional notes, color, client_id, business_id, moduleOverrides.

**Behavior:** Validate → build FormData → call existing createProject(formData) → on success apply moduleOverrides via setProjectModuleEnabled. Return same ActionResult<ProjectRow>.

**No** new RPC; no change to create_project_atomic.
