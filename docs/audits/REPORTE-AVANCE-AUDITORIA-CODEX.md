# REPORTE DE AVANCE — RE-AUDITORÍA CODEX

**Fecha:** 2026-02-15  
**Alcance:** Revisión comparativa contra los hallazgos en `docs/audits/` y verificación del estado actual del código.

## 1) Resumen ejecutivo

| Categoría                                 | RESUELTO | PARCIALMENTE RESUELTO | SIN CAMBIOS | Total |
| ----------------------------------------- | -------: | --------------------: | ----------: | ----: |
| Data flow (lecturas iniciales)            |        1 |                     2 |           0 |     3 |
| Refresh post-mutación                     |        0 |                     1 |           1 |     2 |
| Seguridad / RLS                           |        0 |                     0 |           4 |     4 |
| Performance (N+1 / loops / transacciones) |        0 |                     0 |           4 |     4 |
| SELECT \* / proyecciones                  |        1 |                     1 |           0 |     2 |
| Coupling                                  |        0 |                     2 |           1 |     3 |

### Resumen corto

- Se confirma avance real en **carga inicial server-side** en rutas clave (Dashboard, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo, Settings/appearance, Profile, Project/[id]): las `page.tsx` ahora cargan datos en servidor y pasan props iniciales. Evidencia: `app/*/page.tsx` con llamadas `await` a acciones de lectura y props `initial*`.
- Persisten problemas críticos originales en **RLS** (SEC-001/002/003) y en **concurrencia/rendimiento** (updateTaskOrder por fila, N+1 de todo summary, multi-paso sin transacción).
- El patrón **doble-refresh** sigue presente en varios flujos (acción con `revalidatePath` + cliente que hace `load*` manual).

---

## 2) Estado por documento de origen

## 2.1 `codebase-findings-2026-02-13.md`

| ID                  | Hallazgo original                                                     | Estado                    | Evidencia actual                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001             | UPDATE RLS sin `WITH CHECK` en `budget_categories`/`budget_items`     | **SIN CAMBIOS**           | En `supabase/migrations/20260208120000_multi_user_projects_tasks_budgets.sql`, las políticas UPDATE siguen solo con `USING (...)` (líneas 150-157 y 190-198), sin `WITH CHECK`. |
| SEC-002             | UPDATE RLS sin `WITH CHECK` en `business_media`                       | **SIN CAMBIOS**           | En `supabase/migrations/20260208140000_clients_and_businesses.sql`, policy `Users can update media in own businesses` (líneas 136-143) sigue sin `WITH CHECK`.                  |
| SEC-003             | Trigger proyecto-cliente-business sin validar `owner_id`              | **SIN CAMBIOS**           | `check_project_client_business()` (líneas 167-181) valida relación `business_id`↔`client_id`, pero no igualdad de tenant/`owner_id` con `projects.owner_id`.                    |
| PERF-001            | `updateTaskOrder` con updates secuenciales por fila y sin transacción | **SIN CAMBIOS**           | `app/actions/tasks.ts` usa bucles con `await ...update(...).eq('id', t.id)` (líneas 309-315, 320-326, 340-345, 349-354) y no hay transacción explícita.                         |
| PERF-002            | N+1 en `getProjectsWithTodoSummaryAction`                             | **SIN CAMBIOS**           | `app/todo/actions.ts` itera proyectos y hace `await getTodoItemsByListIds(listIds)` por proyecto (líneas 336-341).                                                              |
| PERF-003            | Revalidaciones amplias/repetidas                                      | **SIN CAMBIOS**           | Sigue uso extendido de `revalidatePath(...)` en acciones (`app/actions/projects.ts`, `app/actions/tasks.ts`, `app/clients/actions.ts`, etc.).                                   |
| SEC-004             | Mensajes crudos de auth                                               | **SIN CAMBIOS**           | `app/actions/auth.ts` mantiene retornos con `error.message` directamente al cliente.                                                                                            |
| VIBE-001 / VIBE-002 | `any` y validación incompleta en tareas                               | **PARCIALMENTE RESUELTO** | Se mantienen `as any` en rutas críticas (`app/actions/tasks.ts`, `app/budgets/actions.ts`) y validaciones de dominio aún delegadas en parte a DB.                               |

## 2.2 `enterprise-technical-debt-audit.md`

| Hallazgo/grupo                                              | Estado                    | Evidencia actual                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitectura de lectura mixta (server + client mount fetch) | **PARCIALMENTE RESUELTO** | Muchas rutas ahora usan server loading y props iniciales: `app/dashboard/page.tsx`, `app/projects/page.tsx`, `app/clients/page.tsx`, `app/businesses/page.tsx`, `app/billings/page.tsx`, `app/budgets/page.tsx`, `app/ideas/page.tsx`, `app/notes/page.tsx`, `app/todo/page.tsx`, `app/settings/appearance/page.tsx`, `app/profile/page.tsx`, `app/project/[id]/page.tsx`. Aun así, existen lecturas al montar en clientes puntuales (ej. `app/todo/TodoDashboardClient.tsx` líneas 21-39). |
| Doble-refresh sistémico                                     | **SIN CAMBIOS**           | Ejemplo: `updateTaskOrder` hace `revalidatePath` (`app/actions/tasks.ts` 369-370) y UI vuelve a cargar por callback (`components/KanbanBoard.tsx` 217 + `components/ProjectKanbanClient.tsx` 214). También en billings: acción con `revalidatePath('/billings')` (`app/billings/actions.ts` 115/138/175) y cliente hace `loadBillings()` tras mutar (`app/billings/BillingsPageClient.tsx` 197-207).                                                                                        |

## 2.3 `phase2-blast-radius-audit.md`

| Hallazgo/grupo                               | Estado          | Evidencia actual                                                                                      |
| -------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| Riesgo de interleaving en `updateTaskOrder`  | **SIN CAMBIOS** | La implementación sigue read-then-loop-update sin atomicidad en `app/actions/tasks.ts` 275-371.       |
| Impacto cascada por invalidaciones y refetch | **SIN CAMBIOS** | Persisten invalidaciones amplias + recargas manuales en clientes (`projects/tasks/clients/billings`). |

## 2.4 `phase3-concurrency-analysis.md`

| Hallazgo/grupo                                             | Estado          | Evidencia actual                                                                                                                                              |
| ---------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateBusinessFieldsAction` multi-paso sin transacción    | **SIN CAMBIOS** | Primero actualiza `businesses` y luego (condicional) actualiza `projects` (líneas 408-423 de `app/clients/actions.ts`) sin wrapper transaccional/RPC atómico. |
| `updateTaskOrder` multi-paso sin transacción               | **SIN CAMBIOS** | Secuencia de múltiples writes sin transacción (`app/actions/tasks.ts` 289-363).                                                                               |
| `duplicateBudget` con duplicación secuencial por categoría | **SIN CAMBIOS** | `for (const category...)` con inserts secuenciales (líneas 318-361 de `app/budgets/actions.ts`).                                                              |

## 2.5 `phase4-rls-policy-audit.md`

- **SIN CAMBIOS** para los tres puntos de seguridad principales: SEC-001, SEC-002, SEC-003 (mismas evidencias en migraciones indicadas arriba).

## 2.6 `phase5-schema-code-audit.md`

| Hallazgo/grupo                                                   | Estado                    | Evidencia actual                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.select('*')` explícito en `app/` y `lib/`                      | **RESUELTO**              | Búsqueda actual no arroja coincidencias para `.select('*')`/`select("*")`.                                                                                                                                                      |
| Proyección amplia equivalente (`.select()` vacío o `*` embebido) | **PARCIALMENTE RESUELTO** | Persisten `.select()` sin columnas explícitas en mutaciones (ej. `app/actions/projects.ts`, `app/actions/tasks.ts`, `app/clients/actions.ts`) y `*` embebido en duplicación de presupuestos (`app/budgets/actions.ts` 298-300). |

## 2.7 `phase6-performance-audit.md`

| Hallazgo/grupo                                         | Estado          | Evidencia actual                  |
| ------------------------------------------------------ | --------------- | --------------------------------- |
| N+1 en resumen TODO por proyecto                       | **SIN CAMBIOS** | `app/todo/actions.ts` 336-341.    |
| Writes por-fila en reorder de tasks                    | **SIN CAMBIOS** | `app/actions/tasks.ts` 309-354.   |
| Writes secuenciales en duplicación de categorías/items | **SIN CAMBIOS** | `app/budgets/actions.ts` 318-361. |

## 2.8 `phase7-coupling-analysis.md`

| Hallazgo/grupo                                                          | Estado                    | Evidencia actual                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Import de `lib/supabase/client` en componentes cliente                  | **PARCIALMENTE RESUELTO** | Gran reducción vs auditoría previa; hoy queda al menos `components/dashboard/TaskListWidget.tsx` (línea 5).              |
| Hubs de acoplamiento (`I18nProvider`, `Sidebar`, `app/clients/actions`) | **SIN CAMBIOS**           | Siguen siendo nodos centrales por cantidad de importaciones/uso transversal.                                             |
| Lecturas en mount desde varios clientes                                 | **PARCIALMENTE RESUELTO** | Bajó en rutas principales con server props, pero persisten casos como `app/todo/TodoDashboardClient.tsx` (líneas 21-39). |

## 2.9 Documentos de contexto

- `milestone-feasibility-audit.md`, `miles-v1-integration-viability.md`, `multi-user-signup-analysis.md`: **sin hallazgos de seguridad/performance adicionales a reclasificar en esta pasada**; se mantienen como contexto de arquitectura y roadmap.

---

## 3) Métricas de avance

- **Rutas objetivo con server-side data-loading en `page.tsx`: 12 de 12** (Dashboard, Projects, Clients, Businesses, Billings, Budgets, Ideas, Notes, Todo, Settings/appearance, Profile, Project/[id]).
- **Uso directo de `@/lib/supabase/client` en `app/` + `components/`: 1 archivo** (`components/dashboard/TaskListWidget.tsx`).
- **Acciones críticas aún sin atomicidad transaccional:** al menos 3 (`updateTaskOrder`, `updateBusinessFieldsAction`, `duplicateBudget`).
- **Patrón doble-refresh aún visible:** confirmado en Task Board y Billings.

---

## 4) Recomendaciones siguientes (priorizadas)

1. **P0 Seguridad:**
   - Añadir `WITH CHECK` en UPDATE para `budget_categories`, `budget_items`, `business_media`.
   - Extender `check_project_client_business()` para validar tenant (`owner_id`) consistente con `projects.owner_id`.

2. **P0 Concurrencia/Rendimiento:**
   - Migrar `updateTaskOrder` a RPC/SQL atómico set-based.
   - Reescribir `getProjectsWithTodoSummaryAction` para evitar N+1 (un fetch de items + agrupación en memoria).
   - Convertir `updateBusinessFieldsAction` y `duplicateBudget` a flujo atómico (RPC/función SQL con transacción).

3. **P1 Flujo de datos/refresh:**
   - Eliminar doble refresh en clientes que ya dependen de `revalidatePath` (o viceversa).
   - Priorizar `KanbanBoard` y `BillingsPageClient` para simplificar post-mutación.

4. **P2 Higiene de consultas:**
   - Sustituir `.select()` vacío por columnas explícitas donde aplique.
   - Evitar `*` embebido en selects anidados (`app/budgets/actions.ts`).
