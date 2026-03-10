# Context Modules and Copilot Capabilities — Audit

**Date:** 2026-03-09  
**Scope:** All context tabs under `/context/[projectId]/`, their UI actions, Copilot proposal types (registry + schema), and gap analysis.

---

## 1. Context modules: routes and server actions

| Module     | Route path                                                    | Main server action files                                                                                                                                               |
| ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board      | `/context/[projectId]` (root) or `/context/[projectId]/board` | `app/actions/tasks.ts`                                                                                                                                                 |
| Owner      | `/context/[projectId]/owner`                                  | `app/actions/projects.ts`, `app/actions/clients.ts`, `app/actions/businesses.ts`                                                                                       |
| Documents  | `/context/[projectId]/documents`                              | `app/actions/documents.ts`, `app/actions/document-folders.ts`                                                                                                          |
| Media      | `/context/[projectId]/media`                                  | `app/actions/media.ts`                                                                                                                                                 |
| Calendar   | `/context/[projectId]/calendar`                               | `app/actions/calendar.ts`                                                                                                                                              |
| Notes      | `/context/[projectId]/notes`                                  | `app/actions/notes.ts`, `app/actions/note-folders.ts`                                                                                                                  |
| Links      | `/context/[projectId]/links`                                  | `app/context/[projectId]/links/actions.ts` (local)                                                                                                                     |
| Ideas      | `/context/[projectId]/ideas`                                  | `app/actions/idea-boards.ts`, `app/actions/ideas.ts`, `app/actions/idea-canvas-batch.ts`, `app/actions/idea-canvas-connection.ts`, `app/actions/idea-project-links.ts` |
| Budgets    | `/context/[projectId]/budgets`                                | `app/actions/budgets.ts`, `app/actions/budget-detail.ts`                                                                                                               |
| Billings   | `/context/[projectId]/billings`                               | `app/actions/billings.ts`                                                                                                                                              |
| Milestones | `/context/[projectId]/milestones`                             | `app/actions/milestones.ts`                                                                                                                                            |
| Todos      | `/context/[projectId]/todos`                                  | `app/actions/todo.ts`, `lib/todo/lists.ts` (todo lists/items)                                                                                                          |
| Copilot    | `/context/[projectId]/copilot`                                | `app/context/[projectId]/copilot/actions.ts`, Copilot API + registry                                                                                                   |

**Note:** Todos is a route under context but is **not** in `ModuleKey` in `lib/modules/registry.ts` (no tab in the tab bar; documented as “tab currently commented out” in calendar audit). Board maps to project root (`slug: 'board'`).

---

## 2. UI actions per module

### 2.1 Board (tasks)

- **Create task** — `createTask` (FormData) → `create_task_atomic` RPC (`app/actions/tasks.ts`). UI: `AddTaskModal`, `ContextBoardClient`.
- **Update task** — `updateTask(id, formData)`. UI: `EditTaskModal`.
- **Delete task** — `deleteTask(id)`. UI: `EditTaskModal`.
- **Reorder / move task** — `updateTaskOrder(taskId, newStatus, newOrderIndex, ...)`. UI: `KanbanBoard` (drag-and-drop).

### 2.2 Owner (client, business, project responsible)

- **Update project** — set `client_id` on project (`updateProject`). UI: `ContextOwnerClient` (select client).
- **Link business to project** — `linkBusinessToProject`. UI: `ContextOwnerClient`.
- **Create client** — `createClientAction`. UI: `CreateClientModal`.
- **Create business** — `createBusinessAction`. UI: `CreateBusinessModal`.
- **Update client** — `updateClientAction`. UI: `EditClientModal`.
- **Select client for project** — pick existing client and call `updateProject` with `client_id`.
- **Select business for project** — pick existing business and link via `linkBusinessToProject`.

### 2.3 Documents

- **Upload document** — via `app/actions/documents.ts` (upload + insert). UI: `UploadDocumentDialog`, `ContextDocumentsClient`.
- **Update document** — `updateDocument` (metadata: title, category, etc.). UI: `EditDocumentDialog`.
- **Archive document** — `archiveDocument`. UI: row actions.
- **Delete document** — `deleteDocument`, `deleteDocuments`. UI: `DeleteDocumentsConfirmDialog`.
- **Create folder** — `app/actions/document-folders.ts` (`createFolder`). UI: `CreateFolderDialog`.
- **Delete folder(s)** — `deleteFolders` (document-folders). UI: `DeleteFoldersConfirmDialog`.
- **Move documents to folder** — update document’s folder. UI: `MoveDocumentsToFolderDialog`.
- **Touch document** — `touchDocument` (e.g. last opened).

### 2.4 Media

- **Upload media** — `app/actions/media.ts`. UI: `UploadMediaDialog`, `ContextMediaClient`.
- **Update media** — edit metadata (e.g. category, title). UI: `EditMediaDialog`.
- **Touch media** — `touchMedia`.
- **Archive / unarchive** — `archiveMedia`, `unarchiveMedia`.
- **Delete media** — `deleteMedia`.
- **Mark final** — `markMediaFinal`.
- **Create share link** — `createMediaShareLink`.

### 2.5 Calendar

- **Read feed** — `getProjectCalendarFeed` (tasks, billings, todo_items, events).
- **Create calendar event** — `createCalendarEvent` (`app/actions/calendar.ts`). UI: `CreateEventDialog`, `ContextCalendarClient`.
- **Delete calendar event** — `deleteCalendarEvent`. UI: `CalendarDayDialog` / context.

### 2.6 Notes

- **Create note** — `createNote`. UI: new-note flow, `NoteEditor` (save new).
- **Update note** — `updateNote` (title, content, folder_id). UI: `NoteEditor`, folder move.
- **Delete note** — `deleteNote`, `deleteNotes`. UI: row menu, `DeleteNotesConfirmDialog`.
- **Create folder** — `createFolder` (`app/actions/note-folders.ts`). UI: `CreateFolderDialog`.
- **Rename folder** — `updateFolder` (note-folders). UI: folder edit (if exposed).
- **Delete folder(s)** — `deleteFolders` (note-folders). UI: `DeleteFoldersConfirmDialog`.
- **Move note(s) to folder** — `updateNote(noteId, { folder_id })`. UI: `MoveNotesToFolderDialog`, inline move.
- **Delete note link** — `deleteNoteLink` (from `NoteEditor`).

### 2.7 Links

- **Create link** — `createProjectLinkAction(projectId, input)`. UI: `LinkEditDialog` (create mode), `ContextLinksClient`.
- **Update link** — `updateProjectLinkAction`. UI: `LinkEditDialog` (edit mode).
- **Archive link** — `archiveProjectLinkAction`. UI: dropdown.
- **Reorder links** — `reorderProjectLinksAction`. UI: drag-and-drop in `ContextLinksClient`.
- **Link categories:**
  - **List categories** — `listLinkCategoriesAction` (with seed defaults).
  - **Create category** — `createLinkCategoryAction(name)`.
  - **Update category** — `updateLinkCategoryAction(categoryId, name)`.
  - **Delete category** — `deleteLinkCategoryAction(categoryId)`.

### 2.8 Ideas (mind maps)

- **Create board** — `createBoardWithProjectAction(name, projectId)`. UI: `ContextIdeasClient`.
- **Update board** — `updateBoardAction` (name, description). UI: `ContextBoardViewClient`.
- **Create idea** — `createIdeaAction` + `addIdeaToBoardAction` (add to board with position). UI: board view.
- **Update idea** — `updateIdeaAction`. UI: `IdeaDrawer`.
- **Delete idea** — `deleteIdeaAction`. UI: `IdeaDrawer`.
- **Add idea to board** — `addIdeaToBoardAction` (position x,y). UI: board.
- **Batch update positions** — `batchUpdatePositionsAction`. UI: `IdeaGraphCanvas` (drag).
- **Create connection** — `createConnectionAction`. UI: `IdeaGraphCanvas`.
- **Delete connection** — `deleteConnectionAction`. UI: `IdeaGraphCanvas`.
- **Link idea to project** / **Unlink idea from project** — `linkIdeaToProjectAction`, `unlinkIdeaFromProjectAction`. UI: `IdeaDrawer`.

### 2.9 Budgets

- **Create budget** — `createBudget`. UI: `CreateBudgetModal`, `ContextBudgetsClient`.
- **Update budget** — `updateBudget`. UI: `EditBudgetModal`, `BudgetCard` (e.g. duplicate).
- **Duplicate budget** — via budgets actions (if implemented). UI: `BudgetCard`.
- **Create category** — `createCategory` (budget-detail). UI: `CreateCategoryModal`, `BudgetDetailClient`.
- **Update category** — `updateCategory`. UI: `EditCategoryModal`.
- **Delete category** — `deleteCategory`. UI: `CategorySection`.
- **Create item** — `createItem`. UI: `CreateItemModal`.
- **Update item** — `updateItem`. UI: `EditItemModal`.
- **Delete item(s)** — `deleteItem`, `deleteItems`. UI: `ItemsList`.
- **Reorder categories / items** — `reorderCategories`, `reorderItems`. UI: `BudgetDetailClient` (DnD).

### 2.10 Billings

- **Create billing** — `createBilling`. UI: `ContextBillingsClient`.
- **Update billing** — `updateBilling`. UI: edit dialog.
- **Update billing status** — `updateBillingStatus`. UI: status controls.
- **Delete billing** — `deleteBilling`. UI: delete action.
- **Create billing category** — `createBillingCategory`. UI: `ContextBillingsClient`.
- **Delete billing category** — `deleteBillingCategory`. UI: (if exposed).
- **Update billing category** — not present in `app/actions/billings.ts`; Copilot has `update_billing_category`.

### 2.11 Milestones

- **Create milestone** — `createMilestone(projectId, { title, description })`. UI: `ContextMilestonesClient`.
- **Update milestone** — `updateMilestone(id, { title, description })`. UI: edit dialog.
- **Delete milestone** — `deleteMilestone(id)`. UI: delete confirm.
- **Complete milestone** — `completeMilestone(id)`. UI: button.
- **Reopen milestone** — `reopenMilestone(id)`. UI: button.

### 2.12 Todos

- **Create todo item** — `createItem(content)` (via `useProjectTodoBoard` → `createTodoItemAtomic`). UI: `ContextTodosClient` form.
- **Toggle todo item** — `toggleItem(item)`. UI: checkbox in `TaskRow`.
- **Update todo item content** — `updateItem(item, content)`. UI: inline edit in `TaskRow`.
- **Delete todo item** — `deleteItem(item)`. UI: `TaskRow`.
- **Todo lists:** `app/actions/todo.ts` and `lib/todo/lists.ts` expose `createTodoList`, `updateTodoList`, `renameTodoList`, `archiveTodoList`, `deleteTodoList`. Context todos tab uses a single default list and does not expose list CRUD in-context; list management may live under `/todo` routes.

---

## 3. Copilot: proposal types and registry

### 3.1 ProposalType union (`lib/copilot/schema.ts`)

```ts
export type ProposalType =
  | 'task'
  | 'note'
  | 'milestone'
  | 'delete_milestone'
  | 'update_milestone'
  | 'delete_task'
  | 'update_task'
  | 'delete_note'
  | 'update_note'
  | 'mind_map'
  | 'billing'
  | 'update_billing'
  | 'delete_billing'
  | 'billing_category'
  | 'update_billing_category'
  | 'delete_billing_category'
  | 'budget'
  | 'update_budget'
  | 'delete_budget'
  | 'budget_category'
  | 'update_budget_category'
  | 'delete_budget_category'
  | 'budget_item'
  | 'update_budget_item'
  | 'delete_budget_item'
  | 'client'
  | 'note_folder'
  | 'update_note_folder'
  | 'delete_note_folder';
```

**Note:** The **DB** `copilot_proposals.type` CHECK (migration `20260308180000`) **does** include `link`, `delete_link`, `update_link`, `todo_item`, `toggle_todo`, `delete_todo_item`. The **TypeScript** `ProposalType` union and `CopilotProposal.payload` in `lib/copilot/schema.ts` do **not** include those types; they exist in `ParsedProposal` and in the registry. So link/todo proposals work at runtime; the schema types are incomplete and should be aligned for type safety.

### 3.2 Registry capabilities (`lib/copilot/registry/`)

| Module     | File                    | Proposal types (capabilities)                                                                                                                                                |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks      | `modules/tasks.ts`      | `task`, `delete_task`, `update_task`                                                                                                                                         |
| Notes      | `modules/notes.ts`      | `note`, `delete_note`, `update_note`, `note_folder`, `update_note_folder`, `delete_note_folder`                                                                              |
| Milestones | `modules/milestones.ts` | `milestone`, `delete_milestone`, `update_milestone`                                                                                                                          |
| Ideas      | `modules/ideas.ts`      | `mind_map` (create board + nodes + edges)                                                                                                                                    |
| Links      | `modules/links.ts`      | `link`, `delete_link`, `update_link`                                                                                                                                         |
| Todos      | `modules/todos.ts`      | `todo_item`, `toggle_todo`, `delete_todo_item`                                                                                                                               |
| Billings   | `modules/billings.ts`   | `billing`, `update_billing`, `delete_billing`, `billing_category`, `update_billing_category`, `delete_billing_category`                                                      |
| Budgets    | `modules/budgets.ts`    | `budget`, `update_budget`, `delete_budget`, `budget_category`, `update_budget_category`, `delete_budget_category`, `budget_item`, `update_budget_item`, `delete_budget_item` |
| Clients    | `modules/clients.ts`    | `client` (create only)                                                                                                                                                       |
| Documents  | `modules/documents.ts`  | **None** — context fetcher only (`fetchDocumentsContext`). “Documents are read-only; the Copilot can reference them but cannot create or upload.”                            |

### 3.3 Context fetchers (used in system prompt / context build)

- Tasks, notes, milestones, ideas, links, todos, billings, budgets, clients, documents are all used in `lib/copilot/context.ts` (or via registry fetchers). Calendar and media do not have Copilot proposal types; they are not in the registry as capability modules.

---

## 4. Gap analysis: UI vs Copilot

### 4.1 Board (tasks)

| UI can do           | Copilot can do | Copilot CANNOT do                                                    |
| ------------------- | -------------- | -------------------------------------------------------------------- |
| Create task         | ✅ Create task | Reorder / move task (no `move_task` or `update_task_order` proposal) |
| Update task         | ✅ Update task | —                                                                    |
| Delete task         | ✅ Delete task | —                                                                    |
| Reorder / move task | ❌             | Reorder or move task between columns                                 |

### 4.2 Owner (clients, businesses, project responsible)

| UI can do                | Copilot can do   | Copilot CANNOT do                                          |
| ------------------------ | ---------------- | ---------------------------------------------------------- |
| Create client            | ✅ Create client | —                                                          |
| Update client            | ❌               | Update client (no `update_client`)                         |
| Create business          | ❌               | Create business                                            |
| Update business          | ❌               | Update business                                            |
| Set project client       | ❌               | Assign/link client to project (`update_project` client_id) |
| Link business to project | ❌               | Link business to project                                   |

### 4.3 Documents

| UI can do        | Copilot can do | Copilot CANNOT do                                       |
| ---------------- | -------------- | ------------------------------------------------------- |
| Upload document  | ❌             | Upload document (documents module is read-only context) |
| Update document  | ❌             | Update document metadata                                |
| Archive / delete | ❌             | Archive or delete document                              |
| Create folder    | ❌             | Create document folder                                  |
| Delete folder    | ❌             | Delete document folder                                  |
| Move to folder   | ❌             | Move document to folder                                 |

### 4.4 Media

| UI can do                 | Copilot can do | Copilot CANNOT do                      |
| ------------------------- | -------------- | -------------------------------------- |
| Upload media              | ❌             | Upload media (no media proposal types) |
| Update / archive / delete | ❌             | Any media mutation                     |
| Share link                | ❌             | Create share link                      |

### 4.5 Calendar

| UI can do             | Copilot can do | Copilot CANNOT do     |
| --------------------- | -------------- | --------------------- |
| Create calendar event | ❌             | Create calendar event |
| Delete calendar event | ❌             | Delete calendar event |

(Calendar is only reflected in context as feed items from tasks/billings/todo/events; no calendar-specific proposal types.)

### 4.6 Notes

| UI can do           | Copilot can do                   | Copilot CANNOT do |
| ------------------- | -------------------------------- | ----------------- |
| Create note         | ✅ Create note                   | —                 |
| Update note         | ✅ Update note (incl. folder_id) | —                 |
| Delete note         | ✅ Delete note                   | —                 |
| Create folder       | ✅ Create note folder            | —                 |
| Rename folder       | ✅ Update note folder            | —                 |
| Delete folder       | ✅ Delete note folder            | —                 |
| Move note to folder | ✅ update_note with folder_id    | —                 |
| Delete note link    | ❌                               | Delete note link  |

### 4.7 Links

| UI can do       | Copilot can do | Copilot CANNOT do                                 |
| --------------- | -------------- | ------------------------------------------------- |
| Create link     | ✅ Create link | —                                                 |
| Update link     | ✅ Update link | —                                                 |
| Delete link     | ✅ Delete link | Archive link (UI has archive; Copilot has delete) |
| Reorder links   | ❌             | Reorder links                                     |
| Create category | ❌             | Create link category                              |
| Update category | ❌             | Update link category                              |
| Delete category | ❌             | Delete link category                              |

### 4.8 Ideas (mind maps)

| UI can do                   | Copilot can do                      | Copilot CANNOT do                            |
| --------------------------- | ----------------------------------- | -------------------------------------------- |
| Create board                | ✅ mind_map (board + nodes + edges) | —                                            |
| Update board                | ❌                                  | Update board name/description                |
| Create idea                 | ❌                                  | Create single idea (only via mind_map batch) |
| Update idea                 | ❌                                  | Update idea                                  |
| Delete idea                 | ❌                                  | Delete idea                                  |
| Add idea to board           | ❌                                  | Add existing idea to board (position)        |
| Move nodes (position)       | ❌                                  | Batch update positions                       |
| Create connection           | ❌                                  | Create connection between existing ideas     |
| Delete connection           | ❌                                  | Delete connection                            |
| Link/unlink idea to project | ❌                                  | Link/unlink idea to project                  |

### 4.9 Budgets

| UI can do                | Copilot can do            | Copilot CANNOT do           |
| ------------------------ | ------------------------- | --------------------------- |
| Create budget            | ✅ Create budget          | —                           |
| Update budget            | ✅ Update budget          | —                           |
| Delete budget            | ✅ Delete budget          | —                           |
| Create category          | ✅ Create budget category | —                           |
| Update category          | ✅ Update budget category | —                           |
| Delete category          | ✅ Delete budget category | —                           |
| Create item              | ✅ Create budget item     | —                           |
| Update item              | ✅ Update budget item     | —                           |
| Delete item              | ✅ Delete budget item     | —                           |
| Reorder categories/items | ❌                        | Reorder categories or items |

### 4.10 Billings

| UI can do       | Copilot can do             | Copilot CANNOT do                              |
| --------------- | -------------------------- | ---------------------------------------------- |
| Create billing  | ✅ Create billing          | —                                              |
| Update billing  | ✅ Update billing          | —                                              |
| Delete billing  | ✅ Delete billing          | —                                              |
| Create category | ✅ Create billing category | —                                              |
| Update category | ✅ Update billing category | UI has no update category (only create/delete) |
| Delete category | ✅ Delete billing category | —                                              |

### 4.11 Milestones

| UI can do          | Copilot can do      | Copilot CANNOT do  |
| ------------------ | ------------------- | ------------------ |
| Create milestone   | ✅ Create milestone | —                  |
| Update milestone   | ✅ Update milestone | —                  |
| Delete milestone   | ✅ Delete milestone | —                  |
| Complete milestone | ❌                  | Complete milestone |
| Reopen milestone   | ❌                  | Reopen milestone   |

### 4.12 Todos

| UI can do           | Copilot can do      | Copilot CANNOT do                                |
| ------------------- | ------------------- | ------------------------------------------------ |
| Create item         | ✅ Create todo item | —                                                |
| Toggle item         | ✅ Toggle todo      | —                                                |
| Delete item         | ✅ Delete todo item | —                                                |
| Update item content | ❌                  | Update todo item content (no `update_todo_item`) |
| Create list         | ❌                  | Create todo list                                 |
| Rename list         | ❌                  | Rename/update todo list                          |
| Archive/delete list | ❌                  | Archive or delete todo list                      |

---

## 5. Summary table of gaps

| Module         | Copilot CANNOT do (missing vs UI)                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Board**      | Reorder / move task between columns                                                                                                  |
| **Owner**      | Update client; create/update business; assign client to project; link business to project                                            |
| **Documents**  | Upload, update, archive, delete document; create/delete document folder; move to folder (entire module is read-only in Copilot)      |
| **Media**      | Any mutation (upload, update, archive, delete, share link)                                                                           |
| **Calendar**   | Create calendar event; delete calendar event                                                                                         |
| **Notes**      | Delete note link (minor)                                                                                                             |
| **Links**      | Reorder links; create/update/delete link category; archive link (only delete)                                                        |
| **Ideas**      | Update board; create/update/delete single idea; add idea to board; move nodes; create/delete connection; link/unlink idea to project |
| **Budgets**    | Reorder categories or items                                                                                                          |
| **Billings**   | (Parity except UI lacks update billing category; Copilot has it.)                                                                    |
| **Milestones** | Complete milestone; reopen milestone                                                                                                 |
| **Todos**      | Update todo item content; create/rename/archive/delete todo list                                                                     |

---

## 6. Recommended implementation order (parity roadmap)

To reach “todo lo que hace la UI lo puede hacer Copilot”, suggested order by impact and dependency:

| Priority | Module         | Missing capabilities                                                                                                                 | Notes                                                                                                 |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **P1**   | **Owner**      | `update_client`, `business` (create/update), assign client to project, link business to project                                      | Core “cliente + empresa” flow; user explicitly asked for this.                                        |
| **P1**   | **Board**      | `move_task` (reorder / move between columns)                                                                                         | Very common request; one new proposal type + approve calling `updateTaskOrder` or `move_task_atomic`. |
| **P2**   | **Milestones** | `complete_milestone`, `reopen_milestone`                                                                                             | Small extension; already have update/delete.                                                          |
| **P2**   | **Todos**      | `update_todo_item` (edit content); optional: todo list CRUD                                                                          | Update item is used often in UI.                                                                      |
| **P2**   | **Links**      | Reorder links; link category CRUD (`create_link_category`, `update_link_category`, `delete_link_category`); optional: `archive_link` | Categories and reorder are standard in UI.                                                            |
| **P3**   | **Ideas**      | Update board; create/update/delete single idea; add idea to board; create/delete connection; link/unlink to project; batch positions | More types and context; can be phased (e.g. update_board + single idea CRUD first).                   |
| **P3**   | **Budgets**    | Reorder categories; reorder items                                                                                                    | Needs RPC or batch update; UI already has DnD.                                                        |
| **P4**   | **Documents**  | Upload, update, archive, delete document; document folder CRUD; move to folder                                                       | Requires file upload flow and storage in approve; larger scope.                                       |
| **P4**   | **Calendar**   | Create calendar event; delete calendar event                                                                                         | Isolated; few types.                                                                                  |
| **P4**   | **Media**      | Upload, update, archive, delete, share link                                                                                          | Similar to documents; likely lower demand than Owner/Board.                                           |
| **P5**   | **Notes**      | Delete note link                                                                                                                     | Minor; single proposal type.                                                                          |

---

## 7. Schema vs registry note

- **Link and todo proposal types** are implemented in the registry and have payloads in `ParsedProposal`. The **DB** CHECK allows them. They are **not** in the TypeScript `ProposalType` union or `CopilotProposal.payload` in `lib/copilot/schema.ts` — align the schema so new proposal types (e.g. Owner, move_task) are added to both the DB CHECK and the schema.

---

_End of audit._
