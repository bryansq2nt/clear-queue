-- ============================================================
-- Phase G: Drop OR-Transition RLS
-- Replace "owner_id = auth.uid() OR is_project_member(project_id)"
-- with clean "is_project_member(project_id)" for tables where
-- project_id is NOT NULL (all rows belong to a project, no personal rows).
--
-- Safe to run because Phase B backfilled all project owners into
-- project_members. Any row accessible before is still accessible after.
--
-- Also fixes the broken UPDATE WITH CHECK pattern from Phase C that
-- prevented non-owner project members from updating records they have
-- access to. The new WITH CHECK just re-asserts membership.
--
-- Tables left unchanged (nullable project_id — personal rows exist):
--   calendar_events, budgets, budget_categories, budget_items, billings
-- For these we fix only the broken UPDATE WITH CHECK.
-- ============================================================

-- ============================================================
-- 1. projects — SELECT: drop owner fallback now all owners are members
-- ============================================================

DROP POLICY IF EXISTS "Users can select own projects" ON public.projects;

CREATE POLICY "Users can select own projects"
  ON public.projects FOR SELECT
  USING (is_project_member(id));

-- ============================================================
-- 2. notes — all ops: member-only; fix UPDATE WITH CHECK
-- ============================================================

DROP POLICY IF EXISTS "Users can select own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;

CREATE POLICY "Users can select own notes"
  ON public.notes FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (is_project_member(project_id));

-- Fixed: WITH CHECK was owner_id = auth.uid() which blocks non-owner members
CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 3. note_links — member-only via note's project
-- ============================================================

DROP POLICY IF EXISTS "Users can select note_links of own notes" ON public.note_links;
DROP POLICY IF EXISTS "Users can insert note_links for own notes" ON public.note_links;
DROP POLICY IF EXISTS "Users can update note_links of own notes" ON public.note_links;
DROP POLICY IF EXISTS "Users can delete note_links of own notes" ON public.note_links;

CREATE POLICY "Users can select note_links of own notes"
  ON public.note_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND is_project_member(n.project_id)
    )
  );

CREATE POLICY "Users can insert note_links for own notes"
  ON public.note_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND is_project_member(n.project_id)
    )
  );

CREATE POLICY "Users can update note_links of own notes"
  ON public.note_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND is_project_member(n.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND is_project_member(n.project_id)
    )
  );

CREATE POLICY "Users can delete note_links of own notes"
  ON public.note_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND is_project_member(n.project_id)
    )
  );

-- ============================================================
-- 4. project_note_folders — member-only; fix UPDATE WITH CHECK
-- ============================================================

DROP POLICY IF EXISTS "Users can select own note folders" ON public.project_note_folders;
DROP POLICY IF EXISTS "Users can insert own note folders" ON public.project_note_folders;
DROP POLICY IF EXISTS "Users can update own note folders" ON public.project_note_folders;
DROP POLICY IF EXISTS "Users can delete own note folders" ON public.project_note_folders;

CREATE POLICY "Users can select own note folders"
  ON public.project_note_folders FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can insert own note folders"
  ON public.project_note_folders FOR INSERT
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can update own note folders"
  ON public.project_note_folders FOR UPDATE
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can delete own note folders"
  ON public.project_note_folders FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 5. project_links — member-only; fix UPDATE WITH CHECK
-- ============================================================

DROP POLICY IF EXISTS "Users can select own project_links" ON public.project_links;
DROP POLICY IF EXISTS "Users can insert own project_links" ON public.project_links;
DROP POLICY IF EXISTS "Users can update own project_links" ON public.project_links;
DROP POLICY IF EXISTS "Users can delete own project_links" ON public.project_links;

CREATE POLICY "Users can select own project_links"
  ON public.project_links FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can insert own project_links"
  ON public.project_links FOR INSERT
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can update own project_links"
  ON public.project_links FOR UPDATE
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can delete own project_links"
  ON public.project_links FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 6. project_files — member-only; fix UPDATE WITH CHECK
-- ============================================================

DROP POLICY IF EXISTS "Users can select own project files" ON public.project_files;
DROP POLICY IF EXISTS "Users can insert own project files" ON public.project_files;
DROP POLICY IF EXISTS "Users can update own project files" ON public.project_files;
DROP POLICY IF EXISTS "Users can delete own project files" ON public.project_files;

CREATE POLICY "Users can select own project files"
  ON public.project_files FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can insert own project files"
  ON public.project_files FOR INSERT
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can update own project files"
  ON public.project_files FOR UPDATE
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can delete own project files"
  ON public.project_files FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 7. project_document_folders — member-only; fix UPDATE WITH CHECK
-- ============================================================

DROP POLICY IF EXISTS "Users can select own document folders" ON public.project_document_folders;
DROP POLICY IF EXISTS "Users can insert own document folders" ON public.project_document_folders;
DROP POLICY IF EXISTS "Users can update own document folders" ON public.project_document_folders;
DROP POLICY IF EXISTS "Users can delete own document folders" ON public.project_document_folders;

CREATE POLICY "Users can select own document folders"
  ON public.project_document_folders FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can insert own document folders"
  ON public.project_document_folders FOR INSERT
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can update own document folders"
  ON public.project_document_folders FOR UPDATE
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can delete own document folders"
  ON public.project_document_folders FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 8. Fix broken UPDATE WITH CHECK for nullable-project_id tables.
-- These keep the owner fallback for personal rows (project_id IS NULL),
-- but fix the WITH CHECK so non-owner project members can update project rows.
-- ============================================================

-- calendar_events
DROP POLICY IF EXISTS "Users can update own calendar events" ON public.calendar_events;

CREATE POLICY "Users can update own calendar events"
  ON public.calendar_events FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

-- budgets
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;

CREATE POLICY "Users can update own budgets"
  ON public.budgets FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

-- billings
DROP POLICY IF EXISTS "Users can update own billings" ON public.billings;

CREATE POLICY "Users can update own billings"
  ON public.billings FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

-- budget_categories (via budget)
DROP POLICY IF EXISTS "Users can update categories in own budgets" ON public.budget_categories;

CREATE POLICY "Users can update categories in own budgets"
  ON public.budget_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_categories.budget_id
        AND (
          b.owner_id = auth.uid()
          OR (b.project_id IS NOT NULL AND is_project_member(b.project_id))
        )
    )
  );

-- budget_items (via budget_categories → budget)
DROP POLICY IF EXISTS "Users can update items in own budgets" ON public.budget_items;

CREATE POLICY "Users can update items in own budgets"
  ON public.budget_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_categories bc
      JOIN public.budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id
        AND (
          b.owner_id = auth.uid()
          OR (b.project_id IS NOT NULL AND is_project_member(b.project_id))
        )
    )
  );
