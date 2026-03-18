# Optimistic UI — Realtime-Ready Patterns

Research on making optimistic UI patterns future-proof for Supabase Realtime,
and production-grade error/pending state handling.

This codebase is React 18 / Next.js 14. `useOptimistic` (React 19 only) is
documented for future reference. The correct current patterns are highlighted.

---

## 1. The conflict between optimistic state and Realtime events

### The problem

When Supabase Realtime is active, two sources update the same list state:

1. Local optimistic mutations (user's own actions)
2. Realtime subscription events (another user's actions)

If both sources write to the same `useState`:

```
User A: clicks "Add note"         → setNotes(prev => [tempNote, ...prev])  (optimistic)
User B: adds a note at same time  → setNotes([...serverNotes])             (Realtime event)
```

The Realtime event overwrites the full array and the optimistic item disappears.

### The safe pattern (React 18)

Keep the Realtime event handler narrow — it should only add, update, or remove the
specific item from the event, never replace the full list:

```ts
// ✅ CORRECT — Realtime handler modifies list surgically
.on('postgres_changes', { event: 'INSERT', ... }, (payload) => {
  setNotes(prev =>
    prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]
  );
})

// ❌ WRONG — Realtime handler replaces whole list, nukes optimistic items
.on('postgres_changes', ..., () => {
  router.refresh(); // RSC re-renders, whole list comes from server without temp item
})
```

The dedup guard (`prev.some(n => n.id === payload.new.id)`) is the key:

- If the optimistic item has already been replaced by the real row (same id), skip
- If it's a genuinely new item from another user, add it

This pattern is already documented in `docs/research/realtime-connection-lifecycle.md`.
This file documents WHY it matters architecturally.

---

## 2. Updater functions are mandatory for Realtime-safe mutations

When Realtime events can arrive at any time, a mutation handler that closes over
`notes` instead of using the updater form is always wrong:

```ts
// ❌ WRONG in a Realtime-active app
const handleDelete = async (id) => {
  const deleted = notes.find((n) => n.id === id); // captured stale closure
  setNotes(notes.filter((n) => n.id !== id)); // operates on possibly-stale array
  const { error } = await deleteNote(id);
  if (error) setNotes([deleted, ...notes]); // stale notes on rollback
};

// ✅ CORRECT — always uses latest committed state
const handleDelete = async (id) => {
  let deletedItem: Note | undefined;
  setNotes((prev) => {
    deletedItem = prev.find((n) => n.id === id);
    return prev.filter((n) => n.id !== id);
  });
  const { error } = await deleteNote(id);
  if (error && deletedItem) {
    setNotes((prev) => [
      deletedItem!,
      ...prev.filter((n) => n.id !== deletedItem!.id),
    ]);
  }
};
```

This matters even without Realtime — React 18 batching can cause closures to be
stale if two mutations fire in the same tick. With Realtime it becomes essential.

**Audit:** search for `setNotes\|setLinks\|setBillings\|setBudgets\|setMilestones`
calls that capture list state from the closure rather than using `prev =>`.

---

## 3. Pending state — visual pattern

### Rule

Mark in-flight items with a `pending: true` flag. Never remove them.

```ts
// ✅ CORRECT — item stays visible, marked pending
const handleCreate = async (title) => {
  const tempId = `temp-${crypto.randomUUID()}`;
  setNotes((prev) => [
    { id: tempId, title, pending: true, ...defaults },
    ...prev,
  ]);

  const { data, error } = await createNote(projectId, title);

  if (error) {
    setNotes((prev) => prev.filter((n) => n.id !== tempId)); // rollback
    setMutationError(error);
    return;
  }
  setNotes((prev) => prev.map((n) => (n.id === tempId ? data : n))); // commit real row
};
```

```tsx
// In JSX — pending items render at reduced opacity with interaction disabled
<NoteRow
  note={note}
  className={note.pending ? 'opacity-50 pointer-events-none' : ''}
/>
```

### When a Realtime INSERT echo arrives for an optimistically-inserted item

The dedup guard handles it: `prev.some(n => n.id === data.id)` — the real row was
already committed (replacing `tempId`), so the echo is skipped.

---

## 4. Rollback must restore to the pre-mutation state, not the original prop

### The problem

If Realtime events have arrived between when the component mounted and when the
mutation failed, rolling back to `initialNotes` (the prop) loses those intermediate
updates.

```ts
// ❌ WRONG — rolls back to stale initial data if Realtime events arrived
const handleUpdate = async (id, changes) => {
  const original = initialNotes.find((n) => n.id === id); // stale
  setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...changes } : n)));
  const { error } = await updateNote(id, changes);
  if (error) setNotes(initialNotes); // loses any Realtime-applied changes
};

// ✅ CORRECT — captures current state from the updater, rolls back surgically
const handleUpdate = async (id, changes) => {
  let originalItem: Note | undefined;
  setNotes((prev) => {
    originalItem = prev.find((n) => n.id === id);
    return prev.map((n) => (n.id === id ? { ...n, ...changes } : n));
  });
  const { error } = await updateNote(id, changes);
  if (error && originalItem) {
    setNotes((prev) => prev.map((n) => (n.id === id ? originalItem! : n)));
  }
};
```

This is the correct rollback pattern regardless of Realtime. It captures `original`
inside the updater where it has access to the current committed state, then uses it
for precise rollback.

---

## 5. Distinguish pending vs failed state visually

| State           | Cause                       | Visual                   | Interaction                    |
| --------------- | --------------------------- | ------------------------ | ------------------------------ |
| `pending: true` | Request in-flight           | 50% opacity              | Disabled (pointer-events-none) |
| `error: true`   | Request failed, rolled back | Red border or error text | Enabled (user can retry)       |
| Normal          | Committed server state      | Full opacity             | Enabled                        |

### In practice

Currently ClearQueue shows `MutationErrorDialog` for failures (correct). The pending
visual is handled differently per module — some show a loading state on the submit
button, some show the item optimistically with no visual distinction.

**Recommendation:** Standardize on `opacity-50 pointer-events-none` for in-flight
creates, and the existing `MutationErrorDialog` for failures. Do not add `error: true`
flags to list items unless the design calls for inline error indicators.

---

## 6. Effects must not drive mutation responses

### The rule

Never route a mutation result through a `useEffect`. Set state directly in the
handler.

```ts
// ❌ WRONG — extra render cycle between save and dialog appearing
const [result, setResult] = useState(null);
const handleSave = async () => {
  setResult(await saveNote(data));
};
useEffect(() => {
  if (result?.error) openErrorDialog(result.error);
}, [result]);

// ✅ CORRECT — error dialog opens in same render as save failure
const handleSave = async () => {
  const { data, error } = await saveNote(noteData);
  if (error) {
    setMutationError(error); // dialog opens this render
    return;
  }
  setNote(data);
};
```

An effect adds a render cycle between the event and the response. On fast hardware
this is invisible. On slow devices or under React 18's concurrent rendering it
creates a visible delay or flash.

---

## 7. `useOptimistic` — for when the codebase upgrades to React 19

This section is for future reference when ClearQueue upgrades to Next.js 15 / React 19.

### What it adds over the current useState pattern

| Feature                | React 18 useState              | React 19 useOptimistic                       |
| ---------------------- | ------------------------------ | -------------------------------------------- |
| Optimistic update      | Manual `setItems(prev => ...)` | `addOptimistic(item)`                        |
| Rollback on error      | Manual: restore saved original | Automatic: reverts to base state             |
| Pending state tracking | Manual `isPending` flag        | Automatic while transition active            |
| Scoped to transition   | No — manual state management   | Yes — optimistic layer is separate from base |

### The reducer form is Realtime-safe

```ts
// React 19 — Realtime-safe with reducer
const [optimisticNotes, setOptimisticNote] = useOptimistic(
  notes, // base state — updated by Realtime subscription handler
  (current, newNote) => [newNote, ...current] // re-applied on every base state change
);
```

When a Realtime event updates `notes` (base state) while an optimistic create is
pending, the reducer re-applies the optimistic item on top of the new base state.
This is what prevents optimistic items from disappearing when another user's change
arrives mid-flight.

### Migration path from current React 18 pattern

The current `useState`-based optimistic handlers do not need to be rewritten when
upgrading. They continue to work. The `useOptimistic` migration can be done
per-component as a refactor, not a forced change.

---

## Quick reference

| Pattern                                             | Why                                     | Realtime impact                                                 |
| --------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| Use updater form `setX(prev => ...)` everywhere     | Prevents stale closures                 | **Required** — Realtime events arrive async                     |
| Dedup guard in every list update                    | Prevents duplicates                     | **Required** — both optimistic and Realtime write to same state |
| Capture `original` inside updater, not from closure | Correct rollback after Realtime changes | High                                                            |
| Mark in-flight items with `pending: true`           | Visual feedback without removal         | Medium                                                          |
| Set error state directly in handler, not in Effect  | Avoids extra render cycle               | Low                                                             |
| Never `setItems(serverData)` in Realtime handler    | Nukes in-flight optimistic items        | **Required**                                                    |
