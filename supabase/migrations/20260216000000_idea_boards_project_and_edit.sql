-- Link board to a project (one board → one project)
-- Enables editing board name/description via app (columns already exist)
ALTER TABLE idea_boards
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_idea_boards_project_id ON idea_boards(project_id);

COMMENT ON COLUMN idea_boards.project_id IS 'Optional link: this board is associated with one project.';
