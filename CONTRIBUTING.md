# Contributing

Thanks for contributing to this project. This document explains how to get set up and what checks run before your changes can be committed.

## Development setup

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd clear-queue
   npm install
   ```

2. **Husky and pre-commit hooks**

   The repo uses [Husky](https://typicode.github.io/husky/) for Git hooks. After `npm install`, the `prepare` script runs Husky so pre-commit hooks are installed automatically.

   If you cloned before Husky was added, run once:

   ```bash
   npx husky
   ```

## Pre-commit checks (commit is blocked if any fail)

Every `git commit` runs these in order. The commit **fails** if any step fails:

1. **ESLint on staged files**  
   Only files you’re about to commit are linted. Any ESLint error (including custom rules) blocks the commit.

2. **TypeScript type check**  
   Full project type check (`tsc --noEmit`). Ensures the codebase type-checks before commit.

3. **Prettier format check**  
   Checks that all tracked files are formatted with Prettier. No files are rewritten at commit time; you must format first (see below).

## Running the same checks locally

Use these scripts to fix or verify things before committing:

| Script                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run lint`         | ESLint on the whole project                   |
| `npm run lint:fix`     | ESLint and auto-fix where possible            |
| `npm run typecheck`    | TypeScript type check (`tsc --noEmit`)        |
| `npm run format:check` | Prettier: check only (fails if not formatted) |
| `npm run format`       | Prettier: format all files                    |

**Suggested workflow before committing:**

```bash
npm run typecheck
npm run lint
npm run format:check
# If format:check fails:
npm run format
# Then stage and commit
```

## Bypassing the hook (not recommended)

Pre-commit hooks exist to keep the main branch clean. Only skip them when you have a strong reason (e.g. WIP commit to a feature branch):

```bash
git commit --no-verify -m "wip: ..."
```

Avoid using `--no-verify` for normal commits.
