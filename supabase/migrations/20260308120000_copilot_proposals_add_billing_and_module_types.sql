-- Extend copilot_proposals.type to include billing, link, todo, budget, client (and any other types from the registry).
-- Without this, saveCopilotProposals fails when the AI returns proposals with type 'billing' (or other module types),
-- so the user never sees proposal cards ("no puedo ver las sugerencias").
-- Replaces the check from 20260307100000_copilot_proposals_add_mind_map_type.sql.

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
      'budget',
      'client'
    ));
