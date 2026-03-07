-- Extend copilot_proposals.type to include mutation proposal types.
-- Replaces the check added in 20260306200000_copilot_proposals_add_milestone_type.sql.

ALTER TABLE public.copilot_proposals
  DROP CONSTRAINT IF EXISTS copilot_proposals_type_check;

ALTER TABLE public.copilot_proposals
  ADD CONSTRAINT copilot_proposals_type_check
    CHECK (type IN (
      'task', 'note', 'milestone',
      'delete_milestone', 'update_milestone',
      'delete_task', 'update_task',
      'delete_note', 'update_note'
    ));
