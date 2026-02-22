# Auditoría: Navegación por Módulos vs Navegación por Contexto de Proyecto

**Fecha:** 2026-02-22  
**Objetivo:** Determinar qué archivos siguen en uso, cuáles fueron reutilizados por la vista por contexto y cuáles son innecesarios (solo navegación antigua) para planificar la remoción segura.

---

## 1. Resumen del cambio de modelo

### Antes (navegación por módulos)

- El usuario navegaba por **módulos globales** desde un **sidebar**:
  - `/dashboard` — panel general
  - `/projects` — lista de proyectos
  - `/ideas` — ideas y boards
  - `/todo` — listas de tareas
  - `/budgets` — presupuestos
  - `/clients` — clientes
  - `/businesses` — negocios
  - `/billings` — facturación
  - `/notes` — notas
- Cada módulo mostraba datos de **todos** los proyectos/entidades; la información no estaba acotada al proyecto en el que se quería trabajar.

### Ahora (navegación por contexto de proyecto)

- **Entrada:** la raíz `/` muestra el **selector de proyecto** (`ContextProjectPicker`). No hay sidebar en esta vista.
- **Dentro de un proyecto:** la URL es `/context/[projectId]/...` y la navegación es por **tabs** en la barra del proyecto (header + tab bar):
  - **Etapas** → `/context/[projectId]/board`
  - **Responsable del proyecto** → `/context/[projectId]/owner`
  - **Notas** → `/context/[projectId]/notes`
  - **Enlaces** → `/context/[projectId]/links`
  - **Ideas** → `/context/[projectId]/ideas`
  - **Presupuestos** → `/context/[projectId]/budgets`
  - **Tareas** → `/context/[projectId]/todos`
  - **Salir** → vuelve a `/`
- No se muestra información ajena al proyecto; no hay sidebar de módulos en la vista de contexto.

### Rutas que solo redirigen al nuevo modelo

- `/project/[id]` → redirige a `/context/[id]/board` (ya es un alias, no una vista propia).

---

## 2. Estado actual: qué usa la vista por contexto

La vista por contexto **reutiliza** lógica y componentes de los módulos antiguos; no duplica todo. Por tanto:

- **Páginas antiguas** (`app/dashboard/page.tsx`, `app/notes/page.tsx`, etc.): son las que sirven las URLs del sidebar. Si eliminamos el sidebar como forma principal de navegación, esas **páginas** dejan de ser el punto de entrada, pero **no** podemos borrar toda la carpeta: muchas **actions** y **componentes** siguen siendo usados por los clientes de contexto.

A continuación se clasifican por módulo.

---

## 3. Clasificación por módulo

### 3.1 Dashboard (`/dashboard`, `/dashboard/analytics`)

| Elemento                                              | ¿Usado por contexto?                      | Clasificación                                                                             |
| ----------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `app/dashboard/page.tsx`                              | No                                        | **Solo navegación antigua** — candidato a remover cuando se elimine el flujo por sidebar. |
| `app/dashboard/analytics/page.tsx`                    | No                                        | **Solo navegación antigua** — candidato a remover.                                        |
| `components/AnalyticsDashboard.tsx`                   | No (solo usado por las páginas dashboard) | **Solo navegación antigua** — candidato a remover.                                        |
| `components/DashboardClient.tsx`                      | No                                        | **Solo navegación antigua** — candidato a remover.                                        |
| `components/dashboard/DashboardFocusTasksSection.tsx` | No                                        | **Solo navegación antigua** — candidato a remover.                                        |
| `components/dashboard/CriticalTasksWidget.tsx`        | No                                        | **Solo navegación antigua** — candidato a remover.                                        |
| `components/RightPanel.tsx`                           | Solo usado por `DashboardClient`          | **Solo navegación antigua** — candidato a remover.                                        |

**Resumen:** Todo el bloque Dashboard (páginas + AnalyticsDashboard + DashboardClient + RightPanel + widgets) solo sirve a `/dashboard`. La vista por contexto no usa dashboard; el “home” del usuario es el selector de proyectos y luego el board/etapas del proyecto.

---

### 3.2 Projects (`/projects`)

| Elemento                              | ¿Usado por contexto?                                                                   | Clasificación                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/projects/page.tsx`               | No (pero es lista de proyectos; podría ser la misma que el picker o una vista “todas”) | **Entrada alternativa** — decidir si se mantiene como ruta pública o se unifica con `/`.                                                                         |
| `app/projects/ProjectsPageClient.tsx` | No                                                                                     | Usa Sidebar + TopBar; navega a `context/[id]/board`. Si la única entrada deseada es `/`, este cliente y la página pueden ser candidatos a remover o simplificar. |
| `app/projects/actions.ts`             | Sí (getProjectsList, etc., usados desde raíz y otros)                                  | **Mantener** — lógica compartida.                                                                                                                                |

**Nota:** El **Sidebar** incluye enlace “Mis proyectos” → `/projects`. Si se elimina el sidebar como navegación principal, la necesidad de `/projects` como ruta separada hay que decidirla (¿solo se entra por `/`?).

---

### 3.3 Ideas (`/ideas`, `/ideas/boards`, `/ideas/boards/[id]`, `/ideas/[id]`)

| Elemento                                                                               | ¿Usado por contexto?                                                                      | Clasificación                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `app/ideas/page.tsx`                                                                   | No                                                                                        | **Solo navegación antigua** — candidato a remover.           |
| `app/ideas/IdeasPageClient.tsx`                                                        | No                                                                                        | **Solo navegación antigua** — usa AppShell + Sidebar.        |
| `app/ideas/IdeasDashboardClient.tsx`                                                   | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/BoardsSidebar.tsx`                                                          | No (solo IdeasDashboardClient)                                                            | **Solo navegación antigua**.                                 |
| `app/ideas/boards/page.tsx`                                                            | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/boards/[id]/page.tsx`                                                       | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/boards/[id]/BoardDetailClient.tsx`                                          | No                                                                                        | **Solo navegación antigua** (links internos a `/ideas/...`). |
| `app/ideas/boards/[id]/canvas/page.tsx`                                                | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/boards/[id]/canvas/CanvasView.tsx`                                          | **Sí** — referenciado por contexto vía `ContextBoardViewClient` que usa `IdeaGraphCanvas` | **Reutilizado** — no remover.                                |
| `app/ideas/boards/[id]/canvas/BoardCanvas.client.tsx`                                  | **Sí** (parte del flujo canvas)                                                           | **Reutilizado**.                                             |
| `app/ideas/boards/[id]/canvas/actions.ts`, `batch-actions.ts`, `connection-actions.ts` | Usados por canvas (y por tanto por contexto)                                              | **Mantener**.                                                |
| `app/ideas/[id]/page.tsx`                                                              | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/[id]/IdeaDetailClient.tsx`                                                  | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/IdeasListClient.tsx`                                                        | No                                                                                        | **Solo navegación antigua**.                                 |
| `app/ideas/actions.ts`                                                                 | **Sí** (createIdeaAction, etc., usados en contexto)                                       | **Mantener**.                                                |
| `app/ideas/boards/actions.ts`                                                          | **Sí** (createBoardWithProjectAction, getBoardsByProjectIdAction, etc.)                   | **Mantener**.                                                |
| `app/ideas/load-idea-data.ts`, `load-board-data.ts`                                    | Usados por contexto (load-board-data en context ideas board)                              | **Mantener**.                                                |
| `app/ideas/IdeaGraphCanvas.tsx`, `app/ideas/IdeaDrawer.tsx`                            | **Sí** (ContextBoardViewClient)                                                           | **Mantener**.                                                |
| `app/ideas/[id]/project-link-actions.ts`                                               | **Sí** (UnlinkIdeaButton, revalidatePath contexto)                                        | **Mantener**.                                                |

**Resumen:** Las **páginas** y clientes de lista/detalle de ideas y boards que solo sirven `/ideas/*` son candidatos a remover. La **lógica** (actions, loaders, canvas, IdeaGraphCanvas, IdeaDrawer) se mantiene porque la usa `/context/[projectId]/ideas`.

---

### 3.4 Budgets (`/budgets`, `/budgets/[id]`)

| Elemento                                       | ¿Usado por contexto?                                                          | Clasificación                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `app/budgets/page.tsx`                         | No                                                                            | **Solo navegación antigua**.                      |
| `app/budgets/BudgetsPageClient.tsx`            | No                                                                            | **Solo navegación antigua** (AppShell + Sidebar). |
| `app/budgets/actions.ts`                       | **Sí** (getBudgetsByProjectId, getBudgetProjectId, getProjects, etc.)         | **Mantener**.                                     |
| `app/budgets/components/BudgetCard.tsx`        | **Sí** (ContextBudgetsClient)                                                 | **Mantener**.                                     |
| `app/budgets/components/CreateBudgetModal.tsx` | **Sí** (ContextBudgetsClient)                                                 | **Mantener**.                                     |
| `app/budgets/components/EmptyState.tsx`        | **Sí** (ContextBudgetsClient)                                                 | **Mantener**.                                     |
| `app/budgets/[id]/page.tsx`                    | No (contexto usa su propia ruta)                                              | **Solo navegación antigua** para la URL global.   |
| `app/budgets/[id]/BudgetDetailClient.tsx`      | **Sí** — reutilizado en `app/context/[projectId]/budgets/[budgetId]/page.tsx` | **Mantener** (componente compartido).             |
| `app/budgets/[id]/actions.ts`                  | **Sí** (detalle de presupuesto)                                               | **Mantener**.                                     |
| `app/budgets/[id]/components/*`                | Usados por BudgetDetailClient                                                 | **Mantener**.                                     |

**Resumen:** Quitar solo las **páginas** y el **BudgetsPageClient** que sirven `/budgets` y `/budgets/[id]` como rutas globales. Actions y componentes (incluido BudgetDetailClient) se mantienen porque los usa la vista por contexto.

---

### 3.5 Notes (`/notes`, `/notes/new`, `/notes/[id]`)

| Elemento                                                    | ¿Usado por contexto?                                                             | Clasificación                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `app/notes/page.tsx`                                        | No                                                                               | **Solo navegación antigua**.                    |
| `app/notes/NotesPageClient.tsx`                             | No                                                                               | **Solo navegación antigua** (Sidebar + TopBar). |
| `app/notes/new/page.tsx`, `app/notes/new/NewNoteClient.tsx` | No                                                                               | **Solo navegación antigua**.                    |
| `app/notes/[id]/page.tsx`                                   | No                                                                               | **Solo navegación antigua**.                    |
| `app/notes/[id]/NoteDetailClient.tsx`                       | No                                                                               | **Solo navegación antigua**.                    |
| `app/notes/actions.ts`                                      | **Sí** (getNotes, getNoteById, getNoteLinks, deleteNote, etc. en ContextNotes\*) | **Mantener**.                                   |
| `app/notes/components/NoteEditor.tsx`                       | **Sí** (ContextNoteDetailClient, ContextNewNoteClient)                           | **Mantener**.                                   |

**Resumen:** Eliminar páginas y clientes de lista/detalle/crear que solo sirven `/notes/*`. Mantener actions y NoteEditor.

---

### 3.6 Clients (`/clients`, `/clients/[id]`)

| Elemento                                                                                                                                      | ¿Usado por contexto?                                                                                                              | Clasificación                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `app/clients/page.tsx`                                                                                                                        | No                                                                                                                                | **Solo navegación antigua**.            |
| `app/clients/ClientsPageClient.tsx`                                                                                                           | No                                                                                                                                | **Solo navegación antigua**.            |
| `app/clients/[id]/page.tsx`                                                                                                                   | No                                                                                                                                | **Solo navegación antigua**.            |
| `app/clients/[id]/ClientDetailClient.tsx`                                                                                                     | No (pero tiene link a `context/[id]/board`)                                                                                       | **Solo navegación antigua** como vista. |
| `app/clients/actions.ts`                                                                                                                      | **Sí** (getClients, getClientById, getBusinessesByClientId, getBusinessById, etc. en owner, projects, billings, EditProjectModal) | **Mantener**.                           |
| `app/clients/components/*` (CreateClientModal, EditClientModal, CreateBusinessModal, EditBusinessModal, ClientCard, BusinessCard, EmptyState) | **Sí** (ContextOwnerClient, ProjectsPageClient, EditProjectModal, AddProjectModal)                                                | **Mantener**.                           |

**Resumen:** Quitar solo las **páginas** y los **clientes de página** que sirven `/clients` y `/clients/[id]`. Toda la lógica y componentes de clientes/negocios se mantienen porque los usa el módulo Owner del contexto y otros flujos.

---

### 3.7 Businesses (`/businesses`, `/businesses/[id]`)

| Elemento                                       | ¿Usado por contexto?                                                              | Clasificación                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `app/businesses/page.tsx`                      | No                                                                                | **Solo navegación antigua**.                                |
| `app/businesses/BusinessesPageClient.tsx`      | No                                                                                | **Solo navegación antigua**.                                |
| `app/businesses/[id]/page.tsx`                 | No                                                                                | **Solo navegación antigua**.                                |
| `app/businesses/[id]/BusinessDetailClient.tsx` | No                                                                                | **Solo navegación antigua** (tiene backHref="/businesses"). |
| `app/businesses/actions.ts`                    | **Sí** (getBusinessById, getBusinesses, etc., usados en clients y contexto owner) | **Mantener**.                                               |

**Resumen:** Igual que clients: quitar páginas y clientes de listado/detalle; mantener actions (y los componentes de clients que usan businesses).

---

### 3.8 Billings (`/billings`)

| Elemento                              | ¿Usado por contexto?        | Clasificación                                             |
| ------------------------------------- | --------------------------- | --------------------------------------------------------- |
| `app/billings/page.tsx`               | No                          | **Solo entrada actual** — hoy solo se accede por sidebar. |
| `app/billings/BillingsPageClient.tsx` | No                          | Usa Sidebar + TopBar; es la única vista de billings.      |
| `app/billings/actions.ts`             | Solo por BillingsPageClient | **Mantener** — necesario para el módulo.                  |

**Importante:** El módulo **billings** **no está** en la navegación por contexto (no hay tab “Billings” en `ContextTabBar`). Es un olvido de implementación: hay que **añadir** el tab y la ruta `/context/[projectId]/billings` y reutilizar/adaptar la lógica y UI de `app/billings` dentro del contexto. No eliminar el módulo billings; marcar como **pendiente de integración en contexto**.

**Seguridad:** En `middleware.ts`, la ruta `/billings` **no** está en `protectedPrefixes`; las demás rutas de módulos sí. Conviene añadir `/billings` (y si se mantiene `/context`, asegurar que `/context` esté protegida).

---

### 3.9 Todo (`/todo`, `/todo/project/[projectId]`, `/todo/list/[listId]`, `/todo/new`)

| Elemento                                                      | ¿Usado por contexto?                                                 | Clasificación                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `app/todo/page.tsx`                                           | No                                                                   | **Solo navegación antigua** (lista de listas / dashboard todo).             |
| `app/todo/TodoPageClient.tsx`                                 | No                                                                   | **Solo navegación antigua** (AppShell + Sidebar).                           |
| `app/todo/TodoDashboardClient.tsx`                            | No                                                                   | **Solo navegación antigua**.                                                |
| `app/todo/project/[projectId]/page.tsx`                       | No                                                                   | **Solo navegación antigua** (board por proyecto vía URL global).            |
| `app/todo/project/[projectId]/ProjectBoardClient.tsx`         | No                                                                   | **Solo navegación antigua** (Sidebar + TopBar).                             |
| `app/todo/list/[listId]/page.tsx`                             | No                                                                   | **Solo navegación antigua**.                                                |
| `app/todo/list/[listId]/ListBoardClient.tsx`                  | No                                                                   | **Solo navegación antigua**.                                                |
| `app/todo/new/page.tsx`, `app/todo/new/NewTodoListClient.tsx` | No                                                                   | **Solo navegación antigua**.                                                |
| `app/todo/actions.ts`                                         | **Sí** (getProjects usado en varios sitios; lógica de listas/tareas) | **Mantener**.                                                               |
| `app/todo/hooks/useProjectTodoBoard.ts`                       | **Sí** (ContextTodosClient reutiliza el mismo hook)                  | **Mantener**.                                                               |
| `app/todo/hooks/useTodoListBoard.ts`                          | Usado en ListBoardClient (ruta antigua)                              | Si se elimina la ruta de listas sueltas, revisar si sigue siendo necesario. |

**Resumen:** Las **páginas** y **clientes** de `/todo/*` que muestran Sidebar y rutas globales son candidatos a remover. La vista por contexto usa `context/[projectId]/todos` con su propio cliente y el hook `useProjectTodoBoard`; mantener actions y ese hook.

---

### 3.10 Componentes globales de layout (Sidebar, TopBar, AppShell, DetailLayout)

| Elemento                                                            | Usado por                                                                                          | Clasificación                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/Sidebar.tsx`                                            | Dashboard, Projects, Ideas, Todo, Budgets, Clients, Businesses, Billings, Notes, Settings, Profile | **Navegación antigua**. Si se eliminan las rutas de módulos, el Sidebar solo tendría sentido en Settings/Profile (o se sustituye por otro patrón). Candidato a **remover o refactorizar** cuando no queden rutas que lo usen. |
| `components/TopBar.tsx`                                             | Todas las páginas cliente que usan Sidebar + TopBar; también Settings, Profile                     | **Mantener** mientras existan Settings/Profile o cualquier vista que use TopBar sin contexto. Si solo queda contexto, TopBar podría no usarse en contexto (ContextShell tiene su propio header).                              |
| `components/AppShell.tsx`                                           | Ideas (IdeasPageClient), Todo (TodoPageClient), Budgets (BudgetsPageClient)                        | **Solo navegación antigua** — candidato a remover cuando se eliminen esas páginas.                                                                                                                                            |
| `components/DetailLayout.tsx`                                       | ClientDetailClient, BusinessDetailClient, BudgetDetailClient, NoteDetailClient, BoardDetailClient  | **Mantener** — BudgetDetailClient y otros detalles se reutilizan desde contexto; DetailLayout es el layout de esas vistas.                                                                                                    |
| `components/GlobalHeader.tsx`                                       | Usado por TopBar / DetailLayout                                                                    | **Mantener** si se mantiene DetailLayout/TopBar.                                                                                                                                                                              |
| `components/ProjectResourcesModal.tsx`                              | TopBar (enlaces a /budgets, /notes, /ideas/boards)                                                 | Si se elimina TopBar de las vistas antiguas y en contexto no se usa, **candidato a remover o actualizar** para que genere links a contexto.                                                                                   |
| `components/AddProjectModal.tsx`, `components/EditProjectModal.tsx` | Sidebar, TopBar                                                                                    | **Mantener** — se usan desde Sidebar y TopBar; si se conserva “añadir/editar proyecto” en otra parte (ej. en contexto o en `/`), seguirán siendo necesarios.                                                                  |

---

### 3.11 Otros componentes

| Elemento                                                                                 | Notas                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `components/LinkedIdeasSection.tsx`                                                      | No aparece importado en ninguna ruta del app; solo referenciado en docs. **Posible código muerto** — verificar antes de borrar. |
| `components/UnlinkIdeaButton.tsx`                                                        | Usado por LinkedIdeasSection. Si LinkedIdeasSection no se usa, este también sería candidato a revisar.                          |
| `app/actions/projects.ts` (getProjectsForSidebar, getProjectsList, getProjectById, etc.) | **Mantener** — usado en contexto, picker, Sidebar, y muchas páginas.                                                            |
| `app/actions/tasks.ts`                                                                   | **Mantener** — usado por board y todos en contexto.                                                                             |

---

## 4. Rutas y middleware

- **Protegidas hoy:** `/dashboard`, `/project`, `/ideas`, `/todo`, `/budgets`, `/clients`, `/businesses`, `/notes`.
- **No protegidas:** `/billings`, `/context`, `/projects`.
- **Recomendación:** Añadir `/billings` y `/context` a `protectedPrefixes` para que requieran auth.

---

## 5. Resumen ejecutivo para el plan de remoción

### Mantener (compartidos o esenciales)

- **Actions y lógica:**  
  `app/actions/projects.ts`, `app/actions/tasks.ts`, `app/notes/actions.ts`, `app/budgets/actions.ts`, `app/budgets/[id]/actions.ts`, `app/clients/actions.ts`, `app/businesses/actions.ts`, `app/ideas/actions.ts`, `app/ideas/boards/actions.ts`, `app/ideas/boards/[id]/canvas/*.ts`, `app/ideas/[id]/project-link-actions.ts`, `app/billings/actions.ts`, `app/todo/actions.ts`, `app/projects/actions.ts`.
- **Componentes reutilizados por contexto:**  
  Presupuestos: `BudgetCard`, `CreateBudgetModal`, `EmptyState`, `BudgetDetailClient` y sus subcomponentes. Notas: `NoteEditor`. Ideas: `IdeaGraphCanvas`, `IdeaDrawer`, canvas views y loaders. Clientes/negocios: modales y cards en `app/clients/components/*`. Todo: hooks `useProjectTodoBoard` (y posiblemente `useTodoListBoard` según decisión de rutas).
- **Layout de detalle:**  
  `DetailLayout`, `GlobalHeader` (y TopBar si se mantiene para Settings/Profile).
- **Contexto:**  
  Todo lo bajo `app/context/` y `components/context/` (ContextShell, ContextTabBar, etc.).

### Reutilizados (ya usados por contexto)

- Ideas: canvas, IdeaGraphCanvas, IdeaDrawer, load-board-data, load-idea-data, project-link-actions.
- Budgets: actions, BudgetCard, CreateBudgetModal, EmptyState, BudgetDetailClient.
- Notes: actions, NoteEditor.
- Clients: actions, todos los componentes de clientes/negocios (Owner del proyecto).
- Todo: useProjectTodoBoard (y actions).

### Candidatos a remover (solo navegación antigua)

- **Páginas y clientes de página** que **solo** sirven las URLs del sidebar y no son importados por contexto:
  - Dashboard: `app/dashboard/*`, `AnalyticsDashboard`, `DashboardClient`, `RightPanel`, `dashboard/DashboardFocusTasksSection`, `CriticalTasksWidget`.
  - Ideas: `app/ideas/page.tsx`, `IdeasPageClient`, `IdeasDashboardClient`, `BoardsSidebar`, `app/ideas/boards/page.tsx`, `app/ideas/boards/[id]/page.tsx`, `BoardDetailClient`, `app/ideas/boards/[id]/canvas/page.tsx`, `app/ideas/[id]/page.tsx`, `IdeaDetailClient`, `IdeasListClient`.
  - Budgets: `app/budgets/page.tsx`, `BudgetsPageClient` (no las rutas de detalle si se reutilizan desde contexto).
  - Notes: `app/notes/page.tsx`, `NotesPageClient`, `app/notes/new/*`, `app/notes/[id]/page.tsx`, `NoteDetailClient`.
  - Clients: `app/clients/page.tsx`, `ClientsPageClient`, `app/clients/[id]/page.tsx`, `ClientDetailClient`.
  - Businesses: `app/businesses/page.tsx`, `BusinessesPageClient`, `app/businesses/[id]/page.tsx`, `BusinessDetailClient`.
  - Todo: `app/todo/page.tsx`, `TodoPageClient`, `TodoDashboardClient`, `app/todo/project/[projectId]/page.tsx`, `ProjectBoardClient`, `app/todo/list/*`, `app/todo/new/*`.
  - Projects: opcional — `app/projects/page.tsx`, `ProjectsPageClient` si se unifica entrada solo en `/`.
- **Layout de módulos antiguos:**  
  `AppShell` (cuando no quede ninguna página que lo use).  
  **Sidebar:** cuando no quede ninguna ruta que lo use (quitar o refactorizar).
- **Billings:** No remover; **añadir** al contexto (tab + ruta `/context/[projectId]/billings`).

### Pendiente de implementación

- **Billings en contexto:** Añadir tab “Billings” en `ContextTabBar`, ruta `app/context/[projectId]/billings/` y reutilizar/adaptar `app/billings/actions.ts` y la UI de `BillingsPageClient` (sin Sidebar, con header de contexto).

---

## 6. Próximos pasos sugeridos

1. **Proteger rutas:** Añadir `/billings` y `/context` a `protectedPrefixes` en `middleware.ts`.
2. **Decidir** si se mantiene `/projects` como ruta o solo se usa `/` como entrada.
3. **Plan de ejecución de remoción:** Por fases (por ejemplo: primero Dashboard y RightPanel; luego Ideas páginas; luego Notes; luego Clients/Businesses; luego Todo; luego Sidebar/AppShell cuando no queden consumidores).
4. **Implementar billings en contexto** antes de eliminar la ruta `/billings` del sidebar, para no perder la funcionalidad.

Cuando quieras, podemos bajar esto a un **plan de ejecución paso a paso** (orden de borrado, cambios de imports y redirecciones).
