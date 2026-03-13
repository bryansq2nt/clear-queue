-- ============================================================
-- Phase C: OR-Transition RLS — open project data to team members
-- ============================================================
-- Strategy: expand USING / WITH CHECK from owner-only to
--   "owner OR is_project_member(project_id)"
-- Application-layer requireCan() enforces RBAC; RLS is defense-in-depth.
-- Tables NOT changed here (remain owner-only): todo_lists, todo_items,
--   ideas, idea_*, billing_categories — these are personal, not team data.
-- ============================================================

-- ============================================================
-- 1. Helper security-definer functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_project_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = p_project_id
        AND user_id = auth.uid()
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_org_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = p_org_id
        AND user_id = auth.uid()
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.is_project_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

-- ============================================================
-- 2. projects — SELECT open to members; writes stay owner-only
-- ============================================================

DROP POLICY IF EXISTS "Users can select own projects" ON public.projects;

CREATE POLICY "Users can select own projects"
  ON public.projects FOR SELECT
  USING (owner_id = auth.uid() OR is_project_member(id));

-- ============================================================
-- 3. tasks — all ops via project membership
-- ============================================================

DROP POLICY IF EXISTS "Users can select tasks in own projects" ON public.tasks;
DROP POLICY IF EXISTS "Users can insert tasks in own projects" ON public.tasks;
DROP POLICY IF EXISTS "Users can update tasks in own projects" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete tasks in own projects" ON public.tasks;

CREATE POLICY "Users can select tasks in own projects"
  ON public.tasks FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Users can insert tasks in own projects"
  ON public.tasks FOR INSERT
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can update tasks in own projects"
  ON public.tasks FOR UPDATE
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Users can delete tasks in own projects"
  ON public.tasks FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 4. milestones — all ops via project membership
-- ============================================================

DROP POLICY IF EXISTS "Owner can select milestones" ON public.milestones;
DROP POLICY IF EXISTS "Owner can insert milestones" ON public.milestones;
DROP POLICY IF EXISTS "Owner can update milestones" ON public.milestones;
DROP POLICY IF EXISTS "Owner can delete milestones" ON public.milestones;

CREATE POLICY "Owner can select milestones"
  ON public.milestones FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Owner can insert milestones"
  ON public.milestones FOR INSERT
  WITH CHECK (is_project_member(project_id));

CREATE POLICY "Owner can update milestones"
  ON public.milestones FOR UPDATE
  USING (is_project_member(project_id));

CREATE POLICY "Owner can delete milestones"
  ON public.milestones FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 5. notes — OR pattern (owner_id + project membership)
-- ============================================================

DROP POLICY IF EXISTS "Users can select own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;

CREATE POLICY "Users can select own notes"
  ON public.notes FOR SELECT
  USING (owner_id = auth.uid() OR is_project_member(project_id));

CREATE POLICY "Users can insert own notes"
  ON public.notes FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Users can update own notes"
  ON public.notes FOR UPDATE
  USING (owner_id = auth.uid() OR is_project_member(project_id))
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own notes"
  ON public.notes FOR DELETE
  USING (owner_id = auth.uid() OR is_project_member(project_id));

-- ============================================================
-- 6. note_links — through note project membership
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
        AND (n.owner_id = auth.uid() OR is_project_member(n.project_id))
    )
  );

CREATE POLICY "Users can insert note_links for own notes"
  ON public.note_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND (n.owner_id = auth.uid() OR is_project_member(n.project_id))
    )
  );

CREATE POLICY "Users can update note_links of own notes"
  ON public.note_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND (n.owner_id = auth.uid() OR is_project_member(n.project_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND (n.owner_id = auth.uid() OR is_project_member(n.project_id))
    )
  );

CREATE POLICY "Users can delete note_links of own notes"
  ON public.note_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_links.note_id
        AND (n.owner_id = auth.uid() OR is_project_member(n.project_id))
    )
  );

-- ============================================================
-- 7. project_note_folders — OR pattern
-- ============================================================

DROP POLICY IF EXISTS "Users can select own note folders" ON public.project_note_folders;
DROP POLICY IF EXISTS "Users can insert own note folders" ON public.project_note_folders;
DROP POLICY IF EXISTS "Users can update own note folders" ON public.project_note_folders;
DROP POLICY IF EXISTS "Users can delete own note folders" ON public.project_note_folders;

CREATE POLICY "Users can select own note folders"
  ON public.project_note_folders FOR SELECT
  USING (owner_id = auth.uid() OR is_project_member(project_id));

CREATE POLICY "Users can insert own note folders"
  ON public.project_note_folders FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Users can update own note folders"
  ON public.project_note_folders FOR UPDATE
  USING (owner_id = auth.uid() OR is_project_member(project_id))
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own note folders"
  ON public.project_note_folders FOR DELETE
  USING (owner_id = auth.uid() OR is_project_member(project_id));

-- ============================================================
-- 8. project_links — OR pattern
-- ============================================================

DROP POLICY IF EXISTS "Users can select own project_links" ON public.project_links;
DROP POLICY IF EXISTS "Users can insert own project_links" ON public.project_links;
DROP POLICY IF EXISTS "Users can update own project_links" ON public.project_links;
DROP POLICY IF EXISTS "Users can delete own project_links" ON public.project_links;

CREATE POLICY "Users can select own project_links"
  ON public.project_links FOR SELECT
  USING (owner_id = auth.uid() OR is_project_member(project_id));

CREATE POLICY "Users can insert own project_links"
  ON public.project_links FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Users can update own project_links"
  ON public.project_links FOR UPDATE
  USING (owner_id = auth.uid() OR is_project_member(project_id))
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own project_links"
  ON public.project_links FOR DELETE
  USING (owner_id = auth.uid() OR is_project_member(project_id));

-- ============================================================
-- 9. calendar_events — OR pattern (project_id nullable)
-- ============================================================

DROP POLICY IF EXISTS "Users can select own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can insert own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can update own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can delete own calendar events" ON public.calendar_events;

CREATE POLICY "Users can select own calendar events"
  ON public.calendar_events FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

CREATE POLICY "Users can insert own calendar events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND (project_id IS NULL OR is_project_member(project_id))
  );

CREATE POLICY "Users can update own calendar events"
  ON public.calendar_events FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  )
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own calendar events"
  ON public.calendar_events FOR DELETE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

-- ============================================================
-- 10. budgets — OR pattern
-- ============================================================

DROP POLICY IF EXISTS "Users can select own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can insert own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can delete own budgets" ON public.budgets;

CREATE POLICY "Users can select own budgets"
  ON public.budgets FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

CREATE POLICY "Users can insert own budgets"
  ON public.budgets FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND (project_id IS NULL OR is_project_member(project_id))
  );

CREATE POLICY "Users can update own budgets"
  ON public.budgets FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  )
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own budgets"
  ON public.budgets FOR DELETE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

-- ============================================================
-- 11. budget_categories — derived from budget's project membership
-- ============================================================

DROP POLICY IF EXISTS "Users can select categories of own budgets" ON public.budget_categories;
DROP POLICY IF EXISTS "Users can insert categories in own budgets" ON public.budget_categories;
DROP POLICY IF EXISTS "Users can update categories in own budgets" ON public.budget_categories;
DROP POLICY IF EXISTS "Users can delete categories in own budgets" ON public.budget_categories;

CREATE POLICY "Users can select categories of own budgets"
  ON public.budget_categories FOR SELECT
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

CREATE POLICY "Users can insert categories in own budgets"
  ON public.budget_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_categories.budget_id
        AND (
          b.owner_id = auth.uid()
          OR (b.project_id IS NOT NULL AND is_project_member(b.project_id))
        )
    )
  );

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

CREATE POLICY "Users can delete categories in own budgets"
  ON public.budget_categories FOR DELETE
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

-- ============================================================
-- 12. budget_items — derived via budget_categories → budget
-- ============================================================

DROP POLICY IF EXISTS "Users can select items in own budgets" ON public.budget_items;
DROP POLICY IF EXISTS "Users can insert items in own budgets" ON public.budget_items;
DROP POLICY IF EXISTS "Users can update items in own budgets" ON public.budget_items;
DROP POLICY IF EXISTS "Users can delete items in own budgets" ON public.budget_items;

CREATE POLICY "Users can select items in own budgets"
  ON public.budget_items FOR SELECT
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

CREATE POLICY "Users can insert items in own budgets"
  ON public.budget_items FOR INSERT
  WITH CHECK (
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

CREATE POLICY "Users can delete items in own budgets"
  ON public.budget_items FOR DELETE
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

-- ============================================================
-- 13. billings — OR pattern (project_id nullable)
-- ============================================================

DROP POLICY IF EXISTS "Users can view own billings" ON public.billings;
DROP POLICY IF EXISTS "Users can create own billings" ON public.billings;
DROP POLICY IF EXISTS "Users can update own billings" ON public.billings;
DROP POLICY IF EXISTS "Users can delete own billings" ON public.billings;

CREATE POLICY "Users can view own billings"
  ON public.billings FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

CREATE POLICY "Users can create own billings"
  ON public.billings FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND (project_id IS NULL OR is_project_member(project_id))
  );

CREATE POLICY "Users can update own billings"
  ON public.billings FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  )
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own billings"
  ON public.billings FOR DELETE
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND is_project_member(project_id))
  );

-- ============================================================
-- 14. copilot_sessions — all ops via project membership
-- ============================================================

DROP POLICY IF EXISTS "Owner can select copilot sessions" ON public.copilot_sessions;
DROP POLICY IF EXISTS "Owner can insert copilot sessions" ON public.copilot_sessions;
DROP POLICY IF EXISTS "Owner can update copilot sessions" ON public.copilot_sessions;
DROP POLICY IF EXISTS "Owner can delete copilot sessions" ON public.copilot_sessions;

CREATE POLICY "Owner can select copilot sessions"
  ON public.copilot_sessions FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Owner can insert copilot sessions"
  ON public.copilot_sessions FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Owner can update copilot sessions"
  ON public.copilot_sessions FOR UPDATE
  USING (is_project_member(project_id));

CREATE POLICY "Owner can delete copilot sessions"
  ON public.copilot_sessions FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 15. copilot_messages — all ops via project membership
-- ============================================================

DROP POLICY IF EXISTS "Owner can select copilot messages" ON public.copilot_messages;
DROP POLICY IF EXISTS "Owner can insert copilot messages" ON public.copilot_messages;
DROP POLICY IF EXISTS "Owner can delete copilot messages" ON public.copilot_messages;

CREATE POLICY "Owner can select copilot messages"
  ON public.copilot_messages FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Owner can insert copilot messages"
  ON public.copilot_messages FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Owner can delete copilot messages"
  ON public.copilot_messages FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 16. copilot_proposals — all ops via project membership
-- ============================================================

DROP POLICY IF EXISTS "Owner can select copilot proposals" ON public.copilot_proposals;
DROP POLICY IF EXISTS "Owner can insert copilot proposals" ON public.copilot_proposals;
DROP POLICY IF EXISTS "Owner can update copilot proposals" ON public.copilot_proposals;
DROP POLICY IF EXISTS "Owner can delete copilot proposals" ON public.copilot_proposals;

CREATE POLICY "Owner can select copilot proposals"
  ON public.copilot_proposals FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY "Owner can insert copilot proposals"
  ON public.copilot_proposals FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Owner can update copilot proposals"
  ON public.copilot_proposals FOR UPDATE
  USING (is_project_member(project_id));

CREATE POLICY "Owner can delete copilot proposals"
  ON public.copilot_proposals FOR DELETE
  USING (is_project_member(project_id));

-- ============================================================
-- 17. project_files — OR pattern
-- ============================================================

DROP POLICY IF EXISTS "Users can select own project files" ON public.project_files;
DROP POLICY IF EXISTS "Users can insert own project files" ON public.project_files;
DROP POLICY IF EXISTS "Users can update own project files" ON public.project_files;
DROP POLICY IF EXISTS "Users can delete own project files" ON public.project_files;

CREATE POLICY "Users can select own project files"
  ON public.project_files FOR SELECT
  USING (owner_id = auth.uid() OR is_project_member(project_id));

CREATE POLICY "Users can insert own project files"
  ON public.project_files FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Users can update own project files"
  ON public.project_files FOR UPDATE
  USING (owner_id = auth.uid() OR is_project_member(project_id))
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own project files"
  ON public.project_files FOR DELETE
  USING (owner_id = auth.uid() OR is_project_member(project_id));

-- ============================================================
-- 18. project_document_folders — OR pattern
-- ============================================================

DROP POLICY IF EXISTS "Users can select own document folders" ON public.project_document_folders;
DROP POLICY IF EXISTS "Users can insert own document folders" ON public.project_document_folders;
DROP POLICY IF EXISTS "Users can update own document folders" ON public.project_document_folders;
DROP POLICY IF EXISTS "Users can delete own document folders" ON public.project_document_folders;

CREATE POLICY "Users can select own document folders"
  ON public.project_document_folders FOR SELECT
  USING (owner_id = auth.uid() OR is_project_member(project_id));

CREATE POLICY "Users can insert own document folders"
  ON public.project_document_folders FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND is_project_member(project_id));

CREATE POLICY "Users can update own document folders"
  ON public.project_document_folders FOR UPDATE
  USING (owner_id = auth.uid() OR is_project_member(project_id))
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own document folders"
  ON public.project_document_folders FOR DELETE
  USING (owner_id = auth.uid() OR is_project_member(project_id));

-- ============================================================
-- 19. Update RPCs: replace owner-only checks with membership checks
-- ============================================================

-- 19a. create_task_atomic — allow project members to create tasks
CREATE OR REPLACE FUNCTION public.create_task_atomic(
  in_project_id   uuid,
  in_title        text,
  in_status       public.task_status DEFAULT 'next',
  in_priority     integer            DEFAULT 3,
  in_due_date     date               DEFAULT NULL,
  in_notes        text               DEFAULT NULL,
  in_tags         text               DEFAULT NULL,
  in_milestone_id uuid               DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_row public.tasks%ROWTYPE;
BEGIN
  IF in_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;

  IF COALESCE(BTRIM(in_title), '') = '' THEN
    RAISE EXCEPTION 'title is required';
  END IF;

  IF NOT public.is_project_member(in_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  IF in_milestone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.milestones m
    WHERE m.id = in_milestone_id AND m.project_id = in_project_id
  ) THEN
    RAISE EXCEPTION 'Milestone not found or does not belong to project';
  END IF;

  INSERT INTO public.tasks (
    project_id,
    title,
    status,
    priority,
    due_date,
    notes,
    tags,
    milestone_id,
    order_index
  )
  VALUES (
    in_project_id,
    BTRIM(in_title),
    in_status,
    COALESCE(in_priority, 3),
    in_due_date,
    NULLIF(BTRIM(in_notes), ''),
    NULLIF(BTRIM(in_tags), ''),
    in_milestone_id,
    (
      SELECT COALESCE(MIN(t.order_index), 0) - 1
      FROM public.tasks t
      WHERE t.project_id = in_project_id
        AND t.status = in_status
    )
  )
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_atomic(uuid, text, public.task_status, integer, date, text, text, uuid) TO authenticated;

-- 19b. move_task_atomic — allow project members to move tasks
CREATE OR REPLACE FUNCTION public.move_task_atomic(
  in_task_id        uuid,
  in_new_status     public.task_status,
  in_new_order_index integer
)
RETURNS public.tasks
LANGUAGE plpgsql
AS $$
DECLARE
  current_task public.tasks%ROWTYPE;
  result_task  public.tasks%ROWTYPE;
BEGIN
  IF in_task_id IS NULL THEN
    RAISE EXCEPTION 'task_id is required';
  END IF;

  IF in_new_status IS NULL THEN
    RAISE EXCEPTION 'new_status is required';
  END IF;

  IF in_new_order_index IS NULL OR in_new_order_index < 0 THEN
    RAISE EXCEPTION 'new_order_index must be >= 0';
  END IF;

  SELECT t.*
    INTO current_task
  FROM public.tasks t
  WHERE t.id = in_task_id
    AND public.is_project_member(t.project_id);

  IF current_task.id IS NULL THEN
    RAISE EXCEPTION 'Task not found or access denied';
  END IF;

  IF current_task.status <> in_new_status THEN
    UPDATE public.tasks
    SET order_index = order_index - 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = current_task.status
      AND order_index > current_task.order_index;

    UPDATE public.tasks
    SET order_index = order_index + 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index >= in_new_order_index
      AND id <> current_task.id;
  ELSIF in_new_order_index > current_task.order_index THEN
    UPDATE public.tasks
    SET order_index = order_index - 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index > current_task.order_index
      AND order_index <= in_new_order_index
      AND id <> current_task.id;
  ELSIF in_new_order_index < current_task.order_index THEN
    UPDATE public.tasks
    SET order_index = order_index + 1,
        updated_at = NOW()
    WHERE project_id = current_task.project_id
      AND status = in_new_status
      AND order_index >= in_new_order_index
      AND order_index < current_task.order_index
      AND id <> current_task.id;
  END IF;

  UPDATE public.tasks
  SET status = in_new_status,
      order_index = in_new_order_index,
      updated_at = NOW()
  WHERE id = current_task.id
  RETURNING * INTO result_task;

  RETURN result_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_task_atomic(uuid, public.task_status, integer) TO authenticated;

-- 19c. complete_milestone_atomic — allow project members
CREATE OR REPLACE FUNCTION public.complete_milestone_atomic(p_milestone_id uuid)
RETURNS public.milestones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_milestone public.milestones%ROWTYPE;
BEGIN
  IF p_milestone_id IS NULL THEN
    RAISE EXCEPTION 'milestone_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.milestones m
    WHERE m.id = p_milestone_id
      AND public.is_project_member(m.project_id)
  ) THEN
    RAISE EXCEPTION 'Milestone not found or access denied';
  END IF;

  UPDATE public.tasks
  SET status = 'done'
  WHERE milestone_id = p_milestone_id
    AND status IS DISTINCT FROM 'done';

  UPDATE public.milestones
  SET status = 'completed',
      completed_at = timezone('utc', now())
  WHERE id = p_milestone_id
  RETURNING * INTO v_milestone;

  RETURN v_milestone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_milestone_atomic(uuid) TO authenticated;

-- 19d. reopen_milestone_atomic — allow project members
CREATE OR REPLACE FUNCTION public.reopen_milestone_atomic(p_milestone_id uuid)
RETURNS public.milestones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_milestone public.milestones%ROWTYPE;
BEGIN
  IF p_milestone_id IS NULL THEN
    RAISE EXCEPTION 'milestone_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.milestones m
    WHERE m.id = p_milestone_id
      AND public.is_project_member(m.project_id)
  ) THEN
    RAISE EXCEPTION 'Milestone not found or access denied';
  END IF;

  UPDATE public.tasks
  SET status = 'next'
  WHERE milestone_id = p_milestone_id
    AND status = 'done';

  UPDATE public.milestones
  SET status = 'pending',
      completed_at = NULL
  WHERE id = p_milestone_id
  RETURNING * INTO v_milestone;

  RETURN v_milestone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_milestone_atomic(uuid) TO authenticated;

-- 19e. get_project_calendar_feed — allow project members
CREATE OR REPLACE FUNCTION public.get_project_calendar_feed(
  p_project_id UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  source_type TEXT,
  source_id   UUID,
  date_key    DATE,
  title       TEXT,
  status      TEXT,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  all_day     BOOLEAN,
  amount      NUMERIC,
  paid_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_project_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'project_id, start_date and end_date are required';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;

  IF NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Project not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    'task'::TEXT,
    t.id,
    t.due_date,
    t.title,
    t.status::TEXT,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    true,
    NULL::NUMERIC,
    NULL::TIMESTAMPTZ
  FROM public.tasks t
  WHERE t.project_id = p_project_id
    AND t.due_date IS NOT NULL
    AND t.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

  SELECT
    'billing'::TEXT,
    b.id,
    b.due_date,
    b.title,
    b.status,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    true,
    b.amount,
    b.paid_at
  FROM public.billings b
  WHERE b.project_id = p_project_id
    AND (b.owner_id = auth.uid() OR is_project_member(b.project_id))
    AND b.due_date IS NOT NULL
    AND b.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

  SELECT
    'todo_item'::TEXT,
    ti.id,
    ti.due_date,
    ti.content,
    CASE WHEN ti.is_done THEN 'done' ELSE 'pending' END,
    NULL::TIMESTAMPTZ,
    NULL::TIMESTAMPTZ,
    true,
    NULL::NUMERIC,
    NULL::TIMESTAMPTZ
  FROM public.todo_items ti
  JOIN public.todo_lists tl ON tl.id = ti.list_id
    AND tl.project_id = p_project_id
    AND tl.owner_id = auth.uid()
  WHERE ti.due_date IS NOT NULL
    AND ti.due_date BETWEEN p_start_date AND p_end_date

  UNION ALL

  SELECT
    'event'::TEXT,
    e.id,
    (e.start_at AT TIME ZONE 'UTC')::DATE,
    e.title,
    e.status::TEXT,
    e.start_at,
    e.end_at,
    e.all_day,
    NULL::NUMERIC,
    NULL::TIMESTAMPTZ
  FROM public.calendar_events e
  WHERE e.project_id = p_project_id
    AND (e.owner_id = auth.uid() OR is_project_member(e.project_id))
    AND e.start_at::DATE <= p_end_date
    AND (e.end_at IS NULL OR e.end_at::DATE >= p_start_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_calendar_feed(UUID, DATE, DATE) TO authenticated;

-- 19f. approve_copilot_proposal_atomic — allow project members to approve proposals
--      Change: use is_project_member(project_id) instead of owner_id = auth.uid()
CREATE OR REPLACE FUNCTION public.approve_copilot_proposal_atomic(
  in_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec                public.copilot_proposals%ROWTYPE;
  v_title            text;
  v_status           text;
  v_priority         integer;
  v_due_date         date;
  v_notes            text;
  v_tags             text;
  v_content          text;
  v_description      text;
  v_milestone_id     uuid;
  v_milestone_title  text;
  v_sort_order       integer;
  v_task_id          uuid;
  v_note_id          uuid;
  v_milestone_new_id uuid;
  v_entity_id        uuid;
  v_type             text;
BEGIN
  -- Lock proposal for update; caller must be a project member
  SELECT * INTO rec
  FROM public.copilot_proposals
  WHERE id = in_proposal_id
    AND public.is_project_member(project_id)
  FOR UPDATE;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found or access denied';
  END IF;

  IF rec.status != 'pending' THEN
    RAISE EXCEPTION 'Proposal already reviewed';
  END IF;

  v_type := rec.type;
  v_entity_id := NULL;

  IF v_type = 'task' THEN
    v_title := NULLIF(BTRIM(rec.payload->>'title'), '');
    IF v_title IS NULL OR length(v_title) = 0 THEN
      RAISE EXCEPTION 'Task title is required';
    END IF;
    IF length(v_title) > 1000 THEN
      RAISE EXCEPTION 'Task title too long';
    END IF;

    v_status := COALESCE(rec.payload->>'status', 'next');
    IF v_status NOT IN ('backlog', 'next', 'in_progress', 'blocked', 'done') THEN
      v_status := 'backlog';
    END IF;

    v_priority := (rec.payload->>'priority')::integer;
    IF v_priority IS NULL OR v_priority < 1 OR v_priority > 5 THEN
      v_priority := 3;
    END IF;

    v_due_date := (rec.payload->>'due_date')::date;
    v_notes    := NULLIF(BTRIM(rec.payload->>'notes'), '');
    v_tags     := NULLIF(BTRIM(rec.payload->>'tags'), '');

    v_milestone_id := NULL;
    BEGIN
      v_milestone_id := (rec.payload->>'milestone_id')::uuid;
    EXCEPTION WHEN others THEN
      v_milestone_id := NULL;
    END;

    IF v_milestone_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.milestones
        WHERE id = v_milestone_id AND project_id = rec.project_id
      ) THEN
        v_milestone_id := NULL;
      END IF;
    ELSE
      v_milestone_title := NULLIF(BTRIM(rec.payload->>'milestone_title'), '');
      IF v_milestone_title IS NOT NULL THEN
        SELECT id INTO v_milestone_id
        FROM public.milestones
        WHERE project_id = rec.project_id
          AND BTRIM(title) = BTRIM(v_milestone_title)
        LIMIT 1;
      END IF;
    END IF;

    SELECT id INTO v_task_id
    FROM public.create_task_atomic(
      rec.project_id,
      v_title,
      v_status::public.task_status,
      v_priority,
      v_due_date,
      v_notes,
      v_tags,
      v_milestone_id
    );
    v_entity_id := v_task_id;

  ELSIF v_type = 'note' THEN
    v_title   := NULLIF(BTRIM(rec.payload->>'title'), '');
    v_content := rec.payload->>'content';
    IF v_title IS NULL OR length(v_title) = 0 THEN
      RAISE EXCEPTION 'Note title is required';
    END IF;
    IF v_content IS NULL OR length(BTRIM(v_content)) = 0 THEN
      RAISE EXCEPTION 'Note content is required';
    END IF;
    IF length(v_title) > 500 THEN
      RAISE EXCEPTION 'Note title too long';
    END IF;

    INSERT INTO public.notes (owner_id, project_id, title, content)
    VALUES (auth.uid(), rec.project_id, v_title, BTRIM(v_content))
    RETURNING id INTO v_note_id;
    v_entity_id := v_note_id;

  ELSIF v_type = 'milestone' THEN
    v_title := NULLIF(BTRIM(rec.payload->>'title'), '');
    IF v_title IS NULL OR length(v_title) = 0 THEN
      RAISE EXCEPTION 'Milestone title is required';
    END IF;
    IF length(v_title) > 200 THEN
      v_title := left(v_title, 200);
    END IF;

    v_description := NULLIF(BTRIM(rec.payload->>'description'), '');

    SELECT COALESCE(MAX(sort_order), -1) + 1
    INTO v_sort_order
    FROM public.milestones
    WHERE project_id = rec.project_id;

    INSERT INTO public.milestones (project_id, title, description, sort_order)
    VALUES (rec.project_id, v_title, v_description, v_sort_order)
    RETURNING id INTO v_milestone_new_id;

    v_entity_id := v_milestone_new_id;

  ELSE
    RAISE EXCEPTION 'Invalid proposal type: %', v_type;
  END IF;

  UPDATE public.copilot_proposals
  SET
    status = 'approved',
    created_entity_id = v_entity_id,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = in_proposal_id;

  RETURN jsonb_build_object(
    'created_entity_id', v_entity_id,
    'type', v_type,
    'project_id', rec.project_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_copilot_proposal_atomic(uuid) IS
  'Approves a pending copilot proposal: creates the task, note, or milestone and marks proposal approved. Atomic. Accessible to project members.';

GRANT EXECUTE ON FUNCTION public.approve_copilot_proposal_atomic(uuid) TO authenticated;
