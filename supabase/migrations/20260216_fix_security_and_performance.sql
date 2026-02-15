-- ============================================
-- Fix security and performance audit findings
-- ============================================

-- ---------------------------------------------------------------------------
-- SEC-001/002/003: Add WITH CHECK to UPDATE policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update categories in own budgets" ON public.budget_categories;
CREATE POLICY "Users can update categories in own budgets"
  ON public.budget_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.budgets b
      WHERE b.id = budget_categories.budget_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.budgets b
      WHERE b.id = budget_categories.budget_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update items in own budgets" ON public.budget_items;
CREATE POLICY "Users can update items in own budgets"
  ON public.budget_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.budget_categories bc
      JOIN public.budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.budget_categories bc
      JOIN public.budgets b ON b.id = bc.budget_id
      WHERE bc.id = budget_items.category_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update media in own businesses" ON public.business_media;
CREATE POLICY "Users can update media in own businesses"
  ON public.business_media FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_media.business_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_media.business_id
        AND b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Integrity fix: project owner must match assigned business owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_project_client_business()
RETURNS TRIGGER AS $$
DECLARE
  business_owner_id uuid;
BEGIN
  IF NEW.business_id IS NOT NULL THEN
    IF NEW.client_id IS NULL THEN
      RAISE EXCEPTION 'Project must have a client when a business is assigned.';
    END IF;

    SELECT b.owner_id
      INTO business_owner_id
    FROM public.businesses b
    WHERE b.id = NEW.business_id
      AND b.client_id = NEW.client_id;

    IF business_owner_id IS NULL THEN
      RAISE EXCEPTION 'The selected business does not belong to the selected client.';
    END IF;

    IF NEW.owner_id IS DISTINCT FROM business_owner_id THEN
      RAISE EXCEPTION 'Project owner must match the owner of the assigned business.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- PERF-001: Atomic reorder for tasks in one RPC
-- task_data format: [{"id":"<task_uuid>","order_index":0,"status":"next"}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_tasks_atomic(task_data jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  payload_count integer;
  allowed_count integer;
BEGIN
  IF task_data IS NULL OR jsonb_typeof(task_data) <> 'array' THEN
    RAISE EXCEPTION 'task_data must be a JSON array';
  END IF;

  payload_count := jsonb_array_length(task_data);
  IF payload_count = 0 THEN
    RETURN;
  END IF;

  WITH payload AS (
    SELECT *
    FROM jsonb_to_recordset(task_data) AS x(id uuid, order_index integer, status public.task_status)
  )
  SELECT COUNT(*)
    INTO allowed_count
  FROM payload p
  JOIN public.tasks t ON t.id = p.id
  JOIN public.projects pr ON pr.id = t.project_id
  WHERE pr.owner_id = auth.uid();

  IF allowed_count <> payload_count THEN
    RAISE EXCEPTION 'One or more tasks are missing or not owned by the authenticated user';
  END IF;

  UPDATE public.tasks t
  SET order_index = p.order_index,
      status = COALESCE(p.status, t.status),
      updated_at = NOW()
  FROM (
    SELECT *
    FROM jsonb_to_recordset(task_data) AS x(id uuid, order_index integer, status public.task_status)
  ) p
  WHERE t.id = p.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- PERF-003: Atomic duplicate of budget, categories and items in one RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duplicate_budget_atomic(source_id uuid, new_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  source_budget public.budgets%ROWTYPE;
  source_category record;
  new_budget_id uuid;
  new_category_id uuid;
BEGIN
  IF source_id IS NULL THEN
    RAISE EXCEPTION 'source_id is required';
  END IF;

  SELECT *
    INTO source_budget
  FROM public.budgets b
  WHERE b.id = source_id
    AND b.owner_id = auth.uid();

  IF source_budget.id IS NULL THEN
    RAISE EXCEPTION 'Source budget not found or not owned by authenticated user';
  END IF;

  INSERT INTO public.budgets (name, description, project_id, owner_id)
  VALUES (
    COALESCE(NULLIF(BTRIM(new_name), ''), source_budget.name || ' (Copy)'),
    source_budget.description,
    source_budget.project_id,
    source_budget.owner_id
  )
  RETURNING id INTO new_budget_id;

  FOR source_category IN
    SELECT bc.*
    FROM public.budget_categories bc
    WHERE bc.budget_id = source_id
    ORDER BY COALESCE(bc.sort_order, 0), bc.id
  LOOP
    INSERT INTO public.budget_categories (budget_id, name, description, sort_order)
    VALUES (
      new_budget_id,
      source_category.name,
      source_category.description,
      COALESCE(source_category.sort_order, 0)
    )
    RETURNING id INTO new_category_id;

    INSERT INTO public.budget_items (
      category_id,
      name,
      description,
      quantity,
      unit_price,
      link,
      status,
      is_recurrent,
      notes,
      sort_order
    )
    SELECT
      new_category_id,
      bi.name,
      bi.description,
      bi.quantity,
      bi.unit_price,
      bi.link,
      bi.status,
      bi.is_recurrent,
      bi.notes,
      COALESCE(bi.sort_order, 0)
    FROM public.budget_items bi
    WHERE bi.category_id = source_category.id
    ORDER BY COALESCE(bi.sort_order, 0), bi.id;
  END LOOP;

  RETURN new_budget_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_tasks_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_budget_atomic(uuid, text) TO authenticated;
