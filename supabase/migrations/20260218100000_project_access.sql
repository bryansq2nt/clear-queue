-- Track last time each user opened each project (for "recently opened" sorting)
CREATE TABLE project_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_project_access_user_id ON project_access(user_id);

ALTER TABLE project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access"
  ON project_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access"
  ON project_access FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own access"
  ON project_access FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
