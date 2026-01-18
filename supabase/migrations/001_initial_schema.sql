-- Create enum type for task status
CREATE TYPE task_status AS ENUM ('backlog', 'next', 'in_progress', 'blocked', 'done');

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status task_status NOT NULL DEFAULT 'next',
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  due_date DATE,
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on tasks for better query performance
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_order_index ON tasks(order_index);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Function to check if user is admin
-- Note: ADMIN_EMAIL should be set as a Supabase secret or checked in application code
-- For RLS, we'll create a function that can be called from policies
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();
  
  -- This will be set via Supabase secrets or environment variable
  -- For now, we'll allow authenticated users and check in app code
  RETURN user_email IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for projects
-- Allow all authenticated users (admin check happens in application code)
CREATE POLICY "Authenticated users can access projects"
  ON projects
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for tasks
-- Allow all authenticated users (admin check happens in application code)
CREATE POLICY "Authenticated users can access tasks"
  ON tasks
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
