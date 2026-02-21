# Idea Graph

## Purpose

Idea Graph is a thinking and connection module that exists before execution. It enables users to capture, organize, and link ideas globally across the system, forming a knowledge graph that supports strategic planning and ideation. Ideas are not tasks, notes, or project artifacts—they are independent entities that can be explored, connected, and later linked to projects when ready for execution.

## What it is

- A global idea repository where all ideas exist independently of projects
- A graph-based system where ideas connect to other ideas through relationships
- A visualization and exploration tool for understanding connections between concepts
- A bridge between ideation and execution, allowing ideas to be linked to projects when they mature
- A workspace for thinking through problems and solutions before committing to structured project work

## What it is NOT

- A task management system (tasks belong to projects and have execution states)
- A note-taking system (notes are project-specific documentation)
- A traditional mind map tool (ideas are nodes in a graph, not hierarchical trees)
- A project planning tool (projects are separate entities that ideas can link to)
- A collaboration workspace (MVP is single-user focused)
- An AI-powered suggestion engine (no AI features in MVP)

## Core Entities

### Ideas

- **Global entities** that exist independently of projects
- Have a title, description, and optional metadata (tags, color, creation date)
- Can be created, edited, and deleted
- Exist in a global namespace accessible from anywhere in the system

### Connections

- **Directed or undirected relationships** between two ideas
- Represent conceptual links (e.g., "relates to", "depends on", "contradicts", "extends")
- Can be created, edited, and deleted
- Form the graph structure that allows navigation between related ideas

### Boards

- **Visual workspaces** for organizing and viewing subsets of ideas
- Allow users to place ideas on a canvas for spatial organization
- Boards are views/filters, not containers—ideas remain global
- Multiple boards can contain the same idea
- Support different layouts and arrangements for different thinking contexts

### Project Links

- **Bidirectional relationships** between ideas and projects
- An idea can link to multiple projects
- A project can link to multiple ideas
- Links are references, not ownership—ideas remain global
- Enable traceability from ideation to execution

## Core Rules

- Ideas are **always global**—they never belong to a project, only link to projects
- Ideas can exist without any connections, boards, or project links
- Connections are between ideas only (not between ideas and projects directly)
- Boards are organizational views—removing an idea from a board does not delete the idea
- Deleting an idea removes it from all boards and severs all connections and project links
- Project links are independent of connections—an idea can link to a project without being connected to other ideas
- All ideas are accessible from a global idea library/view
- Boards persist their layout/positioning of ideas for the user

## User Flows (MVP)

### Create Idea

1. User navigates to Idea Graph section
2. User clicks "Create Idea" or uses keyboard shortcut
3. Modal/form appears with fields: title (required), description (optional), tags (optional)
4. User saves idea
5. Idea appears in global idea list and can be added to boards

### Connect Ideas

1. User selects an idea (from board or list view)
2. User clicks "Connect" or drags from idea to another idea
3. User selects connection type (optional—default is "relates to")
4. Connection is created and visualized as an edge in the graph
5. Both ideas show the connection in their detail views

### Create Board

1. User navigates to Idea Graph section
2. User clicks "New Board"
3. User provides board name
4. Empty board canvas is created
5. User can start adding ideas to the board

### Place Idea on Board

1. User is viewing a board (canvas view)
2. User drags idea from sidebar/library onto board, or uses "Add to Board" action
3. Idea appears on board at dropped position
4. Idea can be repositioned by dragging
5. Same idea can be added to multiple boards

### Link Idea to Project

1. User views idea detail/sidebar
2. User clicks "Link to Project"
3. User selects project(s) from dropdown/list
4. Link is created—idea now appears in project's linked ideas section
5. From project view, user can navigate to linked ideas

## Non-goals (for now)

- **Zoom and pan controls** for graph visualization (basic view only)
- **Collaboration features** (sharing, permissions, multi-user editing)
- **AI features** (suggestions, auto-connections, content generation)
- **Comments and discussions** on ideas
- **Versioning and history** (no edit history or idea versions)
- **Advanced graph algorithms** (path finding, clustering, recommendations)
- **Export/import** functionality (no data portability features)
- **Templates** for idea structures
- **Rich text editing** (plain text descriptions only)
- **File attachments** to ideas
- **Search and filtering** beyond basic text search (no advanced filters in MVP)
- **Custom connection types** (fixed set of relationship types)
- **Board templates** or pre-configured layouts
- **Keyboard shortcuts** for graph navigation (basic shortcuts only)
