-- Idea Graph Module - Row Level Security (RLS) Policies
-- Stage 2: Enable RLS and create security policies for all Idea Graph tables
-- Ensures users can only access their own data (owner_id = auth.uid())

-- ============================================================================
-- Table: ideas
-- Global entities that exist independently of projects
-- ============================================================================
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own ideas
CREATE POLICY "Users can select their own ideas"
  ON ideas
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: Users can only INSERT ideas with their own owner_id
CREATE POLICY "Users can insert their own ideas"
  ON ideas
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only UPDATE their own ideas, and cannot change owner_id
CREATE POLICY "Users can update their own ideas"
  ON ideas
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only DELETE their own ideas
CREATE POLICY "Users can delete their own ideas"
  ON ideas
  FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================================
-- Table: idea_connections
-- Directed graph connections between ideas (idea ↔ idea)
-- ============================================================================
ALTER TABLE idea_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own connections
CREATE POLICY "Users can select their own idea connections"
  ON idea_connections
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: Users can only INSERT connections with their own owner_id
CREATE POLICY "Users can insert their own idea connections"
  ON idea_connections
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only UPDATE their own connections, and cannot change owner_id
CREATE POLICY "Users can update their own idea connections"
  ON idea_connections
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only DELETE their own connections
CREATE POLICY "Users can delete their own idea connections"
  ON idea_connections
  FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================================
-- Table: idea_project_links
-- Many-to-many relationship between ideas and projects
-- Note: Only enforces owner_id-based access. Projects table has its own RLS.
-- ============================================================================
ALTER TABLE idea_project_links ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own idea-project links
CREATE POLICY "Users can select their own idea project links"
  ON idea_project_links
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: Users can only INSERT links with their own owner_id
CREATE POLICY "Users can insert their own idea project links"
  ON idea_project_links
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only UPDATE their own links, and cannot change owner_id
CREATE POLICY "Users can update their own idea project links"
  ON idea_project_links
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only DELETE their own links
CREATE POLICY "Users can delete their own idea project links"
  ON idea_project_links
  FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================================
-- Table: idea_boards
-- Visual workspaces for organizing and viewing subsets of ideas
-- ============================================================================
ALTER TABLE idea_boards ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own boards
CREATE POLICY "Users can select their own idea boards"
  ON idea_boards
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: Users can only INSERT boards with their own owner_id
CREATE POLICY "Users can insert their own idea boards"
  ON idea_boards
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only UPDATE their own boards, and cannot change owner_id
CREATE POLICY "Users can update their own idea boards"
  ON idea_boards
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only DELETE their own boards
CREATE POLICY "Users can delete their own idea boards"
  ON idea_boards
  FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================================
-- Table: idea_board_items
-- Junction table storing which ideas appear on which boards and their positions
-- ============================================================================
ALTER TABLE idea_board_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own board items
CREATE POLICY "Users can select their own idea board items"
  ON idea_board_items
  FOR SELECT
  USING (owner_id = auth.uid());

-- Policy: Users can only INSERT board items with their own owner_id
CREATE POLICY "Users can insert their own idea board items"
  ON idea_board_items
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only UPDATE their own board items, and cannot change owner_id
CREATE POLICY "Users can update their own idea board items"
  ON idea_board_items
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Policy: Users can only DELETE their own board items
CREATE POLICY "Users can delete their own idea board items"
  ON idea_board_items
  FOR DELETE
  USING (owner_id = auth.uid());
