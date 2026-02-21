# Plan: Etapas — Paginación por columna y campo Tags

**Objetivo:** Mejorar el módulo de Etapas (tab Board/Kanban) con dos cambios: (1) cargar como máximo 5 tareas por columna en la carga inicial y ofrecer un botón "Ver más" para cargar 5 adicionales por columna; (2) añadir un campo **tags** en las tareas, mostrado en la card debajo del nombre (máximo 3 tags, separados por coma), sin tabla dedicada en la base de datos.

**Contexto:** El tab de Etapas usa `ContextBoardFromCache` + `ContextBoardClient` + `KanbanBoard` + `Column` + `TaskCard`. Los datos se obtienen con `getTasksByProjectId(projectId)`, que actualmente devuelve **todas** las tareas del proyecto. Las tareas se filtran por `status` en el cliente y se muestran por columna.

---

## Reglas y patrones obligatorios

- **`.cursorrules`** y **`docs/patterns/`** siguen aplicando.
- **Data loading:** datos iniciales desde servidor; no `useEffect` para carga inicial de página.
- **Context Session Cache:** el board ya usa cache `{ type: 'board', projectId }`; la paginación debe convivir con ese patrón (carga inicial paginada; "Ver más" puede ser una acción que amplía lo cacheado o que pide más datos y los fusiona).
- **Loading:** siempre shimmer (skeleton), nunca spinner ni "Loading...".
- **Mutaciones:** no `router.refresh()`; usar datos devueltos por la acción o `onRefresh` (invalidar cache + refetch).
- **Queries:** select explícito, siempre filtrar por `project_id` en tareas.

---

## 1. Feature 1: Paginación por columna (máx 5 + "Ver más")

### 1.1 Problema actual

- `getTasksByProjectId(projectId)` devuelve **todas** las tareas del proyecto.
- En proyectos con muchas tareas, la consulta y el payload inicial son grandes y el cliente pinta todas las columnas llenas desde el principio.

### 1.2 Comportamiento deseado

- **Carga inicial:** por cada columna (status), cargar como máximo **5 tareas** (ordenadas por `order_index`).
- Si en una columna hay más de 5 tareas, mostrar un botón **"Ver más"** al final de esa columna.
- Al hacer clic en "Ver más", cargar **5 tareas más** de esa misma columna (offset/limit por status) y añadirlas a la lista ya mostrada; si ya no quedan más, ocultar el botón.

Requisitos implícitos:

- El **conteo total** por columna (ej. "7 tareas") debe seguir siendo correcto. Eso implica poder obtener el count por status sin traer todas las filas (p. ej. una query de conteo por status o una API que devuelva counts + primera página por columna).
- Drag & drop y reordenamiento deben seguir funcionando; si el usuario solo tiene cargadas 5 tareas en una columna, el movimiento de una tarea sigue siendo válido (el backend ya maneja `order_index` por status).

### 1.3 Opciones de diseño

**Opción A — Carga inicial por columna (recomendada)**

- Nueva server action (o ampliación de la existente) que en lugar de devolver todas las tareas, devuelve:
  - Por cada status: **count** total + **primeras 5 tareas** (ordenadas por `order_index`).
- El cliente construye el estado del board con esas 5 por columna y los counts.
- "Ver más" en la columna X: llamar a una acción `getTasksByProjectIdForStatus(projectId, status, offset)` con `offset = 5`, `limit = 5` (y sucesivos: 10, 15…), y **fusionar** los resultados en el estado de esa columna (y en cache si se cachea el board).
- Cache: la clave sigue siendo `board:${projectId}`. El valor puede ser: `{ project, tasksByStatus: { [status]: { count, tasks } }, expandedOffsets: { [status]: number } }` para saber hasta qué offset hemos cargado por columna, o bien guardar una lista plana de tasks y derivar counts de una primera carga de counts.

**Opción B — Una sola query inicial con LIMIT global**

- Query única que devuelve, por ejemplo, las primeras 25 tareas del proyecto (5 por cada uno de los 5 status) usando `ORDER BY status, order_index` y ventanas o varias subconsultas. Es más complejo en SQL y menos flexible para "Ver más" por columna.

**Recomendación:** Opción A. Dos tipos de datos:

1. **Counts por status:** `getBoardCountsByStatus(projectId)` → `{ backlog: n, next: n, ... }`.
2. **Tareas por status con paginación:** `getTasksByProjectIdPaginated(projectId, status, offset, limit)` (p. ej. offset 0, limit 5 para inicial; luego 5, 5 para "Ver más").  
   O bien una sola acción que devuelva counts + primera página por cada status: `getBoardInitialData(projectId)` → `{ project, counts: {...}, tasksByStatus: { [status]: Task[] } }` (cada array con max 5 ítems), y otra `getMoreTasksForStatus(projectId, status, offset, limit)` para "Ver más".

### 1.4 Consideraciones

- **RLS y permisos:** las queries deben seguir filtrando por proyecto y, vía join con `projects`, por `owner_id` (o el mismo criterio que usa hoy `getTasksByProjectId`).
- **Orden:** siempre `order_index ASC` dentro de cada status.
- **Cache:** al mutar (crear/editar/eliminar tarea, mover tarea), invalidar `board:${projectId}` y volver a cargar (o actualizar counts y listas con los datos devueltos por la mutación). Si se usa "Ver más", hay que decidir si tras una mutación se mantiene la lista expandida o se resetea a 5 por columna (reseteo más simple y predecible).
- **UI:** el botón "Ver más" solo visible cuando `count(status) > tasks.length` para esa columna; al cargar más, mostrar shimmer en la columna (o en la zona del botón) hasta que lleguen los datos, luego reemplazar por las nuevas cards y, si aún quedan más, mantener el botón.

---

## 2. Feature 2: Campo Tags en tareas

### 2.1 Requisitos

- **Base de datos:** un solo campo nuevo en la tabla **tasks**, por ejemplo `tags` de tipo **TEXT**. Formato almacenado: cadena con hasta 3 tags separados por coma (ej. `"bug, dev, new feature"`). No se crea tabla de tags ni relación N:M.
- **Validación:** en aplicación (y opcionalmente en DB con CHECK): máximo 3 tags; normalización de espacios (trim) y posiblemente normalización de comas (evitar comas consecutivas).
- **UI — Card (TaskCard):** debajo del **nombre** de la tarea, mostrar los tags como pequeños chips/badges (o texto separado por comas). Máximo 3; si el usuario guardó 3, mostrar los 3.
- **UI — Editar tarea (EditTaskModal):** nuevo campo "Tags" (opcional). Entrada libre: el usuario escribe por ejemplo "bug, dev" o "new module"; al guardar se trimea, se divide por coma, se toman como máximo 3 y se vuelve a unir para guardar en `tags`.

### 2.2 Esquema de datos

- **Tabla `tasks`:** nueva columna `tags TEXT` (nullable o default `''`).
- **Tipos (TypeScript):** en `Database['public']['Tables']['tasks']['Row']` (y Insert/Update) añadir `tags: string | null`.
- **Queries:** incluir `tags` en el select de tareas donde se use la tarea en el board y en el modal de edición.

### 2.3 Comportamiento del campo

- **Creación de tarea:** `create_task_atomic` debe aceptar un parámetro opcional `in_tags` y escribir en `tasks.tags`. Si no se pasa, `NULL` o `''`.
- **Actualización de tarea:** `updateTask` en server action debe leer `tags` del form y hacer update en `tasks.tags`.
- **Parseo:** en el cliente (y donde haga falta), una función auxiliar que dado `task.tags` devuelva un array de hasta 3 strings (split por coma, trim, filter vacíos, slice(0,3)).

### 2.4 UI resumida

| Lugar         | Cambio                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| TaskCard      | Debajo del título, línea con hasta 3 tags como badges o texto.            |
| EditTaskModal | Campo "Tags" (input o textarea); placeholder ej. "bug, dev, new feature". |
| AddTaskModal  | Opcional: mismo campo tags para nueva tarea.                              |

No hay tabla de tags en BD; no hay autocompletado obligatorio (se puede añadir después con sugerencias en cliente si se desea).

---

## 3. Orden de implementación recomendado

1. **Documento de diseño** (este documento) — listo.
2. **Feature 1 — Paginación**
   - 2.1 Migración/backend: no obligatorio cambiar schema; solo nuevas (o modificadas) server actions y queries.
   - 2.2 Añadir `getBoardCountsByStatus(projectId)` (o equivalente) y `getTasksByProjectIdPaginated(projectId, status, offset, limit)` (o `getBoardInitialData` + `getMoreTasksForStatus`).
   - 2.3 Ajustar `ContextBoardFromCache` / flujo de datos para usar counts + tareas paginadas por columna.
   - 2.4 En `KanbanBoard`/`Column`, recibir por columna la lista de tareas ya limitada y el count total; mostrar botón "Ver más" cuando `count > tasks.length`, y al clicar llamar a la acción de "más" y fusionar resultados (y actualizar cache si aplica).
   - 2.5 Tras mutaciones (crear/editar/eliminar/mover), invalidar cache y recargar datos del board (o actualizar con datos devueltos); decidir si se resetea la paginación a 5 por columna.
3. **Feature 2 — Tags**
   - 3.1 Migración: añadir columna `tags` (TEXT) a `tasks`.
   - 3.2 Actualizar tipos en `lib/supabase/types.ts` (o regenerar tipos).
   - 3.3 Incluir `tags` en todos los selects de tareas (TASK_COLS en actions, create_task_atomic si existe, etc.).
   - 3.4 `create_task_atomic`: añadir parámetro `in_tags` y escribir en `tasks.tags`.
   - 3.5 Server action `updateTask`: leer `tags` del FormData y actualizar.
   - 3.6 `EditTaskModal`: estado y campo para tags; al guardar enviar string normalizado (máx 3, separados por coma).
   - 3.7 `TaskCard`: debajo del título, mostrar tags (parsear string a array y renderizar hasta 3).
   - 3.8 (Opcional) `AddTaskModal`: campo tags para nueva tarea.

---

## 4. Resumen de archivos a tocar (estimado)

| Feature    | Archivos                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paginación | `app/actions/tasks.ts`, `app/context/[projectId]/board/ContextBoardFromCache.tsx`, `app/context/[projectId]/board/ContextBoardClient.tsx`, `components/KanbanBoard.tsx`, `components/Column.tsx`; posiblemente `BoardContent.tsx` si se usa. |
| Tags       | Migración SQL nueva, `lib/supabase/types.ts`, `app/actions/tasks.ts`, `components/EditTaskModal.tsx`, `components/TaskCard.tsx`, `components/AddTaskModal.tsx` (opcional); migración que altere `create_task_atomic` (añadir in_tags).       |

---

## 5. Referencias

- Reglas globales: `.cursorrules`
- Carga de datos: `docs/patterns/data-loading.md`
- Cache de sesión: `docs/patterns/context-session-cache.md`
- Acciones de servidor: `docs/patterns/server-actions.md`
- Queries: `docs/patterns/database-queries.md`
