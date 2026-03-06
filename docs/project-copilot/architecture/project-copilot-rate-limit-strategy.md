# Project Copilot — Rate Limit Strategy (V1)

**Version:** 1.0
**Status:** Pre-implementation — strategy definition only
**Related:** `docs/project-copilot/architecture/project-copilot-architecture-adr.md`

---

## 1. Why Rate Limiting Is Non-Negotiable

Project Copilot introduces the first AI-powered feature in ClearQueue. Unlike all other features in this codebase, every Copilot interaction incurs a real monetary cost paid to an external AI provider (Anthropic). There is currently **zero rate limiting infrastructure** anywhere in the repo.

Without rate limiting:

- A single user can send hundreds of messages per hour, generating costs that exceed the product's monthly budget in one session
- A bad actor or automated script can trivially exhaust the API quota
- Long conversations with large project contexts produce compounding token costs
- There is no signal for detecting abuse before the invoice arrives

Rate limiting for Project Copilot is a **P1 requirement** that must ship with Phase 1, not as an afterthought.

---

## 2. Risk Categories

### Request abuse risk

A user (malicious or simply enthusiastic) sends messages in rapid succession. Each request triggers a model call with a full context payload. At 1,000–3,000 input tokens per call plus 500–1,000 output tokens, this becomes expensive quickly.

**Scenario:** 100 messages per hour at 2,000 tokens average = 200,000 tokens/hour. At Anthropic Claude Sonnet pricing (~$3/M input tokens, ~$15/M output tokens), this is roughly $0.60–$1.50 per user per hour. Across 100 active users, that's $60–150/hour with no cap.

### Cost risk

Token costs are non-linear. System prompts are sent with every request. A large project context (many tasks, many notes) inflates the system prompt. If context assembly is unbounded, costs scale with project size, not just message count.

### Token budget risk

The AI model has a context window limit. If conversation history grows unbounded and is sent wholesale to the model, eventually requests will fail with context overflow errors. This must be handled proactively, not reactively.

### Concurrency risk

A user with a slow network may fire duplicate requests by clicking "Send" multiple times. Without concurrency protection, this creates duplicate messages and parallel model calls for the same turn.

---

## 3. Recommended Limits (V1)

All limits are conservative. They can be relaxed after observing real usage patterns. Starting tight and relaxing is safer than starting loose and trying to retroactively apply caps.

### Per-user message limit

| Limit                          | Value | Rationale                                                                             |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------- |
| Messages per user per 24 hours | 30    | Enough for a genuine planning session (10–20 turns is realistic); stops runaway usage |
| Messages per user per hour     | 15    | Prevents rapid-fire bursts while allowing a sustained planning session                |

### Per-project session limit

| Limit                                  | Value | Rationale                                                                                        |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| Active concurrent sessions per project | 1     | V1 supports one active session per project; second active session is an error, not a new session |

### Input limits

| Limit                                | Value                       | Rationale                                                                                 |
| ------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------- |
| Max user message length (characters) | 2,000                       | Generous enough for a detailed description; prevents prompt injection via enormous inputs |
| Max user message length enforced     | Client-side AND server-side | Client enforcement is UX; server enforcement is security                                  |

### Context window sent to model

| Limit                                      | Value                            | Rationale                                                                                           |
| ------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Max messages sent to model per turn        | 20 (10 turns)                    | Last 10 turns is sufficient context for continuity; older history is in DB but not in model context |
| Max system prompt tokens (project context) | ~1,500 tokens                    | Covers project name, category, 10 tasks, 5 note titles; must not grow unbounded with project size   |
| Max tasks included in system prompt        | 10 (most recent by `updated_at`) | Caps context inflation for large projects                                                           |
| Max note titles included in system prompt  | 5 (most recent by `updated_at`)  | Note titles only, not content                                                                       |

### Concurrency

| Limit                                  | Value | Rationale                                                                           |
| -------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| Max concurrent active streams per user | 1     | Prevents duplicate requests; enforced by disabling the send button during streaming |

---

## 4. Enforcement Mechanism (V1)

### Implementation approach: DB-counted check

The simplest and most auditable approach for V1 is a database-counted check in the API route handler, before the model is called.

```
POST /api/copilot/[projectId]/chat

Step 1: requireAuth() — get user
Step 2: Validate project ownership
Step 3: Rate limit check:
  COUNT copilot_messages
  WHERE owner_id = user.id
    AND role = 'user'
    AND created_at >= NOW() - INTERVAL '24 hours'
  IF count >= 30 THEN
    return 429 { error: 'rate_limit_exceeded', resetAt: <timestamp> }
  END
Step 4: proceed with model call
```

**Why DB-counted:**

- Works without any external infrastructure (no Redis, no edge middleware)
- Consistent with how the rest of the repo handles data (Supabase, server-side)
- Auditable — the counts are derivable from the same `copilot_messages` table that stores history
- Fast enough for this use case (one SELECT COUNT before each model call)

**Why NOT edge middleware or Redis for V1:**

- Over-engineering for an initial launch with unknown traffic patterns
- No Redis is installed; adding it for rate limiting alone is scope creep
- Edge middleware rate limiting doesn't have access to Supabase auth session easily
- DB count adds ~5–10ms to the request, which is invisible compared to model latency

### Per-hour sub-limit

A second COUNT query for the per-hour limit:

```sql
SELECT COUNT(*) FROM copilot_messages
WHERE owner_id = $user_id
  AND role = 'user'
  AND created_at >= NOW() - INTERVAL '1 hour'
```

If this count >= 15, return 429 with `resetAt` set to the oldest message timestamp in the window + 1 hour.

---

## 5. Fallback Behavior When Limits Are Exceeded

### API response

```json
HTTP 429 Too Many Requests

{
  "error": "rate_limit_exceeded",
  "message": "You have reached the message limit for this period.",
  "limitType": "daily",
  "resetAt": "2026-03-07T00:00:00Z"
}
```

### Client behavior

- The `ContextCopilotClient.tsx` catches the 429 response
- The input bar is disabled with a clear message: "Daily message limit reached. Resets at [time]."
- No `MutationErrorDialog` is shown (this is an expected state, not a mutation error)
- The message the user typed is NOT lost — it remains in the input field so they can send it later
- No Sentry alert is triggered for 429 (this is expected, not an error)

### Sentry alerts for genuine abuse

- Log to Sentry if a user hits the hourly limit more than 3 times in a single day (unusual pattern)
- This is for monitoring, not for blocking — the standard 429 response already blocks

---

## 6. Input Sanitization at the API Boundary

Before rate limit check or model call, apply these input guards in the route handler:

| Check                                           | Enforcement                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `sessionId` is a valid UUID                     | Reject with 400 if malformed                                                  |
| `projectId` matches the URL param               | Reject with 400 if mismatch                                                   |
| User message content length <= 2,000 chars      | Reject with 400 if exceeded                                                   |
| Messages array length <= 20                     | Reject with 400 if exceeded (defense against client sending too much history) |
| No `<script>` or HTML injection in user message | Strip HTML tags before sending to model (not blocking, just sanitizing)       |

These are server-side checks. Client-side validation is also added for UX (character counter in `CopilotInputBar`), but server validation is the authoritative check.

---

## 7. Token Budget in Context Assembly

`lib/copilot/context.ts` must enforce a token budget. Approximate token counts for context components:

| Component                                       | Approx. tokens  | Cap                               |
| ----------------------------------------------- | --------------- | --------------------------------- |
| System prompt base (role, instructions, format) | ~400            | Fixed                             |
| Project name + category + notes field           | ~100            | Truncate notes field at 200 chars |
| Task list (title + status per task)             | ~30 per task    | Max 10 tasks = ~300 tokens        |
| Note titles                                     | ~15 per title   | Max 5 titles = ~75 tokens         |
| **Total system prompt budget**                  | **~875 tokens** | **Hard cap at 1,500 tokens**      |

If a project has more than 10 tasks, include the 10 most recently updated tasks (by `updated_at DESC`). Do not include task `notes` field — titles and status only.

If a project's `notes` field (the project-level notes textarea) is very long, truncate it at 300 characters with `...` appended.

---

## 8. Observability

### Metrics to track (via Sentry or logs)

- Daily message count per user (aggregate from `copilot_messages` table)
- 429 rate per day (track how often limits are hit)
- Average token count per request (from `copilot_messages.token_count` when populated)
- P95 response latency for the streaming route

### Alerts to configure

| Alert                                    | Threshold       | Action                                     |
| ---------------------------------------- | --------------- | ------------------------------------------ |
| Single user > 28 messages in 24h         | Near limit      | Log — monitor for abuse                    |
| System prompt token count > 1,200 tokens | Approaching cap | Log — review `buildProjectContext`         |
| Route handler error rate > 1%            | Spike           | Sentry alert — review model errors         |
| 429 response count per hour > 50         | Spike           | Investigate — may indicate a script or bot |

---

## 9. Testing the Rate Limit

### Unit test: rate limit logic

- Test that a user with 29 messages in the past 24h is allowed through (count < 30)
- Test that a user with 30 messages in the past 24h receives 429 (count >= 30)
- Test that messages older than 24h are not counted

### Integration test: API route

- Mock `copilot_messages` count to return 30 → verify route returns 429
- Mock count to return 29 → verify route proceeds to model call
- Send a message with 2,001 characters → verify route returns 400

### Do not test with live model calls

Rate limit tests must use a mocked AI SDK to avoid real model invocations. The test boundary is at the rate limit check — if the check blocks correctly, the model call never happens regardless.

---

## 10. What Belongs in V1 vs. Later

### V1 (required at launch)

- [x] Per-user daily message limit (30 messages / 24h) — DB-counted in route handler
- [x] Per-user hourly sub-limit (15 messages / hour) — DB-counted in route handler
- [x] Max user message length: 2,000 characters — client + server
- [x] Max history window to model: 20 messages — enforced in route handler before SDK call
- [x] System prompt token budget: max ~1,500 tokens — enforced in `buildProjectContext`
- [x] Input guard: session ID, project ID, message array size — enforced in route handler
- [x] Client-side: send button disabled during active stream — enforced in `CopilotInputBar`
- [x] 429 response with `resetAt` timestamp — route handler
- [x] User-facing message on rate limit — `ContextCopilotClient.tsx`

### Post-V1

- [ ] Per-project daily message cap (separate from per-user)
- [ ] Token-based billing tracking (store `token_count` in `copilot_messages` and aggregate)
- [ ] Admin dashboard for usage monitoring
- [ ] Redis-based rate limiting for scale (if DB-counted becomes a bottleneck)
- [ ] Soft warning at 80% of daily limit ("You have 6 messages remaining today")
- [ ] Subscription-tier-based limits (free: 10/day, pro: 100/day)
