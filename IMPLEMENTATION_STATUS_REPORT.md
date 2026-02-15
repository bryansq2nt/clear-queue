# Implementation Status Report

**Generated:** 2025-02-15  
**For:** Claude (AI architecture advisor)  
**From:** Cursor (AI implementation assistant)

---

## Executive Summary

We implemented architectural guardrails and documentation to address technical debt and prevent recurring anti-patterns. The work falls into three areas: (1) **quality gates and enforcement** — custom ESLint rules, Husky pre-commit hooks, and a GitHub Actions workflow; (2) **documentation for Cursor** — pattern docs in `docs/patterns/`, copy-paste templates in `templates/`, and a `.cursorrules` file; (3) **validation** — ESLint has been run and confirms the rules fire; pre-commit and CI are configured but existing code has not been fixed yet.

**Current state:** The enforcement layer is in place and working. Running `npx eslint app/ components/` reports **72 errors** (no-client-supabase-in-components, no-select-star, no-manual-refetch-after-action). So the rules correctly flag existing violations. No legacy anti-patterns have been refactored yet; the focus was prevention and detection first. Pre-commit (lint-staged + typecheck + format:check) and CI (Quality Gates workflow) are set up; branch protection to block merge on failure is a manual step in GitHub.

**What's working well:** Custom ESLint rules run and fail the build as intended. Pattern docs and templates are complete and aligned with the rules. `.cursorrules` gives Cursor explicit instructions. The test file `app/EslintRulesViolationsClient.tsx` demonstrates all three rules.

**What still needs work:** Fixing the 72 existing violations across the codebase, enabling branch protection so PRs cannot merge when the workflow fails, and optionally addressing Prettier format issues (211 files reported by `format:check`) so pre-commit passes on a normal commit.

---

## Part 1: Quality Gates & Enforcement (Phase 0)

### 1.1 ESLint Custom Rules

**Status:** ✅ IMPLEMENTED

**What we did:**

We added a local ESLint plugin `eslint-plugin-clear-queue` with three custom rules and wired it in `.eslintrc.js`. The plugin is installed via `"eslint-plugin-clear-queue": "file:./eslint-plugin-clear-queue"` in package.json.

**Files created/modified:**

- `.eslintrc.js` — config that loads the plugin and enables the rules (overrides for rule 1)
- `eslint-plugin-clear-queue/package.json` — package manifest for the local plugin
- `eslint-plugin-clear-queue/index.js` — exports the three rules
- `eslint-plugin-clear-queue/rules/no-client-supabase-in-components.js`
- `eslint-plugin-clear-queue/rules/no-select-star.js`
- `eslint-plugin-clear-queue/rules/no-manual-refetch-after-action.js`
- `app/EslintRulesViolationsClient.tsx` — intentional violations file for testing

**Rules implemented:**

```javascript
// .eslintrc.js
module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
  plugins: ['clear-queue'],
  rules: {
    'react-hooks/exhaustive-deps': 'error',
    'react/no-unescaped-entities': 'error',
    '@next/next/no-html-link-for-pages': 'error',
    'clear-queue/no-select-star': 'error',
    'clear-queue/no-manual-refetch-after-action': 'error',
  },
  overrides: [
    {
      files: ['components/**/*.{ts,tsx}', 'app/**/*Client.tsx'],
      rules: {
        'clear-queue/no-client-supabase-in-components': 'error',
      },
    },
  ],
};
```

**How to verify it works:**

```bash
npx eslint app/ components/
```

**Expected output:**

ESLint exits with code 1 and reports 72 errors across multiple files. Example:

```
/Users/.../app/EslintRulesViolationsClient.tsx
  17:20  error  Do not use createClient() in client components...  clear-queue/no-client-supabase-in-components
  18:52  error  Avoid .select('*')...                                clear-queue/no-select-star
  26:9   error  Avoid calling await load*() after a server action... clear-queue/no-manual-refetch-after-action
...
✖ 72 problems (72 errors, 0 warnings)
```

**Evidence of functionality:**

Running the command above produces exactly that: 72 errors. The three rules fire as intended. `app/EslintRulesViolationsClient.tsx` is kept on purpose to trigger all three; the rest are real violations in the codebase.

**Blockers/Issues:**

None. The plugin is linked via `npm install`; no blockers. Legacy code has not been updated, so lint fails until violations are fixed or the intentional test file is excluded from lint.

---

### 1.2 Pre-commit Hooks

**Status:** ✅ IMPLEMENTED

**What we did:**

Husky is used for Git hooks. The `prepare` script runs `husky` so hooks are installed on `npm install`. The pre-commit hook runs: (1) `npx lint-staged` (ESLint on staged `.ts`/`.tsx`/`.js`/`.jsx` files), (2) `npm run typecheck`, (3) `npm run format:check`. If any step fails, the commit is blocked.

**Files created/modified:**

- `.husky/pre-commit` — script run on every commit
- `package.json` — added `prepare`, `typecheck`, `format`, `format:check`, and `lint-staged` config; added devDependencies husky, lint-staged, prettier
- `.prettierrc` — minimal config (semi, singleQuote, tabWidth, trailingComma)
- `.prettierignore` — ignores node_modules, .next, lockfiles, .env\*, etc.

**Hook configuration:**

```bash
#!/usr/bin/env sh
# Pre-commit: block commit if any of these fail

# 1. ESLint on staged files (fails on violations)
npx lint-staged

# 2. TypeScript type check
npm run typecheck

# 3. Prettier format check (fails if any file is not formatted)
npm run format:check
```

**Package.json additions:**

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": "eslint"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^15.4.3",
    "prettier": "^3.4.2"
  }
}
```

**How to verify it works:**

1. Run `git config core.hooksPath` — should show `.husky/_` (or equivalent).
2. Stage a file that has ESLint violations and run `git commit -m "test"` — commit should be blocked by lint-staged (ESLint).
3. Run `npm run typecheck` and `npm run format:check` locally — typecheck passes; format:check reports 211 files not formatted until `npm run format` is run.

**Evidence of functionality:**

User confirmed that after `npm install` and `npx husky`, `git config core.hookspath` returns `.husky/_`. Lint-staged runs (reports "No staged files found" when nothing is staged). Typecheck and format:check run; format:check fails until the repo is formatted.

**Blockers/Issues:**

Commits that include unstaged violations can still be made if only "clean" files are staged (lint-staged only runs ESLint on staged files). Full lint is enforced in CI. Prettier reports 211 files; until `npm run format` is run, format:check will block commits that touch those files.

---

### 1.3 CI/CD Quality Gates

**Status:** ✅ IMPLEMENTED

**What we did:**

Added a GitHub Actions workflow that runs on every pull request to `main` or `master`. It runs ESLint, TypeScript build (`npm run build`), and tests (`npm run test -- --run`). The workflow file includes a comment on how to require it as a status check before merge.

**Files created/modified:**

- `.github/workflows/quality-gates.yml`
- `README.md` — added Quality Gates badge at top (placeholder `OWNER/REPO` in URL)

**Workflow configuration:**

```yaml
# Runs on every PR. Require this workflow to pass before merge:
# Repo Settings → Branches → Branch protection → Require status checks → "Quality Gates" / "Lint, Build & Test"
name: Quality Gates
on:
  pull_request:
    branches: [main, master]
jobs:
  quality:
    name: Lint, Build & Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: ESLint
        run: npm run lint
      - name: TypeScript build
        run: npm run build
      - name: Tests
        run: npm run test -- --run
```

**Checks included:**

- [x] ESLint validation (`npm run lint`)
- [x] TypeScript compilation (via `npm run build`)
- [x] Tests (`npm run test -- --run`)

**How to verify it works:**

Open a PR targeting `main` or `master`. The "Quality Gates" (or "Lint, Build & Test") workflow should run. If the branch has the current 72 ESLint errors, the workflow will fail on the ESLint step.

**Evidence of functionality:**

Workflow file is present and valid. No PR was opened in this session to capture a run; user would need to push a branch and open a PR to see the run. Branch protection to block merge when the workflow fails must be enabled manually in repo Settings → Branches.

**Blockers/Issues:**

None for the workflow itself. Until the 72 ESLint violations (and optionally Prettier) are fixed, the workflow will fail on every PR. Branch protection is not set up by code; user must add a rule and require the "Quality Gates" / "Lint, Build & Test" status check.

---

## Part 2: Documentation for Cursor (Phase 1)

### 2.1 Pattern Library

**Status:** ✅ IMPLEMENTED

**What we did:**

Created three pattern docs under `docs/patterns/`: server-actions.md, database-queries.md, and transactions.md. Each has a "Why this matters" section, multiple "Do this" and "Don't do this" examples, and a quick-reference table at the end. Content aligns with the ESLint rules and the existing codebase (Next.js 14, Supabase, requireAuth, revalidatePath).

**Files created:**

```
docs/
├── patterns/
│   ├── server-actions.md
│   ├── database-queries.md
│   └── transactions.md
```

**Sample content from one pattern doc:**

```markdown
## Why this matters

- **Security**: Server actions run on the server with the server Supabase client...
- **Consistency**: All data mutations and auth-sensitive reads go through one path...
- **Cache and UX**: You can return data from actions, call `revalidatePath`...

## How to structure them

1. **File**: Co-locate with the feature (e.g. `app/projects/actions.ts`)...
2. **Directive**: Top of file: `'use server'`.
3. **Imports**: Use `createClient` from `@/lib/supabase/server` only...
```

**Coverage:**

- Server actions: ✅ (when to use, structure, 5 do / 5 don’t, cheat sheet)
- Database queries: ✅ (explicit fields, scoping by owner_id/project_id, 5 do / 5 don’t, annotated examples)
- Transactions/RPCs: ✅ (when to use RPC, BEGIN/COMMIT/exception, template, 5 do / 5 don’t)
- Optimistic locking: ✅ (covered in templates as optimistic-update.template.ts; transactions.md does not duplicate it)
- Other patterns: N/A

**How complete are these docs:**

They are substantive and ready for use: each doc is several hundred words with real code examples, tied to the stack (Next, Supabase, auth). They are not stubs.

---

### 2.2 Code Templates

**Status:** ✅ IMPLEMENTED

**What we did:**

Added three copy-paste templates under `templates/`: server-action.template.ts, rpc-function.template.sql, and optimistic-update.template.ts. Each includes TODO comments, example usage in comments, and is ready to copy and rename.

**Files created:**

```
templates/
├── server-action.template.ts
├── rpc-function.template.sql
└── optimistic-update.template.ts
```

**Sample template (excerpt):**

```typescript
// server-action.template.ts (excerpt)
'use server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

type ActionResult<T = unknown> =
  | { data: T; error?: never }
  | { data?: never; error: string };

export async function createThingAction(
  formData: FormData
): Promise<ActionResult<Thing>> {
  const user = await requireAuth();
  const supabase = await createClient();
  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };
  const { data, error } = await supabase
    .from('things')
    .insert({ name, owner_id: user.id })
    .select('id, name, owner_id, created_at')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return { data: data as Thing };
}
```

**How to use these templates:**

Copy the file into the target location (e.g. `app/<feature>/actions.ts`), rename types/functions/tables (thing → project, etc.), and adjust revalidatePath and table/column names. For RPC, run the SQL in a migration or SQL editor, then add a server action that calls `supabase.rpc(...)`.

**Integration with Cursor:**

Cursor does not auto-suggest these; they are referenced in `.cursorrules` ("Use templates/ for boilerplate"). The user or Cursor should open or paste from the template when starting a new action, RPC, or optimistic-update flow.

---

### 2.3 .cursorrules File

**Status:** ✅ IMPLEMENTED

**What we did:**

Created `.cursorrules` in the project root with instructions for database queries, server actions, and a "before generating code" section that tells Cursor to check `docs/patterns/`, use `templates/`, and follow CURSOR_RULES.md if present. No CURSOR_RULES.md exists yet.

**File location:**

`.cursorrules` in project root

**Content:**

```markdown
# Cursor AI — Project Rules

Follow these rules for all code generation and edits in this repo.

---

## Database Queries

- **ALWAYS** use explicit field selection (never `SELECT *` or `.select('*')`).
- **ALWAYS** scope by `project_id` when querying tasks.
- **ALWAYS** scope by `owner_id` or `user_id` when querying user-owned data.
- **ALWAYS** use RPC functions for multi-step operations that must be atomic.

---

## Server Actions

- **ALWAYS** use the `'use server'` directive in server action files.
- **ALWAYS** call `revalidatePath` (or `revalidateTag`) after mutations — never rely on manual refetch (e.g. no `load*()` after an action in the same handler).
- **NEVER** use `createClient()` from `@/lib/supabase/client` in components. Use server actions or server components with `@/lib/supabase/server` only.

---

## Before Generating Code

1. **Check** `docs/patterns/` for the relevant pattern (server-actions.md, database-queries.md, transactions.md).
2. **Use** `templates/` for boilerplate (server-action.template.ts, rpc-function.template.sql, optimistic-update.template.ts).
3. **Follow** CURSOR_RULES.md strictly when it exists in the repo.

**Reference `docs/patterns/` before every code generation.**
```

**How Cursor uses this:**

Cursor reads `.cursorrules` when it is in scope for the project; the instructions apply to code generation and edits in this repo.

**Effectiveness:**

When generating new server actions or queries, Cursor can follow the rules (e.g. 'use server', revalidatePath, explicit select, scoping). Effectiveness depends on the prompt and context; the rules are clear and the pattern docs back them up.

---

## Part 3: Validation & Testing

### 3.1 ESLint Validation Test

**Test performed:** ✅ YES

**Command run:**

```bash
npx eslint app/ components/
```

**Output (summary):**

ESLint exits with code 1. First few files:

```
app/EslintRulesViolationsClient.tsx
  17:20  error  ... clear-queue/no-client-supabase-in-components
  18:52  error  ... clear-queue/no-select-star
  26:9   error  ... clear-queue/no-manual-refetch-after-action
app/billings/BillingsPageClient.tsx
  52:20  error  ... no-client-supabase-in-components
  55:54  error  ... no-select-star
...
✖ 72 problems (72 errors, 0 warnings)
```

**Violations found:** 72  
**Files with issues:** 30+ (across app/ and components/, including the intentional EslintRulesViolationsClient.tsx).

---

### 3.2 Pre-commit Hook Test

**Test performed:** ✅ YES (by user)

**What we tried to commit:**

User ran `npx lint-staged` (no staged files → "No staged files found"), `npm run typecheck` (passed), and `npm run format:check` (reported 211 files with format issues).

**Result:**

Husky is configured; `git config core.hooksPath` returns `.husky/_`. Pre-commit runs the three steps. A commit that includes only formatted files and passes ESLint on those staged files would succeed; a commit that stages files with violations would be blocked by lint-staged.

**Evidence:** User shared terminal output showing husky running on `npm install` and the results of the three checks.

---

### 3.3 Cursor Code Generation Test

**Test performed:** ❌ NO

**Reason not tested:** No formal prompt was run in this session to "Create a server action to delete a task" or "Get all tasks for a project" and then assess the output against the checklist. The templates and .cursorrules were written so that future generation follows the patterns; we did not re-run generation tests for this report.

**Recommendation:** Claude or the user could run those prompts and fill in the "Generated code" and "Quality assessment" subsections in a future update.

---

## Part 4: Current Codebase State

### 4.1 Existing Code Fixes

**Have we fixed any existing anti-patterns yet?**

❌ NO

**Reason:** Focus was on prevention and detection: ESLint rules, hooks, CI, docs, and templates. Fixing the 72 existing violations is the next phase. No files were refactored to remove createClient from components, replace select('\*'), or remove manual refetch-after-action in this work.

---

### 4.2 Anti-pattern Inventory

**Commands run:**

```bash
# Check 1: Count .select('*') in app/ and components/
grep -r "\.select(['\"]\*['\"])" app/ components/ --include="*.ts" --include="*.tsx" | wc -l
# (Per-file grep was used; see below for totals.)

# Check 2: createClient in components and app *Client.tsx
# (Grep was run; see below.)

# Check 3: Manual refetch after action — ESLint reports these
# no-manual-refetch-after-action: 2 files (IdeaDrawer.tsx, IdeasDashboardClient.tsx)
```

**Results:**

- **SELECT \* instances (app + components):** 51 occurrences across 28 files (24 in app/, 4 in components/). Additional occurrences exist in lib/ (e.g. lib/idea-graph, lib/todo, lib/projects) but are not in the ESLint override for no-select-star; the rule runs on all files and reports every .select('\*').
- **createClient in components:** 9 component files contain createClient. **createClient in app \*Client.tsx:** 17 files. Total 26 files with client-side createClient usage (all flagged by no-client-supabase-in-components where the rule applies).
- **Double refresh / manual refetch patterns:** 2 files (app/ideas/IdeaDrawer.tsx, app/ideas/IdeasDashboardClient.tsx) reported by no-manual-refetch-after-action.

**Interpretation:**

The numbers reflect legacy code written before the rules existed. ESLint now catches all of these. The trend is not yet "decreasing" because no fixes have been applied; the next step is to fix violations (or exclude the intentional test file and then fix the rest) so that lint and CI pass.

---

## Part 5: What's Working Well

1. **Custom ESLint rules**
   - What: Three rules run and report 72 errors; they correctly flag createClient in client components, .select('_'), and await load_() after an action.
   - Evidence: `npx eslint app/ components/` exits 1 and lists all violations with rule IDs.

2. **Pre-commit and CI wiring**
   - What: Husky runs lint-staged, typecheck, and format:check on commit; GitHub Actions runs lint, build, and test on PRs.
   - Evidence: User confirmed hooks path; workflow file is in place and valid.

3. **Pattern docs and templates**
   - What: Three pattern docs and three templates are in place, with do/don’t examples and TODOs.
   - Evidence: Files exist and contain the structure described above.

4. **.cursorrules**
   - What: Clear, concise rules for queries, server actions, and "before generating code."
   - Evidence: File exists in root with the content shown in Part 2.3.

5. **Intentional violations file**
   - What: `app/EslintRulesViolationsClient.tsx` triggers all three rules for testing.
   - Evidence: ESLint output shows three errors on that file (one per rule).

---

## Part 6: What's Not Working / Blockers

1. **Lint fails on full codebase**
   - Problem: 72 ESLint errors so `npm run lint` and CI fail.
   - Impact: Cannot merge PRs with current state unless branch protection is off or lint is skipped.
   - Attempted solutions: None yet; fixes are planned as next phase.
   - Status: Open. Options: fix violations in batches, or temporarily exclude EslintRulesViolationsClient.tsx and then fix the rest.

2. **Prettier format:check fails**
   - Problem: 211 files reported by `prettier --check .`.
   - Impact: Pre-commit will block commits that touch unformatted files until they are formatted.
   - Attempted solutions: `.prettierrc` and `.prettierignore` are set; one-time `npm run format` would fix.
   - Status: Workaround is to run `npm run format` once; not yet done in this session.

3. **Branch protection not automated**
   - Problem: Requiring "Quality Gates" before merge is a manual GitHub setting.
   - Impact: PRs could be merged even if the workflow fails until the user enables branch protection.
   - Status: Documented in workflow comment and README; user must enable in repo Settings.

4. **CURSOR_RULES.md missing**
   - Problem: .cursorrules says "Follow CURSOR_RULES.md strictly when it exists"; file does not exist.
   - Impact: None currently; when added, it can hold stricter or additional rules.
   - Status: Optional; can be added later.

---

## Part 7: Next Steps Needed

### Immediate (This Week)

1. **Fix or isolate ESLint violations:** Either fix the 72 errors in batches (replace createClient usage in components with server actions/data from server, replace .select('_') with explicit columns, replace manual load_() after actions with router.refresh() or returned data) or exclude `app/EslintRulesViolationsClient.tsx` from lint so the count only reflects real code, then fix.
2. **Run Prettier once:** Execute `npm run format` so format:check passes and pre-commit does not block on formatting.
3. **Enable branch protection:** In GitHub repo Settings → Branches, add or edit a rule for main/master and require the "Quality Gates" (or "Lint, Build & Test") status check.

### Short-term (Next 2 Weeks)

1. **Refactor client components:** Remove createClient() from components and \*Client.tsx files by moving data fetching to server components or server actions and passing data as props or using returned action data.
2. **Replace select('\*'):** In app/, components/, and lib/, change every .select('\*') to an explicit column list (and nested selects where needed).
3. **Fix manual refetch pattern:** In IdeaDrawer.tsx and IdeasDashboardClient.tsx, use router.refresh() or data returned from the action instead of calling load\*() after the action.
4. **Optional:** Add CURSOR_RULES.md for any extra rules or clarifications.

### Questions for Claude

1. **Priority:** Should we fix ESLint violations first (so CI is green) or add CURSOR_RULES.md and more docs first?
2. **Scope of select('\*') fixes:** The rule runs on all files; lib/ (e.g. lib/idea-graph, lib/todo) also has .select('\*'). Should we fix those in the same pass as app/ and components/, or treat lib as a separate phase?
3. **RPC adoption:** We documented and templated RPCs for multi-step operations but did not convert any existing multi-step logic to RPC. Should we identify 1–2 high-value flows to migrate first, or keep RPC for new code only for now?

---

## Part 8: Evidence & Artifacts

### Screenshots

None captured in this session.

### Log Files

- ESLint output: run `npx eslint app/ components/ 2>&1` to reproduce the 72-error output.
- Pre-commit: run `npx lint-staged`, `npm run typecheck`, `npm run format:check` to reproduce.

### Test Results

- ESLint: 72 errors, 0 warnings (exit code 1).
- TypeScript: `npm run typecheck` passes (tsc --noEmit).
- Prettier: `npm run format:check` reports 211 files with code style issues until format is run.

---

## Part 9: Honest Self-Assessment (Cursor's Perspective)

**What I think is working well:** The ESLint plugin is correctly implemented and integrated; the three rules do what they were designed to do. The docs and templates are consistent with the rules and the stack. .cursorrules is short and actionable. The pre-commit and CI setup is standard and should be reliable once violations and format are addressed.

**What I'm uncertain about:** Whether Cursor will consistently reference docs/patterns/ and templates/ without an explicit user prompt ("use the server action template"). The .cursorrules say to reference docs/patterns/ before every code generation, but that depends on the model and context window. I'm also not 100% sure that every edge case in the codebase (e.g. auth callback components that may need client Supabase for auth only) is correctly handled by the no-client-supabase rule or whether we need an escape hatch.

**What I think needs improvement:** The codebase still has 72 violations; until those are reduced, the guardrails are "detection only." A small README or CONTRIBUTING section that points to docs/patterns and templates would help humans and AI. The Quality Gates workflow could optionally run only on changed files for speed (e.g. lint-staged in CI) once the repo is clean, but that's an optimization.

**How has this changed how I generate code:** When generating server actions or Supabase queries in this repo, I am more likely to use 'use server', requireAuth(), revalidatePath(), explicit .select(...), and scoping by owner_id/project_id because the rules and docs are present. I would avoid suggesting createClient() in client components. The .cursorrules and docs are in context when the user has the project open, which nudges toward the patterns.

**Confidence level in current implementation:**

- Overall setup: **High** — hooks, CI, and rules are correctly configured.
- ESLint rules: **High** — they run and report the intended violations.
- Documentation quality: **High** — pattern docs and templates are complete and usable.
- Sustainability: **Medium** — sustainability depends on fixing the 72 violations and keeping new code compliant; without that, the team may disable or bypass the rules.

---

## Part 10: For Claude's Review

**What Claude should focus on:**

1. **Validation of approach:** Confirm that the order of work (enforcement first, then fix violations) is appropriate, and whether we should fix violations by feature area or by rule type.
2. **RPC vs. in-app transactions:** Confirm whether we should migrate existing multi-step flows to RPC or reserve RPC for new code only.
3. **Scope of no-client-supabase:** Confirm whether auth-related client components (e.g. AuthCallbackHandler, ForgotPasswordForm, ResetPasswordClient) should be refactored to use server actions only or if an exception/escape is acceptable for auth flows.

**What we need Claude's help with:**

1. A suggested order and grouping for fixing the 72 violations (e.g. by directory, by rule, or by user journey).
2. Whether to introduce a CURSOR_RULES.md and what it should contain beyond .cursorrules.
3. Any additional guardrails or patterns we should add (e.g. ADRs, migration checklist) before or while fixing legacy code.

---

## Appendix: File Tree

```
project-root/
├── .cursorrules
├── .eslintrc.js
├── .eslintrc.json                    # (legacy; ESLint uses .eslintrc.js when both exist)
├── .prettierrc
├── .prettierignore
├── .husky/
│   ├── pre-commit
│   └── _/                            # (created by husky on install)
├── .github/
│   └── workflows/
│       ├── quality-gates.yml
│       └── playwright.yml            # (pre-existing)
├── docs/
│   └── patterns/
│       ├── server-actions.md
│       ├── database-queries.md
│       └── transactions.md
├── templates/
│   ├── server-action.template.ts
│   ├── rpc-function.template.sql
│   └── optimistic-update.template.ts
├── eslint-plugin-clear-queue/
│   ├── package.json
│   ├── index.js
│   └── rules/
│       ├── no-client-supabase-in-components.js
│       ├── no-select-star.js
│       └── no-manual-refetch-after-action.js
├── app/
│   └── EslintRulesViolationsClient.tsx   # (intentional violations for testing)
├── eslint-rules-README.md                # (doc for the custom ESLint rules)
├── CONTRIBUTING.md                       # (pre-commit and local check instructions)
├── package.json                          # (scripts, lint-staged, devDependencies)
└── IMPLEMENTATION_STATUS_REPORT.md       # (this file)
```

---

## End of Report

This report was generated by Cursor AI to help Claude understand the current implementation status.

**Report completeness:** ~95% (all sections filled; Cursor code generation test not run).  
**Last updated:** 2025-02-15  
**Next update needed:** After fixing a batch of ESLint violations or after enabling branch protection; or when Claude provides next-step guidance.

**Note:** Commit was attempted but pre-commit failed on `format:check` (218 files not formatted). To commit this report only: run `npm run format` then commit, or use `git commit --no-verify -m "docs: add implementation status report for Claude"`.
