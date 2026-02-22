# Contenido de carpetas en `app/` y código no utilizado

**Fecha:** 2026-02-22  
**Objetivo:** Aclarar qué hay en cada carpeta bajo `app/` (fuera de `context/`) y qué archivos siguen en uso vs cuáles son solo redirects o código muerto.

---

## 1. Por qué siguen existiendo carpetas “antiguas”

Después de pasar a **navegación por contexto** (`/context/[projectId]/...`):

- Las **rutas** `/dashboard`, `/ideas`, `/budgets`, etc. ahora **redirigen a `/`** para no romper bookmarks.
- La **lógica y componentes** (actions, modales, detalle de presupuesto, editor de notas, etc.) **sí se usan** desde las vistas de contexto.
- Por eso en `app/` siguen existiendo carpetas como `billings`, `budgets`, `clients`, etc.: contienen **lógica compartida** que usa `app/context/`.

La estructura actual es:

- **`app/context/`** → Rutas y vistas que el usuario usa (board, notes, budgets, billings, todos, etc.).
- **`app/billings/`, `app/budgets/`, `app/clients/`, etc.** → Acciones, componentes y detalle reutilizados por el contexto (y por modales como Add/Edit project).

---

## 2. Contenido de cada carpeta bajo `app/` (fuera de context)

### `app/billings/`

| Archivo      | Qué es                                                                                 | ¿Se usa?                                           |
| ------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `page.tsx`   | Redirect a `/`                                                                         | Sí (ruta); no renderiza UI                         |
| `actions.ts` | getBillings, getBillingsByProjectId, createBilling, updateBilling, updateBillingStatus | **Sí** – usado por `context/[projectId]/billings/` |

**Conclusión:** Mantener. La carpeta solo tiene la página redirect y la lógica que usa el contexto.

---

### `app/budgets/`

| Archivo                            | Qué es                                                       | ¿Se usa?                                                                                        |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `page.tsx`                         | Redirect a `/`                                               | Sí (ruta)                                                                                       |
| `actions.ts`                       | getBudgetsByProjectId, getBudgetProjectId, getProjects, etc. | **Sí** – context budgets, notes (getProjects), todo, projects                                   |
| `[id]/page.tsx`                    | Página de detalle de presupuesto                             | **Sí** – solo se entra desde contexto: `context/.../budgets/[budgetId]` usa este layout/detalle |
| `[id]/BudgetDetailClient.tsx`      | UI del detalle (categorías, ítems, FAB)                      | **Sí** – usado por `context/.../budgets/[budgetId]/page.tsx`                                    |
| `[id]/actions.ts`                  | getBudgetWithData, reorderCategories, reorderItems, etc.     | **Sí** – BudgetDetailClient                                                                     |
| `[id]/components/*`                | CategorySection, CreateCategoryModal, EditBudgetModal, etc.  | **Sí** – BudgetDetailClient                                                                     |
| `components/BudgetCard.tsx`        | **Sí** – ContextBudgetsClient                                |
| `components/CreateBudgetModal.tsx` | **Sí** – ContextBudgetsClient                                |
| `components/EmptyState.tsx`        | **Sí** – ContextBudgetsClient                                |

**Conclusión:** Todo se usa. Las únicas “páginas de módulo” son redirects; el resto es lógica/detalle compartido con contexto.

---

### `app/businesses/`

| Archivo         | Qué es                               | ¿Se usa?                                                              |
| --------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `page.tsx`      | Redirect a `/`                       | Sí (ruta)                                                             |
| `[id]/page.tsx` | Redirect a `/`                       | Sí (ruta)                                                             |
| `actions.ts`    | getBusinessById, getBusinesses, etc. | **Sí** – context owner, clients/actions, businesses (getBusinessById) |

**Conclusión:** Solo redirects + actions. No hay ya vistas propias de “empresas”; la lógica se usa desde contexto (owner) y clientes.

---

### `app/clients/`

| Archivo                              | Qué es                                                                                                    | ¿Se usa?                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `page.tsx`                           | Redirect a `/`                                                                                            | Sí (ruta)                                                           |
| `[id]/page.tsx`                      | Redirect a `/`                                                                                            | Sí (ruta)                                                           |
| `actions.ts`                         | getClients, getClientById, getBusinessesByClientId, etc.                                                  | **Sí** – context owner, billings, AddProjectModal, EditProjectModal |
| `components/CreateClientModal.tsx`   | **Sí** – ContextOwnerClient                                                                               |
| `components/CreateBusinessModal.tsx` | **Sí** – ContextOwnerClient                                                                               |
| `components/EditClientModal.tsx`     | **Sí** – ContextOwnerClient                                                                               |
| `components/EditBusinessModal.tsx`   | **Sí** – ContextOwnerClient, BusinessDetailClient (eliminado) – pero EditBusinessModal se usa desde owner |
| `components/ClientCard.tsx`          | **Sí** – ContextOwnerClient (o modales de proyecto)                                                       |
| `components/BusinessCard.tsx`        | **Sí** – ContextOwnerClient                                                                               |
| `components/EmptyState.tsx`          | **Sí** – listas vacías en owner/clients                                                                   |

**Conclusión:** Todo se usa desde contexto (owner) y modales de proyecto.

---

### `app/dashboard/`

| Archivo    | Qué es         | ¿Se usa?  |
| ---------- | -------------- | --------- |
| `page.tsx` | Redirect a `/` | Sí (ruta) |

**Conclusión:** Solo redirect. Podría sustituirse por un redirect en middleware y eliminar la carpeta si se quiere menos rutas físicas.

---

### `app/ideas/`

| Archivo                                     | Qué es                                                         | ¿Se usa?                                                    |
| ------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| `page.tsx`                                  | Redirect a `/`                                                 | Sí (ruta)                                                   |
| `actions.ts`                                | createIdeaAction, etc.                                         | **Sí** – ContextBoardViewClient                             |
| `IdeaDrawer.tsx`                            | **Sí** – ContextBoardViewClient                                |
| `IdeaGraphCanvas.tsx`                       | **Sí** – ContextBoardViewClient                                |
| `load-idea-data.ts`                         | getIdeaDataAction                                              | **Sí** – IdeaDrawer                                         |
| `load-board-data.ts`                        | getBoardDataAction                                             | **Sí** – context ideas board page                           |
| `boards/actions.ts`                         | createBoardWithProjectAction, getBoardsByProjectIdAction, etc. | **Sí** – context ideas                                      |
| `boards/[id]/canvas/actions.ts`             | **Sí** – IdeaGraphCanvas / canvas                              |
| `boards/[id]/canvas/batch-actions.ts`       | **Sí** – IdeaGraphCanvas                                       |
| `boards/[id]/canvas/connection-actions.ts`  | **Sí** – IdeaGraphCanvas                                       |
| `boards/[id]/canvas/CanvasView.tsx`         | Vista canvas (lista de items)                                  | **No** – solo la usaba la página antigua que ahora redirige |
| `boards/[id]/canvas/BoardCanvas.client.tsx` | Canvas del board (drag/drop)                                   | **No** – igual que arriba                                   |
| `boards/page.tsx`                           | Redirect a `/`                                                 | Sí (ruta)                                                   |
| `boards/[id]/page.tsx`                      | Redirect a `/`                                                 | Sí (ruta)                                                   |
| `boards/[id]/canvas/page.tsx`               | Redirect a `/`                                                 | Sí (ruta)                                                   |
| `[id]/project-link-actions.ts`              | unlinkIdeaFromProjectAction                                    | **Sí** – UnlinkIdeaButton (y posiblemente otros)            |

**Conclusión:** Casi todo se usa. **Código muerto:** `CanvasView.tsx` y `BoardCanvas.client.tsx` (el contexto usa `IdeaGraphCanvas`, no estos dos).

---

### `app/notes/`

| Archivo                     | Qué es                                                 | ¿Se usa?               |
| --------------------------- | ------------------------------------------------------ | ---------------------- |
| `page.tsx`                  | Redirect a `/`                                         | Sí (ruta)              |
| `new/page.tsx`              | Redirect a `/`                                         | Sí (ruta)              |
| `[id]/page.tsx`             | Redirect a `/`                                         | Sí (ruta)              |
| `actions.ts`                | getNotes, getNoteById, getNoteLinks, deleteNote, etc.  | **Sí** – context notes |
| `components/NoteEditor.tsx` | **Sí** – ContextNoteDetailClient, ContextNewNoteClient |

**Conclusión:** Todo se usa (redirects + lógica compartida con contexto).

---

### `app/project/`

| Archivo         | Qué es                           | ¿Se usa?                                         |
| --------------- | -------------------------------- | ------------------------------------------------ |
| `[id]/page.tsx` | Redirect a `/context/[id]/board` | Sí – URLs tipo `/project/xxx` llevan al contexto |

**Conclusión:** Útil para compatibilidad de URLs. Mantener o sustituir por redirect en middleware si se prefiere.

---

### `app/projects/`

| Archivo      | Qué es                                       | ¿Se usa?                                             |
| ------------ | -------------------------------------------- | ---------------------------------------------------- |
| `page.tsx`   | Redirect a `/`                               | Sí (ruta)                                            |
| `actions.ts` | getProjectsList, getFavoriteProjectIds, etc. | **Sí** – home, ProjectResourcesModal, projects logic |

**Conclusión:** Redirect + actions en uso.

---

### `app/todo/`

| Archivo                        | Qué es                                              | ¿Se usa?                                                  |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| `page.tsx`                     | Redirect a `/`                                      | Sí (ruta)                                                 |
| `new/page.tsx`                 | Redirect a `/`                                      | Sí (ruta)                                                 |
| `list/[listId]/page.tsx`       | Redirect a `/`                                      | Sí (ruta)                                                 |
| `project/[projectId]/page.tsx` | Redirect a `/`                                      | Sí (ruta)                                                 |
| `actions.ts`                   | getProjectTodoBoardAction, getTodoListsAction, etc. | **Sí** – ContextTodosFromCache, ContextTodosClient, hooks |
| `hooks/useProjectTodoBoard.ts` | **Sí** – ContextTodosClient                         |
| `hooks/useTodoListBoard.ts`    | Hook para lista de tareas por listId                | **No** – solo lo usaba ListBoardClient (eliminado)        |

**Conclusión:** **Código muerto:** `useTodoListBoard.ts`.

---

## 3. Resumen: qué hace cada carpeta ahora

- **billings** – Redirect + actions; la UI de facturación por proyecto está en **context/[projectId]/billings/**.
- **budgets** – Redirects + actions + detalle de presupuesto; el listado por proyecto está en **context/.../budgets/**.
- **businesses** – Redirects + actions; no hay vista propia; se usa desde **context/.../owner** y clients.
- **clients** – Redirects + actions + componentes (modales, cards); se usa desde **context/.../owner** y modales de proyecto.
- **dashboard** – Solo redirect a `/`.
- **ideas** – Redirects + actions + IdeaGraphCanvas/IdeaDrawer + loaders; la vista de board por proyecto está en **context/.../ideas/board/[boardId]**.
- **notes** – Redirects + actions + NoteEditor; listado y detalle por proyecto en **context/.../notes/**.
- **project** – Redirect `/project/[id]` → `/context/[id]/board`.
- **projects** – Redirect + actions (lista de proyectos, favoritos, etc.).
- **todo** – Redirects + actions + useProjectTodoBoard; la vista de tareas por proyecto está en **context/.../todos/**.

Nada de esto es “duplicado”: las carpetas antiguas exponen **rutas que redirigen** y **lógica/componentes compartidos**; las vistas que el usuario ve viven en **app/context/**.

---

## 4. Código muerto identificado (no utilizado en ningún flujo actual)

| Ubicación                                             | Motivo                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/ideas/boards/[id]/canvas/CanvasView.tsx`         | Solo lo usaba la página antigua del canvas; esa ruta ahora redirige. El contexto usa `IdeaGraphCanvas`.                                                                                                                                            |
| `app/ideas/boards/[id]/canvas/BoardCanvas.client.tsx` | Igual; ya no hay ninguna importación.                                                                                                                                                                                                              |
| `app/todo/hooks/useTodoListBoard.ts`                  | Solo lo usaba `ListBoardClient` (ruta de lista global eliminada).                                                                                                                                                                                  |
| `components/todo/TodoShell.tsx`                       | No importado en ningún sitio (era la shell del módulo todo antiguo).                                                                                                                                                                               |
| `components/todo/TodoListsPanel.tsx`                  | Solo lo usa TodoShell → muerto.                                                                                                                                                                                                                    |
| `components/todo/TodoListView.tsx`                    | Solo lo usa TodoShell → muerto.                                                                                                                                                                                                                    |
| `components/todo/TodoItemRow.tsx`                     | Solo lo usa TodoListView → muerto.                                                                                                                                                                                                                 |
| `components/LinkedIdeasSection.tsx`                   | No importado en ningún componente o página.                                                                                                                                                                                                        |
| `components/UnlinkIdeaButton.tsx`                     | Solo lo importa LinkedIdeasSection → muerto.                                                                                                                                                                                                       |
| `components/ProjectResourcesModal.tsx`                | Solo se usa desde TopBar cuando `currentProject` está definido; ningún flujo actual (Profile, Settings, contexto) pasa `currentProject`, así que en la práctica no se usa. Opcional: quitarlo de TopBar y borrar el componente si no se va a usar. |

---

## 5. Recomendaciones

1. **Eliminar el código muerto listado arriba** — **Hecho (2026-02-22):** Se eliminaron CanvasView.tsx, BoardCanvas.client.tsx, useTodoListBoard.ts, TodoShell, TodoListsPanel, TodoListView, TodoItemRow, LinkedIdeasSection, UnlinkIdeaButton y ProjectResourcesModal; TopBar ya no usa el modal de recursos ni la prop resourcesInSidebar. (ideas canvas no usado, useTodoListBoard, TodoShell y familia, LinkedIdeasSection, UnlinkIdeaButton y, si se decide, ProjectResourcesModal).
2. **Mantener las carpetas** `billings`, `budgets`, `businesses`, `clients`, `ideas`, `notes`, `projects`, `todo` y `project`: contienen redirects útiles y, sobre todo, la lógica y componentes que usa `app/context/`. Eliminarlas sin mover la lógica rompería el contexto.
3. **Opcional:** Si se quiere una estructura más explícita, se podría:
   - Agrupar **solo acciones** en algo tipo `app/actions/` o `lib/actions/` por dominio (budgets, notes, billings, etc.) y dejar en cada carpeta solo la `page.tsx` redirect.
   - Eso implica un refactor grande; con el estado actual, tener “carpeta por dominio” con redirect + actions + componentes compartidos es coherente y no confuso si se documenta así.

Si quieres, el siguiente paso puede ser aplicar las eliminaciones del punto 1 (y, si lo decides, quitar ProjectResourcesModal de TopBar y eliminar el componente) y dejar el documento como referencia en `docs/audits/`.
