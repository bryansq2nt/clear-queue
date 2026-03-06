# Project Copilot — Structured Output JSON Contract (V1)

**Version:** 1.0
**Status:** Pre-implementation — contract definition only
**Scope:** Defines the exact structured output format that Project Copilot's AI model must produce, and that `lib/copilot/parser.ts` must consume.

---

## 1. Overview

Project Copilot uses a delimiter-based structured output format embedded inside the model's natural language response. The AI produces conversational text AND optionally a machine-readable proposals block in the same response. The parser extracts only the proposals block; the rest of the response is displayed as chat text.

This approach was chosen over pure JSON output (which would break conversational UX) and over tool/function calling (which adds complexity and latency not needed for V1).

---

## 2. Delimiter Format

Proposals are embedded in responses using this exact format:

```
<<PROPOSALS>>
[
  { ... },
  { ... }
]
<</PROPOSALS>>
```

**Rules:**

- The delimiters `<<PROPOSALS>>` and `<</PROPOSALS>>` must appear on their own lines
- The content between delimiters must be a valid JSON array
- Each element in the array is one proposal object
- If the model has no proposals to make, it omits the block entirely — it does NOT emit an empty array block
- A response may contain at most ONE proposals block
- The proposals block may appear anywhere in the response (before, after, or in the middle of natural language text), but placing it at the end is recommended in the system prompt for readability

**Example valid response:**

```
Looking at your project, I can see you have 3 tasks in progress and none in backlog. Based on your description of building a mobile alarm app, here are some tasks I'd suggest starting with:

<<PROPOSALS>>
[
  {
    "type": "task",
    "title": "Define alarm trigger conditions and edge cases",
    "status": "next",
    "priority": 4,
    "notes": "Consider silent mode, do-not-disturb, and repeat logic"
  },
  {
    "type": "task",
    "title": "Research iOS and Android background execution limits",
    "status": "next",
    "priority": 3
  },
  {
    "type": "note",
    "title": "Mobile Alarm App — Scope Definition",
    "content": "## Goal\nBuild a cross-platform mobile alarm app.\n\n## Key constraints\n- iOS background execution limits apply\n- Android battery optimization must be handled\n\n## Open questions\n- Will this use native or React Native?\n- Does it need cloud sync?"
  }
]
<</PROPOSALS>>

Would you like me to suggest tasks for a specific development stage, or break these down further?
```

---

## 3. V1 Allowed Proposal Types

V1 supports exactly two proposal types: `task` and `note`.

Milestone proposals, stage proposals, and calendar event proposals are **explicitly out of scope for V1** and must be rejected by the parser if the model produces them.

---

## 4. Task Proposal Schema

### Required fields

| Field   | Type     | Description                                       |
| ------- | -------- | ------------------------------------------------- |
| `type`  | `"task"` | Must be the exact string `"task"`                 |
| `title` | string   | The task title. Must be non-empty after trimming. |

### Optional fields

| Field      | Type    | Default  | Description                                                                                            |
| ---------- | ------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `status`   | string  | `"next"` | One of: `"backlog"`, `"next"`, `"in_progress"`, `"blocked"`, `"done"`. Any other value is invalid.     |
| `priority` | integer | `3`      | Integer from 1 (lowest) to 5 (highest). Must be a whole number.                                        |
| `notes`    | string  | `null`   | Additional context for the task. Max 2000 characters.                                                  |
| `tags`     | string  | `null`   | Comma-separated tags. Max 3 tags. Each tag max 30 characters. Example: `"planning, research, mobile"`. |
| `due_date` | string  | `null`   | ISO 8601 date string: `"YYYY-MM-DD"`. No time component.                                               |

### Example: minimal valid task proposal

```json
{
  "type": "task",
  "title": "Set up the project repository"
}
```

### Example: full valid task proposal

```json
{
  "type": "task",
  "title": "Implement push notification permission flow",
  "status": "next",
  "priority": 4,
  "notes": "Must handle both iOS and Android permission dialogs. Reference Apple Human Interface Guidelines for timing.",
  "tags": "mobile, notifications, ios",
  "due_date": "2026-04-15"
}
```

### Example: invalid task proposals (must be rejected)

```json
{ "type": "task", "title": "" }
```

Reason: empty title after trim.

```json
{ "type": "task", "title": "Build feature", "status": "wip" }
```

Reason: `"wip"` is not a valid status enum value.

```json
{ "type": "task", "title": "Research", "priority": 6 }
```

Reason: priority 6 is out of range (must be 1–5).

```json
{ "type": "task", "title": "   " }
```

Reason: title is only whitespace after trim.

---

## 5. Note Proposal Schema

### Required fields

| Field     | Type     | Description                                                                                  |
| --------- | -------- | -------------------------------------------------------------------------------------------- |
| `type`    | `"note"` | Must be the exact string `"note"`                                                            |
| `title`   | string   | The note title. Must be non-empty after trimming. Max 200 characters.                        |
| `content` | string   | The note body. Must be non-empty after trimming. Max 10,000 characters. Markdown is allowed. |

### Optional fields

None in V1.

### Example: minimal valid note proposal

```json
{
  "type": "note",
  "title": "Project Scope — Initial Definition",
  "content": "This project involves building a mobile alarm application for iOS and Android."
}
```

### Example: full valid note proposal

```json
{
  "type": "note",
  "title": "Mobile Alarm App — Technical Constraints",
  "content": "## Background Execution\n\niOS limits background tasks to ~30 seconds. Background fetch allows periodic polling but is unreliable for alarms.\n\n## Recommended Approach\n\nUse push notifications from a backend server to trigger alarms reliably. The server fires the notification at the scheduled time, bypassing background execution limits.\n\n## Open Decisions\n\n- Cloud sync: required or optional?\n- Target OS versions: iOS 16+, Android 12+?\n- Offline mode support?"
}
```

### Example: invalid note proposals (must be rejected)

```json
{ "type": "note", "title": "My Note" }
```

Reason: missing required `content` field.

```json
{ "type": "note", "title": "", "content": "Some content here" }
```

Reason: empty title after trim.

```json
{ "type": "note", "title": "Note", "content": "" }
```

Reason: empty content after trim.

---

## 6. Rejected Proposal Types

The following proposal types must be silently filtered out by `lib/copilot/parser.ts` in V1. The parser must not throw. The user sees no error — the proposals block simply produces fewer cards.

| Type                         | Reason for rejection                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `"milestone"`                | No milestones table exists in the database. Phase 4+.      |
| `"stage"`                    | Board stages are not directly writable entities. Phase 4+. |
| `"calendar_event"`           | Not included in V1 scope.                                  |
| Any unrecognized type string | Unknown type — filter silently.                            |

---

## 7. Validation Expectations by Layer

### Layer 1 — Parser (`lib/copilot/parser.ts`)

This is the **first** layer of validation. It runs on raw AI output.

- Extract content between `<<PROPOSALS>>` and `<</PROPOSALS>>` delimiters
- Attempt `JSON.parse()` on extracted content
- If parse fails: return `[]`, log to Sentry with `module: 'copilot'`, `action: 'parseProposals'`
- If parse succeeds but result is not an array: return `[]`
- For each element: check `type` field is a string and is in the V1 allowed types set
- Filter out elements with invalid or missing `type`
- Do NOT validate field-level contents at this layer (that is Layer 2's job)
- Return the surviving elements as a `CopilotProposal[]` with `status: 'pending'`

### Layer 2 — Client-side display validation (`lib/validation/copilot.ts`, client)

This runs before a proposal is displayed as a card in the UI.

- Check that required fields exist and are non-empty strings after trim
- Check enum values are within allowed sets
- Check numeric ranges (priority 1–5)
- Proposals that fail this layer are filtered from the UI silently (not shown as cards)
- Log filter events to Sentry in production

### Layer 3 — Server-side write validation (`lib/validation/copilot.ts`, server)

This runs inside `approveProposal` server action, before any write to `tasks` or `notes`.

- Reload the proposal from DB (do not trust client-supplied payload)
- Re-validate all fields with strict rules
- Reject if `status !== 'pending'` (prevents duplicate approval)
- Reject if required fields are missing or empty after trim
- Reject if enum values are not in the exact allowed set (no fuzzy matching)
- Reject if `project_id` does not match the authenticated user's project
- On rejection: return `{ ok: false, error: 'validation_failed' }` — never throw

---

## 8. Full Proposals Block Examples

### Valid block — two tasks and one note

```
<<PROPOSALS>>
[
  {
    "type": "task",
    "title": "Set up monorepo structure",
    "status": "next",
    "priority": 5,
    "notes": "Use Turborepo or Nx. Confirm with team before starting."
  },
  {
    "type": "task",
    "title": "Configure CI/CD pipeline",
    "status": "backlog",
    "priority": 3
  },
  {
    "type": "note",
    "title": "Architecture Decision — Monorepo vs Polyrepo",
    "content": "After analyzing the project scope, a monorepo approach is recommended because the shared components between web and mobile are significant. Key packages: ui, api-client, shared-types."
  }
]
<</PROPOSALS>>
```

### Invalid block — malformed JSON (parser returns `[]`)

```
<<PROPOSALS>>
[
  { "type": "task", "title": "Setup CI" }
  { "type": "note", "title": "Notes" }
]
<</PROPOSALS>>
```

Reason: missing comma between objects — not valid JSON.

### Invalid block — wrong delimiter casing (parser finds no block, returns `[]`)

```
<<proposals>>
[{ "type": "task", "title": "Do something" }]
<</proposals>>
```

Reason: delimiters are case-sensitive. Must be `<<PROPOSALS>>` and `<</PROPOSALS>>`.

### Mixed valid and invalid proposals (parser returns only valid ones)

```
<<PROPOSALS>>
[
  { "type": "task", "title": "Valid task" },
  { "type": "milestone", "title": "Launch v1" },
  { "type": "note", "title": "Notes doc", "content": "Content here" }
]
<</PROPOSALS>>
```

Result: parser returns the `task` and `note` proposals. The `milestone` is silently filtered.

---

## 9. Parser Safety Recommendations

The following rules apply to `lib/copilot/parser.ts`:

1. **Never throw.** All errors must be caught and result in a return of `[]`.
2. **Never trust the model.** Every field must be validated before use.
3. **Fail open on display, fail closed on write.** If a proposal looks structurally OK, show it as a card. Only the server-side write validator has the final say on whether data enters the system.
4. **Log parse failures.** Every time `JSON.parse` throws, capture it with `captureWithContext(error, { module: 'copilot', action: 'parseProposals', userIntent: 'Extract proposals from assistant response', expected: 'Valid JSON array between delimiters' })`.
5. **Do not mutate the raw content.** Store `copilot_messages.content` as the raw assistant text including the `<<PROPOSALS>>` block. Do not strip it. This allows re-parsing if the parser is updated.
6. **Idempotent parsing.** `parseProposals(content)` called twice with the same input must return the same result. No side effects.
7. **Return type is always `CopilotProposal[]`.** Even if only some proposals in a block are valid, return those. Partial results are better than no results.

---

## 10. Schema Design Recommendations

### Do not use strict JSON schema validation libraries for V1

Simple manual validation in `lib/validation/copilot.ts` is sufficient and consistent with the rest of the codebase (which avoids Zod in validation helpers per `CONVENTIONS.md`). Add Zod if and when the proposal types grow complex enough to justify it.

### Map proposal fields directly to entity insert shapes

The `payload` JSONB column in `copilot_proposals` should store the proposal in a shape that maps cleanly to `tasks.Insert` and `notes.Insert`. This avoids a transformation step in `approveProposal`:

```typescript
// Task proposal payload maps to:
tasks.Insert {
  project_id: string     // injected by approveProposal, NOT from AI payload
  title: string          // from payload.title
  status: TaskStatus     // from payload.status ?? 'next'
  priority: number       // from payload.priority ?? 3
  notes: string | null   // from payload.notes ?? null
  tags: string | null    // from payload.tags ?? null
  due_date: string | null // from payload.due_date ?? null
}

// Note proposal payload maps to:
notes.Insert {
  project_id: string     // injected by approveProposal, NOT from AI payload
  owner_id: string       // injected by approveProposal from auth
  title: string          // from payload.title
  content: string        // from payload.content
}
```

**Critical:** `project_id` and `owner_id` must NEVER come from the AI payload. They must always be injected server-side from the authenticated session. This is a security invariant.

### Version the contract

Add a `contract_version: "1.0"` field to the system prompt instructions so future prompt changes can track which schema the model was instructed to use. If the schema changes in Phase 2, bump to `"1.1"` so you can tell which version generated a given `copilot_proposals` row.
