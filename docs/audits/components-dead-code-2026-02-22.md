# Auditoría: componentes en uso vs código muerto (components/)

**Fecha:** 2026-02-22  
**Contexto:** Tras migrar la navegación de sidebar/vistas por módulo a **navegación por context** (todo centrado en el proyecto abierto), se revisa qué componentes de `components/` siguen en uso y cuáles son residuo de las vistas antiguas.

---

## Método

- Listado de todos los archivos en `components/` (por módulo: shared, auth, projects, context, board, skeletons, ui, dashboard).
- Búsqueda de imports de cada componente desde `app/` o desde otros componentes.
- Clasificación: **en uso** (importado desde fuera de su propio archivo) vs **no referenciado** (código muerto).

---

## Resultado: componentes en uso

### shared

| Componente    | Usado por                                                          |
| ------------- | ------------------------------------------------------------------ |
| I18nProvider  | app/layout, y ~30+ archivos en app/ y components/                  |
| ThemeProvider | app/layout                                                         |
| DetailLayout  | app/context/.../budgets/[budgetId]/BudgetDetailClient              |
| GlobalHeader  | Solo por DetailLayout (interno)                                    |
| TopBar        | app/profile/ProfileLayoutClient, app/settings/SettingsLayoutClient |

### auth

| Componente          | Usado por                |
| ------------------- | ------------------------ |
| LoginForm           | app/page                 |
| AuthCallbackHandler | app/page                 |
| SignupForm          | app/signup/page          |
| ForgotPasswordForm  | app/forgot-password/page |

### projects

| Componente       | Usado por                                                  |
| ---------------- | ---------------------------------------------------------- |
| AddProjectModal  | app/context/ContextProjectPicker, components/shared/TopBar |
| EditProjectModal | components/shared/TopBar                                   |

### context

| Componente    | Usado por                           |
| ------------- | ----------------------------------- |
| ContextTabBar | components/context/ContextShell     |
| ContextShell  | app/context/.../ContextLayoutClient |

### board

| Componente          | Usado por                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| KanbanBoard         | app/context/.../board/ContextBoardClient                                                         |
| Column              | components/board/KanbanBoard                                                                     |
| TaskCard            | components/board/KanbanBoard, components/board/Column                                            |
| AddTaskModal        | app/context/.../board/ContextBoardClient                                                         |
| EditTaskModal       | components/board/TaskCard, components/board/Column (tipo), TaskListWidget (este último no usado) |
| MutationErrorDialog | app/context/.../board/ContextBoardClient                                                         |

### skeletons

Todos usados por las vistas context (FromCache):

- SkeletonProjectPicker → app/page
- SkeletonBoard, SkeletonBillings, SkeletonBudgets, SkeletonIdeas, SkeletonLinks, SkeletonNoteDetail, SkeletonNotes, SkeletonOwner, SkeletonTodos → respectivos Context\*FromCache

### ui

Todos los primitivos (button, input, label, dialog, select, tabs, textarea, dropdown-menu, skeleton) están referenciados desde app/ o desde otros componentes.

---

## Resultado: código muerto (no referenciado)

### 1. `components/board/SelectionActionBar.tsx`

- **Qué es:** Barra de acciones para “X tareas seleccionadas” (Cancel, Delete Selected) con diálogo de confirmación.
- **Referencias:** Ninguna. Ningún archivo importa `SelectionActionBar`.
- **Origen probable:** Vista antigua de lista de tareas con selección múltiple (sidebar/dashboard). En la vista actual de board (Kanban) la multi-selección para borrar no se usa o se hace con otros componentes.
- **Recomendación:** Eliminar.

### 2. `components/shared/DetailHeader.tsx`

- **Qué es:** Header de detalle con back, título y acciones (alternativa a GlobalHeader).
- **Referencias:** Ninguna. Ningún archivo importa `DetailHeader`.
- **Origen probable:** Layout de vistas de detalle antiguas. Ahora se usa `DetailLayout` + `GlobalHeader` (p. ej. en BudgetDetailClient).
- **Recomendación:** Eliminar.

### 3. `components/dashboard/TaskListWidget.tsx` (y la carpeta `components/dashboard/`)

- **Qué es:** Widget de lista de tareas por estado (backlog, next, in progress, etc.) con enlaces a tareas y EditTaskModal.
- **Referencias:** Ninguna. Ningún archivo importa `TaskListWidget`.
- **Origen probable:** Dashboard antiguo con widgets (sidebar). La vista actual de tareas es el tab **Board** en context (KanbanBoard), no este widget.
- **Recomendación:** Eliminar `TaskListWidget.tsx` y la carpeta `components/dashboard/` si queda vacía.

---

## Resumen

| Estado             | Cantidad                                                                          |
| ------------------ | --------------------------------------------------------------------------------- |
| Componentes en uso | 38 (shared, auth, projects, context, board, skeletons, ui)                        |
| Código muerto      | 3 archivos (SelectionActionBar, DetailHeader, TaskListWidget) + carpeta dashboard |

Eliminar estos tres archivos (y la carpeta dashboard si aplica) no rompe ninguna referencia; el resto de la app sigue usando solo los componentes listados como “en uso”.
