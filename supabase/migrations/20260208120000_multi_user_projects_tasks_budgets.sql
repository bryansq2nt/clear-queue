-- ============================================
-- MULTI-USER: Projects, Tasks, Budgets ownership
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. PROJECTS: add owner_id, backfill, RLS
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: assign existing projects to the first user (e.g. original admin)
UPDATE projects
SET owner_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
WHERE owner_id IS NULL;

ALTER TABLE projects
  ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);

DROP POLICY IF EXISTS "Authenticated users can access projects" ON projects;

CREATE POLICY "Users can select own projects"
  ON projects FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. TASKS: RLS by project ownership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can access tasks" ON tasks;

CREATE POLICY "Users can select tasks in own projects"
  ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tasks in own projects"
  ON tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tasks in own projects"
  ON tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tasks in own projects"
  ON tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = tasks.project_id AND p.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. BUDGETS: add owner_id, backfill, RLS
-- ---------------------------------------------------------------------------
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE budgets b
SET owner_id = (
  SELECT p.owner_id FROM projects p WHERE p.id = b.project_id LIMIT 1
)
WHERE b.owner_id IS NULL AND b.project_id IS NOT NULL;

UPDATE budgets
SET owner_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
WHERE owner_id IS NULL;

ALTER TABLE budgets
  ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_owner_id ON budgets(owner_id);

DROP POLICY IF EXISTS "Enable all for authenticated users" ON budgets;

CREATE POLICY "Users can select own budgets"
  ON budgets FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own budgets"
  ON budgets FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own budgets"
  ON budgets FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own budgets"
  ON budgets FOR DELETE
  USING (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. BUDGET_CATEGORIES & BUDGET_ITEMS: RLS by budget ownership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all for authenticated users" ON budget_categories;

CREATE POLICY "Users can select categories of own budgets"
  ON budget_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_categories.budget_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert categories in own budgets"
  ON budget_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_categories.budget_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update categories in own budgets"
  ON budget_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_categories.budget_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete categories in own budgets"
  ON budget_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_categories.budget_id AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Enable all for authenticated users" ON budget_items;

CREATE POLICY "Users can select items in own budgets"
  ON budget_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM budget_categories bc
      JOIN budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert items in own budgets"
  ON budget_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_categories bc
      JOIN budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items in own budgets"
  ON budget_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM budget_categories bc
      JOIN budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items in own budgets"
  ON budget_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM budget_categories bc
      JOIN budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id AND b.owner_id = auth.uid()
    )
  );
