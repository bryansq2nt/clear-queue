# Reporte de avance — Re-auditoría post-remediación

**Fecha:** 2025-02-15  
**Autor:** Re-ejecución del prompt de re-auditoría (ANALISIS-AUDITORIAS-Y-PROMPT-REAUDIT.md).  
**Objetivo:** Comparar el estado del codebase con los hallazgos originales de Codex en `docs/audits/` y clasificar cada ítem como RESUELTO / PARCIAL / SIN CAMBIOS.

---

## 1. Resumen ejecutivo

| Categoría        | Resueltos | Parciales | Sin cambios | Total relevante |
| ---------------- | --------- | --------- | ----------- | --------------- |
| Data flow / Read | 2         | 2         | 0           | 4               |
| Refresh (doble)  | 0         | 1         | 1           | 2               |
| SELECT \*        | 1         | 0         | 0           | 1               |
| Security (RLS)   | 0         | 0         | 4           | 4               |
| Performance      | 0         | 0         | 3           | 3               |
| Vibe / Auth      | 0         | 0         | 3           | 3               |

- **Lecturas de datos:** La mayoría de rutas (Dashboard, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo, Settings, Profile, Project/[id]) cargan datos en el servidor y pasan props al cliente. Siguen existiendo un refetch en cliente en AnalyticsDashboard y un import residual de Supabase client en TaskListWidget.
- **Doble refresh:** Sigue presente en varias acciones (revalidatePath + callback loadData/onProjectUpdated); ProjectKanbanClient ya no hace fetch inicial en mount pero sí refetch manual tras mutaciones.
- **SELECT \*:** No se encontraron usos de `.select('*')` en `app/` ni `lib/` (RESUELTO).
- **Seguridad RLS (SEC-001, SEC-002, SEC-003) y auth (SEC-004):** Sin cambios en migraciones ni en mensajes de error.
- **Rendimiento (PERF-001, PERF-002, N+1 en todo/budgets):** Sin cambios: updateTaskOrder por fila, getProjectsWithTodoSummaryAction con bucle por proyecto, updateBusinessFieldsAction sin transacción.

---

## 2. Por documento de origen

### 2.1 codebase-findings-2026-02-13.md

| ID        | Título corto                                         | Estado                                                               | Evidencia                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001   | RLS UPDATE sin WITH CHECK en budget_categories/items | **SIN CAMBIOS**                                                      | `supabase/migrations/20260208120000_multi_user_projects_tasks_budgets.sql` líneas 150-157 (budget_categories) y 189-197 (budget_items): política `FOR UPDATE` solo con `USING (...)`, sin `WITH CHECK (...)`.                             |
| SEC-002   | RLS UPDATE sin WITH CHECK en business_media          | **SIN CAMBIOS**                                                      | `supabase/migrations/20260208140000_clients_and_businesses.sql` líneas 136-142: `Users can update media in own businesses` solo `USING (...)`, sin `WITH CHECK`.                                                                          |
| SEC-003   | Trigger proyecto-cliente-business sin owner_id       | **SIN CAMBIOS**                                                      | `supabase/migrations/20260208140000_clients_and_businesses.sql` líneas 167-181: `check_project_client_business()` valida solo que business pertenezca a client; no valida que client/business tengan el mismo `owner_id` que el proyecto. |
| PERF-001  | updateTaskOrder con updates por fila                 | **SIN CAMBIOS**                                                      | `app/actions/tasks.ts` 309-316, 319-326, 339-345, 348-354: bucles que llaman `supabase.from('tasks').update(...).eq('id', t.id)` por cada tarea afectada. Sin transacción explícita.                                                      |
| PERF-002  | N+1 en getProjectsWithTodoSummaryAction              | **SIN CAMBIOS**                                                      | `app/todo/actions.ts` 336-350: `for (const project of projects)` y dentro `await getTodoItemsByListIds(listIds)` por proyecto.                                                                                                            |
| VIBE-001  | Uso de `any` / @ts-ignore en operaciones críticas    | **SIN CAMBIOS**                                                      | `app/actions/tasks.ts` (casts `as any` en updateTaskOrder, getRecentTasksPage, getHighPriorityTasksPage, getCriticalTasks). No se revisaron en detalle `lib/idea-graph/*` ni `app/budgets/[id]/actions.ts`.                               |
| VIBE-002  | Validación incompleta en createTask/updateTask       | **SIN CAMBIOS**                                                      | `app/actions/tasks.ts`: priority y status se toman de FormData/input sin validación de rango/enum en código (solo CHECK en DB).                                                                                                           |
| SEC-004   | Mensajes de error crudos de auth al cliente          | **SIN CAMBIOS**                                                      | `app/actions/auth.ts` líneas 18, 51, 84, 115: `return { error: error.message }` de Supabase.                                                                                                                                              |
| PERF-003  | Revalidaciones amplias (revalidatePath)              | **SIN CAMBIOS**                                                      | Múltiples acciones siguen llamando `revalidatePath('/dashboard')`, `revalidatePath('/project')`, etc.                                                                                                                                     |
| MAINT-001 | Manejo de errores inconsistente                      | No re-evaluado en esta pasada (mismo criterio que informe original). |
| INFO-001  | Headers de seguridad en next.config                  | No re-evaluado en esta pasada.                                       |

### 2.2 enterprise-technical-debt-audit.md (Phase 1)

| Hallazgo                                                        | Estado                            | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1.1 — Lecturas mixtas (Projects/Tasks)**                | **PARCIALMENTE RESUELTO**         | (1) Dashboard y Analytics: `app/dashboard/page.tsx` y `app/dashboard/analytics/page.tsx` hacen `await getDashboardData()` y pasan `initialProjects`, `initialTasks` a `AnalyticsDashboard`. (2) Pero `components/AnalyticsDashboard.tsx` líneas 180-187 tiene `useEffect` que vuelve a llamar `getDashboardData()` y actualiza estado — hay refetch en cliente además de datos iniciales. (3) ProjectKanbanClient ya recibe `initialProjects`, `initialProject`, `initialTasks` desde `app/project/[id]/page.tsx` y no hace fetch en mount. (4) Clients, Businesses, Billings, etc. reciben datos por props desde sus páginas. |
| **Phase 1.1 — Supabase en cliente**                             | **PARCIALMENTE RESUELTO**         | No hay uso de `createClient()` de `@/lib/supabase/client` con `.from().select()` en los componentes de rutas principales ya migrados. Excepción: `components/dashboard/TaskListWidget.tsx` línea 5 importa `createClient` de `@/lib/supabase/client`; no se observa uso de ese import en el archivo (posible import muerto).                                                                                                                                                                                                                                                                                                   |
| **Phase 1.2 — Doble refresh (revalidatePath + manual refetch)** | **SIN CAMBIOS** en patrón general | Acciones siguen llamando `revalidatePath(...)` y los clientes siguen llamando `loadData()` / `onProjectUpdated()` / `onTaskUpdate()` tras mutaciones. Ej.: `components/ProjectKanbanClient.tsx` 183-184, 214, 297: `onProjectAdded={loadData}`, `onProjectUpdated={loadData}`, `onTaskUpdate={loadData}`.                                                                                                                                                                                                                                                                                                                      |

### 2.3 phase2-blast-radius-audit.md / phase3-concurrency-analysis.md

| Tema                                                    | Estado          | Evidencia                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| updateBusinessFieldsAction en dos pasos sin transacción | **SIN CAMBIOS** | `app/clients/actions.ts` 407-422: primero `supabase.from('businesses').update(...)`; luego, si `payload.client_id !== undefined`, `supabase.from('projects').update({ client_id }).eq('business_id', id)`. No hay transacción ni RPC atómico; error en el segundo paso no revierte el primero. |
| updateTaskOrder multi-paso sin transacción              | **SIN CAMBIOS** | Ya citado en PERF-001; bucles de updates por fila y sin rollback.                                                                                                                                                                                                                              |

### 2.4 phase4-rls-policy-audit.md

- Coincide con codebase-findings: SEC-001, SEC-002, SEC-003 **SIN CAMBIOS** (políticas UPDATE sin WITH CHECK en budget_categories, budget_items, business_media; trigger sin validación de owner_id).

### 2.5 phase5-schema-code-audit.md / no-select-star

| Tema                     | Estado       | Evidencia                                                                                                                                                                                        |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SELECT \* en app/ y lib/ | **RESUELTO** | Búsqueda con patrón `.select('*')` / `select("*")` en `app/` y `lib/`: sin coincidencias. Las consultas usan columnas explícitas (p. ej. `TASK_COLS`, `PROJECT_COLS` en tasks.ts y projects.ts). |

### 2.6 phase6-performance-audit.md

| Patrón                                                        | Estado                                                                                            | Evidencia                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| N+1 en getProjectsWithTodoSummaryAction                       | **SIN CAMBIOS**                                                                                   | `app/todo/actions.ts` 336-350: bucle por proyecto con `getTodoItemsByListIds(listIds)` por cada uno. |
| N+1 en updateTaskOrder (updates por fila)                     | **SIN CAMBIOS**                                                                                   | `app/actions/tasks.ts` 309-316, 319-326, 339-345, 348-354.                                           |
| Duplicación de categorías/items en budgets (bucles de insert) | No verificado en detalle en esta pasada; se asume **SIN CAMBIOS** si el código no fue modificado. |

### 2.7 phase7-coupling-analysis.md

- **I18nProvider:** Sigue siendo hub; ya no llama a `getProfile()`/`getPreferencesOptional()` en mount (recibe `initialProfile`/`initialPreferences` desde layout). **PARCIALMENTE RESUELTO** (menos llamadas desde cliente).
- **Sidebar:** Sigue recibiendo proyectos por props desde cada página que lo usa; no hace fetch de proyectos en mount. Acoplamiento a `app/actions/projects` para favoritos y mutaciones.
- **app/clients/actions.ts:** Sigue siendo hub compartido por clients, businesses, billings. Sin cambios estructurales.

---

## 3. Métricas opcionales

- **Rutas con data-loading server-side (datos iniciales por props):** Dashboard, Dashboard/analytics, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo, Settings/appearance, Profile, Project/[id] — **13 rutas** que cargan datos en servidor y pasan props al cliente.
- **Componentes que importan `@/lib/supabase/client`:** 1 — `components/dashboard/TaskListWidget.tsx` (import presente; no se observa uso en el flujo de datos del widget, que usa `queryFn` inyectado).
- **Acciones que siguen con doble-refresh (revalidatePath + callback de refetch en UI):** La mayoría de mutaciones de projects, tasks, clients, businesses, billings siguen con este patrón; ej. ProjectKanbanClient llama `loadData()` tras añadir/editar proyecto o tarea.

---

## 4. Recomendaciones siguientes (priorizadas)

1. **P0 — Seguridad RLS (SEC-001, SEC-002, SEC-003):** Añadir `WITH CHECK` a las políticas `FOR UPDATE` de `budget_categories`, `budget_items` y `business_media`; extender el trigger `check_project_client_business` para validar que `client_id`/`business_id` pertenezcan al mismo `owner_id` que el proyecto.
2. **P0 — Performance:** Eliminar N+1 en `getProjectsWithTodoSummaryAction` (un solo fetch de items por todos los listIds, luego agrupar en memoria); sustituir bucles de update en `updateTaskOrder` por una o dos sentencias set-based o por un RPC atómico.
3. **P1 — Concurrencia:** Envolver en transacción o RPC atómico `updateBusinessFieldsAction` (update businesses + update projects).
4. **P1 — Data flow:** Quitar el `useEffect` que llama a `getDashboardData()` en `AnalyticsDashboard` y usar solo `initialProjects`/`initialTasks`; eliminar el import no usado de `createClient` en `TaskListWidget` si confirma que es dead code.
5. **P2 — Auth y robustez:** Sanitizar mensajes de error en `app/actions/auth.ts` (SEC-004); añadir validación de rango/enum para priority/status en createTask/updateTask (VIBE-002).

---

## 5. Cómo usar este informe

- Este reporte sirve como **línea base** para que Codex (u otro auditor) ejecute el mismo prompt y compare sus resultados con los aquí consignados.
- Se recomienda volver a ejecutar el prompt de re-auditoría tras aplicar las recomendaciones P0/P1 para actualizar el estado (RESUELTO / PARCIAL / SIN CAMBIOS) y las métricas.

---

**Documentos de referencia:** `docs/audits/codebase-findings-2026-02-13.md`, `docs/audits/enterprise-technical-debt-audit.md`, `docs/audits/phase2-blast-radius-audit.md`–`phase7-coupling-analysis.md`, `docs/audits/ANALISIS-AUDITORIAS-Y-PROMPT-REAUDIT.md`.
