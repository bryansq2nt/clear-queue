-- Allow type = 'milestone' in copilot_proposals.
-- Drops the existing check constraint and replaces it.

ALTER TABLE public.copilot_proposals
  DROP CONSTRAINT IF EXISTS copilot_proposals_type_check;

ALTER TABLE public.copilot_proposals
  ADD CONSTRAINT copilot_proposals_type_check
    CHECK (type IN ('task', 'note', 'milestone'));
