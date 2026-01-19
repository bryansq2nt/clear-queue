-- Migration: Add project categories and editing functionality
-- Date: 2026-01-18

-- A) Add category column to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'business';

-- Add CHECK constraint for valid categories
ALTER TABLE projects
ADD CONSTRAINT projects_category_check 
CHECK (category IN ('business', 'clients', 'development', 'internal_tools', 'operations', 'personal', 'research', 'archived'));

-- B) Add updated_at to projects if not exists
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- C) Ensure color column exists (it should already exist, but just in case)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS color TEXT;

-- D) Ensure foreign key has ON DELETE CASCADE
-- First, check if constraint exists and drop it if needed
DO $$
BEGIN
  -- Drop existing foreign key if it doesn't have CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'tasks' 
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'project_id'
  ) THEN
    -- Get the constraint name
    DECLARE
      constraint_name TEXT;
    BEGIN
      SELECT tc.constraint_name INTO constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'tasks' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'project_id'
      LIMIT 1;
      
      -- Drop and recreate with CASCADE
      EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END;
  END IF;
END $$;

-- Recreate foreign key with CASCADE (if it was dropped)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'tasks' 
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'project_id'
  ) THEN
    ALTER TABLE tasks
    ADD CONSTRAINT tasks_project_id_fkey
    FOREIGN KEY (project_id)
    REFERENCES projects(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- E) Create trigger function for projects updated_at (if not exists)
CREATE OR REPLACE FUNCTION update_projects_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at_column();

-- Create index on category for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);

-- Update existing projects to have default category if somehow they don't
UPDATE projects SET category = 'business' WHERE category IS NULL;
