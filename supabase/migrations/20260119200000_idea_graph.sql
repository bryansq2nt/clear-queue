-- Idea Graph Module Schema
-- Creates tables for ideas, connections, boards, and project links
-- Stage 1: Database schema only (no RLS, no triggers, no app logic)

-- Table A: ideas
-- Global entities that exist independently of projects
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table B: idea_connections
-- Directed graph connections between ideas (idea ↔ idea)
CREATE TABLE idea_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  to_idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent self-loops
  CONSTRAINT no_self_loop CHECK (from_idea_id != to_idea_id),
  
  -- Prevent duplicate connections with same owner, direction, and type
  CONSTRAINT unique_connection UNIQUE (owner_id, from_idea_id, to_idea_id, type)
);

-- Table C: idea_project_links
-- Many-to-many relationship between ideas and projects
CREATE TABLE idea_project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate links between same idea and project for same owner
  CONSTRAINT unique_idea_project_link UNIQUE (owner_id, idea_id, project_id)
);

-- Table D: idea_boards
-- Visual workspaces for organizing and viewing subsets of ideas
CREATE TABLE idea_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table E: idea_board_items
-- Junction table storing which ideas appear on which boards and their positions
CREATE TABLE idea_board_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES idea_boards(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate ideas on the same board
  CONSTRAINT unique_board_idea UNIQUE (owner_id, board_id, idea_id)
);

-- Indexes for performance optimization

-- ideas indexes
CREATE INDEX idx_ideas_owner_id ON ideas(owner_id);

-- idea_connections indexes
CREATE INDEX idx_idea_connections_owner_id ON idea_connections(owner_id);
CREATE INDEX idx_idea_connections_from_idea_id ON idea_connections(from_idea_id);
CREATE INDEX idx_idea_connections_to_idea_id ON idea_connections(to_idea_id);

-- idea_project_links indexes
CREATE INDEX idx_idea_project_links_owner_id ON idea_project_links(owner_id);
CREATE INDEX idx_idea_project_links_idea_id ON idea_project_links(idea_id);
CREATE INDEX idx_idea_project_links_project_id ON idea_project_links(project_id);

-- idea_boards indexes
CREATE INDEX idx_idea_boards_owner_id ON idea_boards(owner_id);

-- idea_board_items indexes
CREATE INDEX idx_idea_board_items_owner_id ON idea_board_items(owner_id);
CREATE INDEX idx_idea_board_items_board_id ON idea_board_items(board_id);
CREATE INDEX idx_idea_board_items_idea_id ON idea_board_items(idea_id);
