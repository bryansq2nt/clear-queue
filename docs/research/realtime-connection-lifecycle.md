# Supabase Realtime — Connection Lifecycle & Error Recovery

Research for Phase 2 implementation. All findings sourced from the installed packages
(`@supabase/realtime-js` v2.91.1, `@supabase/supabase-js`) in this repo — not from
docs alone. Where the source code disagrees with docs, the source code wins.

---

## 1. Channel status values

The four values passed to `.subscribe((status, err) => {})` — these are the only ones:

| Status          | Triggered by                                                                       |
| --------------- | ---------------------------------------------------------------------------------- |
| `SUBSCRIBED`    | Server replied `ok` and postgres_changes bindings match                            |
| `TIMED_OUT`     | Join push timed out after 10,000 ms                                                |
| `CLOSED`        | Server sent `phx_close`, or `unsubscribe()` completed, or `removeChannel()` called |
| `CHANNEL_ERROR` | Server rejected join, binding mismatch, JWT expiry, or transport error             |

There is no `CONNECTING` or `JOINING` callback state — those are internal library states only.

The subscribe callback fires **multiple times** across a channel's life — once per status
transition. Design handlers to be idempotent. On auto-rejoin after a network drop,
`SUBSCRIBED` will fire again on the same channel.

```ts
const channel = supabase
  .channel(`tasks-${projectId}`)
  .on('postgres_changes', { ... }, handler)
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') setIsLive(true)
    if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
      setIsLive(false)
      onRefresh() // fetch current state from DB — we may have missed events
    }
    if (status === 'CHANNEL_ERROR') {
      // err.message contains diagnostic text (best-effort, not stable API)
      console.error('[realtime]', err?.message)
    }
  })
```

---

## 2. CHANNEL_ERROR — common causes and how to read err.message

| Cause                              | `err.message` contains                          | Fix                                                            |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| RLS policy blocks user             | `"unauthorized"`                                | Add SELECT policy using `is_project_member()`                  |
| Table not in publication           | `"table not in publication"` or similar         | `ALTER PUBLICATION supabase_realtime ADD TABLE public.x`       |
| JWT expired / invalid              | Channel removed via `phx_error`, generic error  | Usually auto-handled (see §3); if persistent, recreate channel |
| postgres_changes binding mismatch  | `"mismatch between server and client bindings"` | Library/server version mismatch; retry usually resolves        |
| Transport error (network drop)     | Generic browser `Error` from WebSocket          | Auto-reconnects; no action needed                              |
| Heartbeat timeout (background tab) | `CLOSED` then `CHANNEL_ERROR`                   | Use `realtime: { worker: true }` (see §6)                      |

**Err.message is not a stable typed API** — treat it as diagnostic text only, not
something to switch on in production logic.

---

## 3. Auth session expiry — fully automatic, one edge case

### The normal case: zero code needed

`createClient()` from `@supabase/supabase-js` wires a listener internally:

```ts
// Inside supabase-js (you do NOT write this)
this.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    this.realtime.setAuth(session?.access_token);
    // ↑ pushes new token to ALL active channels immediately
  }
});
```

The auth client refreshes tokens 60 seconds before expiry by default. The new token is
pushed to all active channels automatically. **You do not need to write any token-refresh
code for Realtime in the standard case.**

### The edge case: long offline + JWT expiry

If the device is offline for longer than the JWT lifetime (1 hour default):

1. Token expires while offline — cannot refresh (needs network)
2. Server sends `phx_error` + `phx_close` for each channel
3. Channels are **removed from the client's internal channel list**
4. When device reconnects and `TOKEN_REFRESHED` fires, `setAuth()` iterates the channel
   list — but those channels are already gone
5. Channels remain permanently dead

**Fix — listen for TOKEN_REFRESHED and rebuild if channels are dead:**

```ts
supabase.auth.onAuthStateChange((event) => {
  if (event === 'TOKEN_REFRESHED') {
    // Give the auto-reconnect 2 seconds to recover normally,
    // then check if channels are actually alive
    setTimeout(() => {
      if (channelRef.current && !isChannelAlive(channelRef.current)) {
        rebuildSubscription();
      }
    }, 2000);
  }
});

function isChannelAlive(channel) {
  // channel._state is internal but readable
  return channel._state === 'joined';
}
```

For ClearQueue: users are unlikely to be offline for 1+ hours while a project is open.
The edge case is worth knowing but not worth complex code — if it happens, `onRefresh()`
on `CHANNEL_ERROR` gives them current data.

---

## 4. Reconnection behavior — automatic and layered

### WebSocket reconnection

The client reconnects with stepped intervals: `[1000, 2000, 5000, 10000]` ms, repeating
at 10 seconds. This is fully automatic and fires when the WebSocket drops for any reason
other than a manual `supabase.realtime.disconnect()` call.

### Channel rejoin after reconnection

After the socket reconnects, each channel has its own `rejoinTimer` that runs independently:

```
socket drops
  → each channel receives error event
  → each channel schedules rejoin via its own timer
  → when socket is back up, each channel calls _rejoinUntilConnected()
  → rejoins automatically
  → subscribe callback fires SUBSCRIBED again
```

**Practical result:** Brief network drops (a few seconds to a few minutes) self-heal
completely automatically. The subscribe callback fires `SUBSCRIBED` again after rejoin.
No code needed to handle this case — just make the `SUBSCRIBED` handler idempotent.

---

## 5. Background tab heartbeat problem and the fix

### The problem

Chrome/Edge throttle JavaScript timers (`setInterval`, `setTimeout`) for background tabs
hidden for 5+ minutes — down to once per minute. The Realtime heartbeat fires every 25
seconds. When throttled, the server kills the channel after 60 seconds without a heartbeat.
The client misses all events that occurred while disconnected.

### The fix: Web Worker heartbeat

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        worker: true, // ← heartbeat runs in a Web Worker, not subject to throttling
      },
    }
  );
}
```

The Web Worker runs in its own thread independent of the page visibility state.
This is the current official fix and the recommended approach for any production app
that uses Realtime.

### Belt-and-suspenders: refetch on visibility regain

Even with the Web Worker, it is good practice to refetch on tab visibility regain in
case events were missed during any disconnection window:

```ts
// In any *Client.tsx that has a Realtime subscription
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      onRefresh(); // refetch from DB; dedup guard prevents duplicates
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () =>
    document.removeEventListener('visibilitychange', handleVisibility);
}, [onRefresh]);
```

This is safe because:

- On refetch, the server returns current state
- Any items already in local state are deduped when Realtime echoes them
- The user always sees correct data regardless of what happened while the tab was hidden

---

## 6. One channel per project vs. one channel per component

**Use one channel per project per tab — not one per component.**

A single channel can subscribe to multiple tables and multiple event types by chaining:

```ts
const channel = supabase
  .channel(`project-${projectId}`) // one channel for the whole project
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tasks',
      filter: `project_id=eq.${projectId}`,
    },
    handleTask
  )
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'notes',
      filter: `project_id=eq.${projectId}`,
    },
    handleNote
  )
  .subscribe();
```

Reasons:

- Hard limit of **100 channels per connection** (all plans except Enterprise)
- One WebSocket join message vs. many — faster subscription
- Token updates pushed once instead of N times
- `supabase.channel(sameName)` returns the same instance if topic matches — safe to call
  multiple times, but easier to hold a single ref

**For ClearQueue:** Each context tab page is a separate component. Do NOT create one
channel per tab component — the user could have many tabs visible at once. Create one
channel per project in a shared context or in the root layout client for that project,
or create one channel per tab that subscribes only to its own table.

Given the existing architecture (each `*Client.tsx` is independent, there is no shared
project-level client component), the practical choice is one channel per tab, each
subscribing only to its own table. At most 13 tabs open = 13 channels. Well within limit.

---

## 7. Cleanup — what removeChannel actually does

```ts
// CORRECT — full cleanup
return () => {
  supabase.removeChannel(channel);
};

// WRONG — channel stays in the client's internal list; TooManyChannels over time
return () => {
  channel.unsubscribe();
};
```

| Method                            | Effect                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `channel.unsubscribe()`           | Sends `phx_leave` to server. Does NOT remove from client's channel list.         |
| `supabase.removeChannel(channel)` | Calls `unsubscribe()` + removes from list + disconnects socket if list is empty. |
| `supabase.removeAllChannels()`    | `unsubscribe()` all + clear list + disconnect.                                   |

**`removeChannel` is safe to call multiple times** — if the channel was already removed
from the list, the second call silently does nothing.

**`removeChannel` before subscription completes** — safe. The pending join push is
cancelled, a leave push is sent, and it resolves immediately to `ok`.

**React StrictMode double-invoke** — works correctly. The first cleanup removes the
channel from the list. The second mount creates a fresh channel (because the topic is
no longer in the list). No duplicate subscriptions.

---

## 8. Error UI pattern for ClearQueue

The recommended pattern is a live status indicator — non-blocking, auto-recovers:

```ts
// In each *Client.tsx with a Realtime subscription
const [isRealtimeLive, setIsRealtimeLive] = useState(false)

const channel = supabase
  .channel(`notes-${projectId}`)
  .on('postgres_changes', { ... }, handler)
  .subscribe((status) => {
    const live = status === 'SUBSCRIBED'
    setIsRealtimeLive(live)
    if (!live) {
      onRefresh() // fetch current state — may have missed events while disconnected
    }
  })
```

**In the UI** (optional — only add if there is a clear place for it):

```tsx
{
  !isRealtimeLive && (
    <span className="text-xs text-muted-foreground">● Syncing…</span>
  );
}
```

**What to avoid:**

- `alert()` or blocking dialog for connection failures — they are transient
- Stopping the app or requiring a page reload
- Silently not refreshing data after a disconnect — user may be looking at stale state

---

## Quick reference

```ts
// Create client with Web Worker heartbeat (prevents background tab disconnects)
createBrowserClient(url, key, { realtime: { worker: true } })
  // Subscribe with status tracking
  .subscribe((status, err) => {
    setIsLive(status === 'SUBSCRIBED');
    if (status !== 'SUBSCRIBED') onRefresh(); // always refetch on disconnect
    if (status === 'CHANNEL_ERROR') console.error(err?.message); // diagnostic only
  });

// Cleanup — always removeChannel, never just unsubscribe()
return () => {
  supabase.removeChannel(channel);
};

// One channel per tab (subscribes to one table) — fine for 13 tabs
// One channel per project (subscribes to all tables) — also fine, more efficient

// Refetch on visibility regain (belt-and-suspenders for background tabs)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onRefresh();
});

// CHANNEL_ERROR causes: RLS missing, table not in publication, JWT expired, network
// Auto-reconnect: YES (socket + channel, layered timers, no code needed)
// Token refresh: YES (automatic via supabase-js auth listener, no code needed)
// Long offline (>1hr) + JWT expiry: channels may die, rebuild on TOKEN_REFRESHED
```
