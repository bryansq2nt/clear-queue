-- Extend copilot_proposals.type to include mind_map proposal type.
-- Replaces the check added in 20260306220000_copilot_proposals_add_mutation_types.sql.

ALTER TABLE public.copilot_proposals
  DROP CONSTRAINT IF EXISTS copilot_proposals_type_check;

ALTER TABLE public.copilot_proposals
  ADD CONSTRAINT copilot_proposals_type_check
    CHECK (type IN (
      'task', 'note', 'milestone',
      'delete_milestone', 'update_milestone',
      'delete_task', 'update_task',
      'delete_note', 'update_note',
      'mind_map'
    ));
