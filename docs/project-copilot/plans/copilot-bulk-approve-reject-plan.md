# Project Copilot: Bulk Approve and Bulk Reject

**Created:** 2026-03-06  
**Status:** Planning  
**Goal:** Add soft, clean UI options "Approve all" and "Reject all" for the proposals attached to an assistant message, so the user can approve or reject all pending proposals in one action instead of clicking each card.

**Scope:** Bulk actions apply to **every** pending proposal on that message, regardless of type — today (tasks, notes, milestones, delete*\*, update*\*) and any **future** proposal types (e.g. readings, links to link vault). The implementation is type-agnostic and future-proof.

---

## 1. Type-agnostic and future-proof

- **All current types:** "Approve all" / "Reject all" work for every kind of proposal the Copilot can suggest today: **tasks**, **notes**, **milestones**, and **mutations** (delete_milestone, update_milestone, delete_task, update_task, delete_note, update_note). There is no special case per type — we iterate over all pending proposals for the message and call the same `approveProposal(proposalId)` / `rejectProposal(proposalId)`. The server (and RPC or action) already dispatches by `proposal.type` and payload.
- **Future types:** When you add new proposal types (e.g. **readings** — blogs, documentation — or **links** that get added to the link vault module), you will:
  - Add the new type to the schema, parser, and approve flow on the server.
  - Add a card variant in `CopilotProposalCard` to render that type.
  - **No change to bulk approve/reject:** the bulk handlers only care about "pending proposals for this message". New types stored in `copilot_proposals` with status `pending` are automatically included in "Approve all" and "Reject all".
- So the plan aligns with your idea: one bulk UX that covers existing and coming proposal types.

---

## 2. Current behavior

- Each assistant message can have multiple proposals (task, note, milestone, delete*\*, update*\*).
- Each proposal is rendered as a `CopilotProposalCard` with individual "Approve" and "Reject" buttons.
- `ContextCopilotClient` holds `proposalsByMessage: Record<string, CopilotProposal[]>` and provides `handleApprove(proposalId)` and `handleReject(proposalId)`.
- On approve/reject, the server action runs and the client updates local state (proposal status) for that proposal id.

---

## 3. Desired behavior

- When an assistant message has **two or more pending** proposals, show a compact row above the proposal cards with:
  - **"Approve all"** — approves every pending proposal for that message (same as clicking Approve on each).
  - **"Reject all"** — rejects every pending proposal for that message.
- UI: clean and soft (e.g. small text or outline buttons, not dominant). Only show when there are at least 2 pending proposals.
- While a bulk action is in progress: disable the bulk buttons and optionally show a short "Approving…" / "Rejecting…" state; optionally disable individual card buttons for that message to avoid mixed state.
- If "Approve all" fails on one proposal (e.g. server error), stop and show the error; the proposals already approved in that bulk run remain approved (no rollback). Optionally: continue with the rest and report "X approved, 1 failed" — for simplicity the plan recommends **stop on first failure** and surface the error.

---

## 4. Implementation plan

### 4.1. ContextCopilotClient — bulk handlers

**File:** `app/context/[projectId]/copilot/ContextCopilotClient.tsx`

- Add **handleApproveAll(messageId: string):**
  - Get `proposals = proposalsByMessage[messageId]` and filter to `status === 'pending'`.
  - If length is 0, return.
  - Loop through each proposal id (e.g. `for (const p of pending) { const result = await approveProposal(p.id); if (result.error) return { error: result.error }; then update local state for p.id to approved }`).
  - Use the same state update pattern as single approve: `setProposalsByMessage(prev => ...)` updating each proposal in that message to `status: 'approved'` and `created_entity_id` when available.
  - On first `approveProposal` error, return `{ error: result.error }` so the UI can show it and stop.

- Add **handleRejectAll(messageId: string):**
  - Get pending proposals for that message.
  - Loop: `await rejectProposal(p.id)`, then update local state for that proposal to `status: 'rejected'`.
  - On first failure (rejectProposal returns false), stop and optionally set an error state or return.

- Optional: **bulkInProgress** state (e.g. `bulkActionMessageId: string | null`) so the UI can disable buttons and show loading. Set before loop, clear after loop (and on error).

- Pass **onApproveAll** and **onRejectAll** (and optionally a loading flag per message) down to `CopilotChatWindow`.

### 4.2. CopilotChatWindow — bulk UI

**File:** `components/context/copilot/CopilotChatWindow.tsx`

- For each assistant message that has proposals, compute:
  - `proposals = proposalsByMessage[msg.id] ?? []`
  - `pendingCount = proposals.filter(p => p.status === 'pending').length`
- When **pendingCount >= 2**, render a small **toolbar row** above the list of cards:
  - Left (or center): two buttons side by side:
    - **"Approve all"** — primary outline or soft primary (e.g. `variant="outline"` or `variant="secondary"`), small (e.g. `size="sm"`), with CheckCircle2 icon. Calls `onApproveAll(msg.id)`.
    - **"Reject all"** — destructive outline or soft destructive, same size, with XCircle icon. Calls `onRejectAll(msg.id)`.
  - Right: optional label like "X proposals" (not required for MVP).
- While a bulk action is in progress for this message (parent passes e.g. `bulkActionMessageId === msg.id`), disable both bulk buttons and show "Approving…" or "Rejecting…" (text or spinner). Optionally disable individual Approve/Reject on each card for this message during bulk.
- Align the toolbar with the cards (e.g. same left margin as the proposal cards — `ml-11` or whatever the cards use so it lines up with the message content).

### 4.3. Props and types

- **CopilotChatWindow** new props:
  - `onApproveAll: (messageId: string) => Promise<{ error?: string }>`
  - `onRejectAll: (messageId: string) => Promise<void>`
  - Optional: `bulkActionMessageId: string | null` (when set, that message’s bulk buttons show loading and are disabled).
- **ContextCopilotClient:** Implement and pass the two handlers and the optional loading state.

### 4.4. i18n

**Files:** `locales/en.json`, `locales/es.json`

- Under `copilot`:
  - **approve_all:** "Approve all" / "Aprobar todo"
  - **reject_all:** "Reject all" / "Rechazar todo"
  - Optional: **approving_all:** "Approving…" / "Aprobando…"
  - Optional: **rejecting_all:** "Rejecting…" / "Rechazando…"

### 4.5. Error handling

- If **Approve all** fails on the Nth proposal, show the error (e.g. in the same way as single approve — CopilotProposalCard or a small toast/banner). The first N−1 are already approved; no automatic rollback. User can retry the failed one individually or leave it.
- If **Reject all** fails (e.g. network), optionally show a short message; the already-rejected ones stay rejected.

### 4.6. Accessibility and UX

- Buttons: `aria-label` with the same text as visible label (e.g. "Approve all").
- Avoid double submission: disable "Approve all" and "Reject all" while either bulk action is in progress for that message.

---

## 5. File checklist

| File                                                       | Action                                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/context/[projectId]/copilot/ContextCopilotClient.tsx` | Add `handleApproveAll(messageId)`, `handleRejectAll(messageId)`. Optional: `bulkActionMessageId` state. Pass `onApproveAll`, `onRejectAll`, and optionally `bulkActionMessageId` to CopilotChatWindow.                                               |
| `components/context/copilot/CopilotChatWindow.tsx`         | For each message with proposals, if pendingCount >= 2, render toolbar with "Approve all" and "Reject all" above the cards. Wire to `onApproveAll(msg.id)` and `onRejectAll(msg.id)`. Disable and show loading when `bulkActionMessageId === msg.id`. |
| `locales/en.json`                                          | Add `copilot.approve_all`, `copilot.reject_all` (and optionally approving_all, rejecting_all).                                                                                                                                                       |
| `locales/es.json`                                          | Same keys with Spanish text.                                                                                                                                                                                                                         |

---

## 6. Success criteria

- When an assistant message has 2+ pending proposals, "Approve all" and "Reject all" appear above the cards.
- Clicking "Approve all" approves every pending proposal for that message (server + local state); on first error, stop and show error.
- Clicking "Reject all" rejects every pending proposal for that message.
- UI is compact and soft (small buttons, no heavy styling).
- When there is only 0 or 1 pending proposal, the bulk row is not shown (only individual card buttons).

---

## 7. References

- Current approve/reject: `ContextCopilotClient.tsx` — `handleApprove`, `handleReject`, `setProposalsByMessage`.
- Proposal cards: `CopilotChatWindow.tsx` — `proposalsByMessage[msg.id].map(...)`, `CopilotProposalCard`.
- Server actions: `approveProposal(proposalId)`, `rejectProposal(proposalId)` in `app/context/[projectId]/copilot/actions.ts`.
