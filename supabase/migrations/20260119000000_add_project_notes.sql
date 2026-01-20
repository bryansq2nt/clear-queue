-- Add notes column to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS notes text;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.notes IS 'Long-form notes and documentation for the project';
