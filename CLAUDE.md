# CLAUDE.md — Bootstrap for Claude Code

This file is read automatically by Claude Code at startup.
The two imports below load the full project rules and conventions.

@AGENTS.md
@CONVENTIONS.md

---

## Browser / Client-side APIs (CRITICAL)

### window.open() with async URL fetching

**Never** pre-open a blank window and navigate it after an `await`.

When `noopener` or `noreferrer` is in the features string, `window.open()` returns
`null` to the caller per the HTML spec. Setting `location.href` on that null reference
is a silent no-op — the tab opens blank and stays blank on every browser. On some
desktop browsers it triggers a Google search for `about:blank`.

**Wrong — will fail silently on every browser:**

```ts
// ❌ NEVER DO THIS
const win = window.open('', '_blank', 'noopener,noreferrer'); // win === null
const { url } = await fetchSignedUrl(id); // async — user gesture gone
win.location.href = url; // no-op, win is null
```

**Correct pattern 1 — URL is already known synchronously:**

```ts
// ✅ Single call, inside user gesture, URL already in hand
window.open(url, '_blank', 'noopener,noreferrer');
```

**Correct pattern 2 — URL requires an async fetch (e.g. Supabase signed URL):**

Create a Next.js API route that authenticates server-side and returns a 302 redirect.
The click handler opens the route URL synchronously — no async inside the gesture.

```ts
// app/api/resource/[id]/view/route.ts
export async function GET(_req, { params }) {
  const user = await getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  return NextResponse.redirect(data.signedUrl, 302);
}

// Component — one synchronous line, popup blocking impossible
const handleOpen = () => {
  window.open(`/api/resource/${id}/view`, '_blank', 'noopener,noreferrer');
};
```

**Real example in this repo:**
`app/api/documents/[fileId]/view/route.ts` + `components/context/documents/DocumentRow.tsx`
