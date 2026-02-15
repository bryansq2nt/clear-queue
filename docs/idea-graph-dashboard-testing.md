# Idea Graph Dashboard - Testing Checklist

## Manual Testing Checklist

### 1. Dashboard Layout

- [ ] Click "Idea Graph" in sidebar - should navigate to `/ideas`
- [ ] Verify TopBar shows "Idea Graph - Task Board"
- [ ] Verify main sidebar (with projects) is still visible
- [ ] Verify main content area shows the Idea Graph Dashboard layout

### 2. Boards Sidebar

- [ ] Verify boards list appears in left panel (if boards exist)
- [ ] Click on a board - should load it in the canvas
- [ ] Verify selected board is highlighted
- [ ] Hover over a board - verify delete button appears
- [ ] Delete a board - verify it's removed and canvas updates
- [ ] If no boards exist, verify message "No boards yet. Create one to get started."

### 3. Creating Boards

- [ ] Click "New Board" button in header
- [ ] Enter board name and press Enter - board should be created
- [ ] Verify new board appears in sidebar
- [ ] Verify new board is automatically selected
- [ ] Cancel board creation with Escape key or Cancel button

### 4. Canvas View

- [ ] Verify canvas shows when a board is selected
- [ ] Verify nodes (ideas) appear on canvas with correct positions
- [ ] Verify connections (lines) between connected ideas are visible
- [ ] If board is empty, verify message "No ideas on this board yet..."

### 5. Creating Ideas

- [ ] Click "New Idea" button (requires board to be selected)
- [ ] Enter idea title and press Enter or click Create
- [ ] Verify idea appears on canvas at default position (400, 300)
- [ ] Verify idea can be clicked to open drawer
- [ ] Cancel idea creation with Cancel button

### 6. Dragging Nodes

- [ ] Click and drag a node - verify it moves smoothly
- [ ] Release mouse - verify position is saved to database
- [ ] Verify connections update when node moves
- [ ] Verify node cannot be dragged in connection mode

### 7. Connections

- [ ] Right-click on a node - verify connection mode activates
- [ ] Verify indicator appears: "Connection mode: Click another node to connect"
- [ ] Click another node - verify connection is created
- [ ] Verify connection line appears between nodes
- [ ] Press ESC to cancel connection mode
- [ ] Click on a connection line - verify delete confirmation appears
- [ ] Confirm deletion - verify connection is removed

### 8. Idea Drawer (Right Panel)

- [ ] Click on a node - verify drawer opens on the right
- [ ] Verify drawer shows idea title and description
- [ ] Click "Edit" - verify form appears
- [ ] Edit title and description, click "Save" - verify changes persist
- [ ] Verify changes are reflected on canvas node

### 9. Project Links in Drawer

- [ ] In drawer, verify "Linked Projects" section
- [ ] Select a project from dropdown
- [ ] Optionally enter a role
- [ ] Click "Link Project" - verify project appears in linked list
- [ ] Verify project name (not just ID) is displayed
- [ ] Click "Unlink" on a project - verify it's removed
- [ ] Verify projects already linked don't appear in dropdown

### 10. Delete Idea

- [ ] Open idea drawer
- [ ] Click "Delete" button
- [ ] Confirm deletion - verify idea is removed from canvas
- [ ] Verify drawer closes after deletion
- [ ] Verify connections to deleted idea are also removed (CASCADE)

### 11. Board Switching

- [ ] Create multiple boards
- [ ] Add different ideas to different boards
- [ ] Switch between boards - verify canvas shows correct ideas
- [ ] Verify connections are filtered per board (only connections between ideas on current board)

### 12. Edge Cases

- [ ] Try to create idea without selecting board - verify button is disabled
- [ ] Try to create connection from idea to itself - verify error (should be prevented by constraints)
- [ ] Try to link same project twice - verify error message
- [ ] Verify all changes persist after page refresh
- [ ] Verify no navigation away from dashboard for normal operations

### 13. Integration

- [ ] Navigate to `/ideas/[id]` directly - verify detail page still works (deep link)
- [ ] Verify `/dashboard` is unchanged and works as before
- [ ] Verify projects sidebar navigation still works from Idea Graph page
