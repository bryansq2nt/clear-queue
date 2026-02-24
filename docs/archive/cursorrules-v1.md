# CURSOR_RULES.md — ClearQueue rules for AI-assisted coding (Cursor/Codex)

This file defines how AI agents must operate in this repo.
It is subordinate to:

- AGENTS.md
- docs/engineering/CONVENTIONS.md

## Operating mode

- Plan-first. No code until a plan exists.
- Small diffs. One purpose per PR.
- Copy the “golden path” patterns; do not invent new architecture.
- If unsure, write an audit note in docs/audits/ and stop.

## Preflight checklist (required)

Before editing:

1. Identify the layer(s) touched (UI/Application/Domain/Infrastructure)
2. Identify repo reference implementation(s) to copy
   - Notes tab FromCache pattern
   - tasks/notes server actions patterns
   - MutationErrorDialog usage
3. List files to change
4. Define a test plan (Vitest and/or Playwright)
5. Identify DB impact:
   - schema? RLS? indexes? RPC?

## Hard rules (must obey)

### Separation of concerns

- No business rules in components/\*\*.
- Server actions coordinate use-cases; domain logic goes to lib/\*\*.
- Infrastructure changes go to supabase/migrations/** and lib/supabase/**.

### Security

- All server actions start with: const user = await requireAuth();
- Every query has explicit scope:
  - owner_id/user_id OR project_id (plus ownership)
- Never use Supabase browser client in components or \*Client files.

### Performance / N+1

- Never call DB per-item in a list loop.
- Prefer:
  - join/nested queries
  - RPC returning a table shape
  - views for read models
- Always select explicit columns.

### Mutations must be safe

- Multi-step writes must be atomic via RPC.
- On success: revalidatePath/revalidateTag for affected routes.
- On error: return typed { error } and keep UI consistent.

### Cache discipline

- React cache() only for pure reads.
- Never cache mutations.
- Context tabs must use Context<Tab>FromCache and pass onRefresh to Client.
- Do not rely on router.refresh() for context updates.

### UI/UX conventions

- Loading uses Skeleton components.
- Errors use MutationErrorDialog pattern (retry/cancel), not alert().
- Strings must use i18n keys.

### Tests required

- lib/\*\* changes: add Vitest tests.
- New tabs/modules: add Playwright happy-path.
- If you fix a bug found by E2E, add a lower-level test where feasible.

## Output format (required in every response/PR description)

1. Summary (what and why)
2. Files changed (list)
3. Risks / tradeoffs
4. How to test (step-by-step)
5. Follow-ups (if any)
