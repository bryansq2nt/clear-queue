-- Extend copilot_proposals.type to include billing category CRUD so the Copilot can create, update, and delete categories.

ALTER TABLE public.copilot_proposals
  DROP CONSTRAINT IF EXISTS copilot_proposals_type_check;

ALTER TABLE public.copilot_proposals
  ADD CONSTRAINT copilot_proposals_type_check
    CHECK (type IN (
      'task', 'note', 'milestone',
      'delete_milestone', 'update_milestone',
      'delete_task', 'update_task',
      'delete_note', 'update_note',
      'mind_map',
      'link', 'delete_link', 'update_link',
      'todo_item', 'toggle_todo', 'delete_todo_item',
      'billing', 'update_billing', 'delete_billing',
      'billing_category', 'update_billing_category', 'delete_billing_category',
      'budget',
      'client'
    ));
