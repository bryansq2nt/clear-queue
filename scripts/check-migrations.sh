#!/usr/bin/env bash
# Migration RLS audit — runs check-migrations.py on any staged SQL migration files.
# Exits 0 immediately if no migration files are staged.

set -e

staged_migrations=$(git diff --cached --name-only | grep '^supabase/migrations/.*\.sql$' || true)

if [ -z "$staged_migrations" ]; then
  exit 0
fi

if [ ! -f "scripts/check-migrations.py" ]; then
  echo "Warning: scripts/check-migrations.py not found, skipping migration audit"
  exit 0
fi

while IFS= read -r file; do
  echo "Checking migration: $file"
  python3 scripts/check-migrations.py "$file"
done <<< "$staged_migrations"
