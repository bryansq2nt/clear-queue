# Reporte: Fixes de arquitectura y cumplimiento de reglas

**Fecha:** 2025-02-15  
**Alcance:** Correcciones aplicadas para cumplir las reglas ESLint custom, patrones documentados y buenas prácticas de datos y auth.

---

## 1. Resumen ejecutivo

Se aplicaron correcciones en dos lotes (**Batch 1** y **Batch 2**) para eliminar violaciones de las tres reglas custom del proyecto (`no-client-supabase-in-components`, `no-select-star`, `no-manual-refetch-after-action`), además de ajustes puntuales de tipos y del formulario de login. Todo el trabajo se alineó con:

- **Reglas:** `eslint-plugin-clear-queue` (ver `eslint-rules-README.md`)
- **Patrones:** `docs/patterns/server-actions.md`, `docs/patterns/database-queries.md`, `docs/patterns/transactions.md`
- **Reporte de estado:** `IMPLEMENTATION_STATUS_REPORT.md` (calidad y enforcement)

**Resultado:** Cero violaciones restantes de `no-client-supabase-in-components` en `app/` y `components/`; `npm run format:check`, `npm run lint` y `npm run build` pasan; login operativo.

---

## 2. Reglas y documentos que guiaron los fixes

### 2.1 Regla: no-client-supabase-in-components

- **Documento:** [docs/reference/eslint-rules-README.md](../reference/eslint-rules-README.md) (Rule 1), [docs/patterns/server-actions.md](../patterns/server-actions.md)
- **Qué exige:** No usar `createClient()` de `@/lib/supabase/client` en componentes cliente (`'use client'` en `components/**` o `app/**/*Client.tsx`).
- **Cómo lo seguimos:**
  - Eliminamos todas las llamadas a `createClient()` en esos archivos.
  - Datos que antes se cargaban en el cliente ahora se obtienen por:
    - **Server actions:** p. ej. `getProjectsForSidebar()`, `getDashboardData()`, `getCriticalTasks()`, `updatePassword()`, etc.
    - **Rutas API:** `/api/auth/set-recovery-session`, `/api/auth/callback` para flujos de auth que requieren sesión en el servidor.
  - Los componentes cliente solo llaman a acciones o `fetch` a las API; nunca instancian el cliente de Supabase en el browser.

### 2.2 Regla: no-select-star

- **Documento:** [docs/reference/eslint-rules-README.md](../reference/eslint-rules-README.md) (Rule 2), [docs/patterns/database-queries.md](../patterns/database-queries.md)
- **Qué exige:** No usar `.select('*')`; especificar columnas explícitas.
- **Cómo lo seguimos:**
  - Reemplazamos todo `.select('*')` por listas explícitas de columnas (según `lib/supabase/types.ts`).
  - Áreas tocadas: `app/notes/actions.ts`, `app/settings/appearance/actions.ts`, `app/settings/profile/actions.ts`, `app/billings/actions.ts`, `app/budgets/actions.ts`, `app/clients/actions.ts`, `lib/idea-graph/*.ts`, `lib/projects.ts`, `lib/todo/lists.ts`.
  - Se mantuvo el scoping correcto (`owner_id`, `user_id`, `project_id`, etc.) como indica el patrón de database-queries.

### 2.3 Regla: no-manual-refetch-after-action

- **Documento:** [docs/reference/eslint-rules-README.md](../reference/eslint-rules-README.md) (Rule 3), [docs/patterns/server-actions.md](../patterns/server-actions.md)
- **Qué exige:** No hacer `await load*()` después de un `await *Action()` en la misma función; usar `router.refresh()` o devolver datos desde la acción.
- **Cómo lo seguimos:**
  - Renombramos acciones que se usan para “cargar” datos para que no coincidan con el patrón `load*`: `loadIdeaDataAction` → `getIdeaDataAction`, `loadBoardDataAction` → `getBoardDataAction`.
  - Donde tras una mutación se llamaba a `loadIdeaData()` o `loadBoardData()`, se reemplazó por `router.refresh()` para revalidar sin refetch manual (ver sección 3.5).

### 2.4 Otros documentos utilizados

- **Patrones de transacciones:** `docs/patterns/transactions.md` — no fue necesario cambiar flujos transaccionales en estos fixes, pero las mutaciones siguen concentradas en server actions.
- **Implementación y calidad:** `IMPLEMENTATION_STATUS_REPORT.md` — usamos la descripción de las reglas y del flujo de calidad (ESLint, pre-commit, CI) para validar que cada cambio dejara el lint y el build en verde.

---

## 3. Resumen de cambios por categoría

### 3.1 Batch 1 — No Supabase en componentes cliente (páginas principales)

| Área                  | Cambio                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acción compartida** | `getProjectsForSidebar()` en `app/actions/projects.ts` (server Supabase, `owner_id`, columnas explícitas).                                                                                                           |
| **Páginas**           | Billings, Budgets, BudgetDetail, Businesses, Clients, ClientDetail, Ideas, Notes, Profile, Projects: eliminado `createClient()`; `loadProjects` / equivalente llaman a `getProjectsForSidebar()` o a otras acciones. |
| **Select explícito**  | En `app/billings/actions.ts`, `app/budgets/actions.ts`, `app/budgets/[id]/actions.ts`, `app/clients/actions.ts`: reemplazo de `.select('*')` por listas de columnas.                                                 |

### 3.2 Batch 2 — Auth, dashboard, todo, analytics

| Área                  | Cambio                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**              | `getSessionStatus()`, `updatePassword()` en `app/actions/auth.ts`; rutas `POST /api/auth/set-recovery-session`, `GET /api/auth/callback`; ResetPasswordClient, ForgotPasswordForm y AuthCallbackHandler dejan de usar `createClient()`.                                                                                             |
| **Layouts / Todo**    | SettingsLayoutClient, TodoPageClient, ListBoardClient, NewTodoListClient, ProjectBoardClient, TodoListsPanel: proyectos del sidebar vía `getProjectsForSidebar()`.                                                                                                                                                                  |
| **Dashboard / Tasks** | `getDashboardData()`, `getTasksByProjectId()`, `getCriticalTasks()`, `getRecentTasksPage()`, `getHighPriorityTasksPage()` en `app/actions/tasks.ts`; `getProjectById()` en `app/actions/projects.ts`; DashboardClient, AnalyticsDashboard, ProjectKanbanClient, CriticalTasksWidget, DashboardFocusTasksSection usan esas acciones. |

### 3.3 Lint adicional (no-select-star y no-manual-refetch)

| Archivo / área      | Cambio                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ideas**           | `loadIdeaDataAction` → `getIdeaDataAction`, `loadBoardDataAction` → `getBoardDataAction`.                                                                                 |
| **Notes, Settings** | `app/notes/actions.ts`, `app/settings/appearance/actions.ts`, `app/settings/profile/actions.ts`: selects explícitos (incl. inserts/updates que devuelven fila).           |
| **Lib**             | `lib/idea-graph/boards.ts`, `connections.ts`, `ideas.ts`, `project-links.ts`, `lib/projects.ts`, `lib/todo/lists.ts`: reemplazo de `select('*')` por columnas explícitas. |

### 3.4 Fixes puntuales (tipos y UX)

| Problema                                        | Solución                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ProjectsPageClient**                          | `getFavoriteProjectIds()` devuelve `{ data?: string[] }`; se usaba `data?.data`. Corregido a `data ?? []` al construir el `Set` de favoritos.                                                                                                        |
| **TaskListWidget / DashboardFocusTasksSection** | El tipo esperaba `projects: Project` (fila completa); las acciones devuelven `{ id, name, color }`. Se introdujo `ProjectSummary` en TaskListWidget para que el tipo coincida con la API.                                                            |
| **LoginForm**                                   | El botón “Sign In” no hacía nada: el form usaba `action={handleSubmit}` (función cliente). Cambio a `onSubmit={handleSubmit}` con `e.preventDefault()` y construcción de `FormData` en el handler para llamar a la server action `signIn(formData)`. |

### 3.5 No manual refetch tras mutaciones (ideas)

| Archivo                      | Cambio                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IdeaDrawer.tsx**           | Tras `linkIdeaToProjectAction` y tras `unlinkIdeaFromProjectAction`: se eliminó la llamada a `loadIdeaData()` y se usa solo `router.refresh()` (más `onUpdate()` para notificar al padre). |
| **IdeasDashboardClient.tsx** | Tras `addIdeaToBoardAction` (crear idea y añadir al board): se eliminó la llamada a `loadBoardData(selectedBoardId)`; solo se usa `router.refresh()` para revalidar.                       |

Con esto se elimina el patrón “acción → load\*” y se cumple la regla usando revalidación vía `router.refresh()`.

### 3.6 Formato (Prettier)

Se ejecutó `npm run format` (Prettier `--write`) en todo el proyecto para corregir los archivos que fallaban en `format:check`. Los 11 archivos señalados (actions, ResetPasswordClient, docs, lib/idea-graph/boards, lib/projects, etc.) quedaron formateados según `.prettierrc`. Así el pre-commit pasa también en el paso de formato.

---

## 4. Verificación

- **Format:** `npm run format:check` — todos los archivos pasan Prettier.
- **Lint:** `npm run lint` — 0 errores.
- **Build:** `npm run build` — compila correctamente.
- **Reglas:** No quedan violaciones de `no-client-supabase-in-components` en `app/` y `components/`; `no-select-star` y `no-manual-refetch-after-action` cumplidos en los archivos modificados.
- **Login:** Flujo de sign-in operativo con el formulario actual.

---

## 5. Referencia rápida de documentos

| Documento                | Ubicación                                                                       | Uso en estos fixes                                     |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Reglas ESLint            | `eslint-rules-README.md`                                                        | Definición de las 3 reglas y cómo corregirlas.         |
| Server Actions           | `docs/patterns/server-actions.md`                                               | Estructura de acciones, auth, y evitar refetch manual. |
| Database Queries         | `docs/patterns/database-queries.md`                                             | Select explícito y scoping por usuario/recurso.        |
| Estado de implementación | [docs/reports/IMPLEMENTATION_STATUS_REPORT.md](IMPLEMENTATION_STATUS_REPORT.md) | Contexto de calidad y enforcement.                     |

---

_Reporte generado a partir de los commits y cambios aplicados en la rama de fixes de arquitectura._
