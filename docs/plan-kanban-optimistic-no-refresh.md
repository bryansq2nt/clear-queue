# Plan: Kanban optimista sin refresh y manejo de errores

**Estado:** Borrador (pendiente de aprobación)  
**Fecha:** 2026-02-21  
**Contexto:** Eliminar el refresh completo de la vista Kanban al crear, actualizar o mover tareas. La UI debe actualizarse en cliente sin nuevo fetch; si el server action falla, mostrar diálogo con “Reintentar” o “Cancelar” (revertir).

---

## 0. Vista objetivo y vista antigua (alcance)

### Vista en la que trabajamos (nueva navegación por contexto)

- **Ruta:** `/context/[projectId]/board`
- **Componentes:** `ContextBoardFromCache` → `BoardContent` (server) → **ContextBoardClient**
- **UI:** Kanban con pestañas de estado (Pendientes, Lo Siguiente, En Progreso, Bloqueado, Terminado), barra verde de navegación (Etapas, Responsable, Notas, Ideas, Presupuestos, Tareas, Salir). Sin sidebar de recursos.
- **Código:** `app/context/[projectId]/board/ContextBoardClient.tsx` usa `KanbanBoard` + `AddTaskModal`; actualmente llama `loadData()` (onRefresh o router.refresh) en cada cambio de tarea.

Toda la implementación de “optimista sin refresh” y “diálogo de error Reintentar/Cancelar” se hace **en esta vista** (ContextBoardClient y sus hijos/callbacks).

### Vista antigua (eliminada en Etapas 2–3)

- **Ruta:** `/project/[id]` → ahora solo hace **redirect** a `/context/[id]/board`.
- **Página:** `app/project/[id]/page.tsx` — ya no renderiza nada; solo `redirect(\`/context/${id}/board\`)`.
- **Eliminados:** `ProjectKanbanClient.tsx` y `ProjectResourcesPanel.tsx` (ya no usados).

**Enlaces actuales a la vista antigua (habrá que actualizarlos a `/context/[projectId]/board` o redirigir):**

- `components/Sidebar.tsx` — enlace a `/project/${project.id}`
- `app/projects/ProjectsPageClient.tsx` — `router.push('/project/...')`
- `components/AnalyticsDashboard.tsx` — `router.push('/project/...')`
- `app/ideas/IdeasPageClient.tsx` — `router.push('/project/...')`
- `app/clients/[id]/ClientDetailClient.tsx` — `href={/project/${p.id}}`
- `app/businesses/[id]/BusinessDetailClient.tsx` — `href={/project/${p.id}}`

**Criterio de eliminación:** Hacerlo por **etapas** para no romper el código: primero redirigir y unificar enlaces a contexto; luego eliminar ruta y componentes que queden huérfanos.

---

## 1. Objetivos

- **Sin refresh:** Al crear, actualizar o mover una tarea, la UI refleja el cambio de inmediato usando los datos que ya tenemos o los que devuelve el server. No se llama a `loadData()` ni se hace refetch.
- **Ahorro de fricción:** Un fetch menos y menos tiempo de espera; la sensación es instantánea.
- **Manejo de errores robusto:** Si el server action falla después de haber actualizado la UI:
  - Mostrar un **diálogo** con el mensaje de error.
  - **Reintentar:** botón que vuelve a ejecutar la misma acción en el servidor (sin pedir de nuevo datos al usuario).
  - **Cancelar:** revertir el cambio en la UI (undo) para que la lista quede como antes.

---

## 2. Estado actual (vista contexto `/context/[projectId]/board`)

- **ContextBoardClient** recibe `initialTasks` y los pasa a `KanbanBoard`; no mantiene estado local de tasks (usa props). Pasa `onTaskUpdate={loadData}` donde `loadData` es `onRefresh` (cache) o `router.refresh()`. Cualquier actualización de tarea dispara ese refresh.
- **KanbanBoard** ya hace optimismo en el **drag**: aplica `applyOptimisticTaskMove`, llama a `updateTaskOrder`; si hay error revierte con `setOptimisticTasks(tasks)` y muestra toast; si hay éxito llama `onTaskUpdate()` → refresh (innecesario).
- **EditTaskModal:** al guardar llama `updateTask()`; si éxito llama `onTaskUpdate()` y cierra → refresh. Si error muestra mensaje inline, sin diálogo de reintentar/cancelar.
- **AddTaskModal:** al crear llama `createTask()`; si éxito llama `onTaskAdded()` (que hace `loadData()` y cierra) → refresh. Si error muestra mensaje inline.
- **create_task_atomic** (RPC) ya **devuelve** la fila creada (`RETURNS public.tasks`). La acción `createTask` puede devolver esa tarea para insertarla en la lista sin refetch.
- **updateTask** ya devuelve `{ data }` con la tarea actualizada; podemos aplicar ese `data` al estado local sin refetch.

---

## 3. Comportamiento objetivo (resumen)

| Acción     | UI inmediata                                                | Si el server falla                                                                                                                           |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mover**  | Mover tarea de columna en estado local                      | Diálogo error → Reintentar (re-ejecutar `updateTaskOrder`) o Cancelar (revertir a `tasks` previo).                                           |
| **Editar** | Aplicar cambios a la tarea en estado local                  | Diálogo error → Reintentar (re-ejecutar `updateTask` con mismos datos) o Cancelar (restaurar tarea anterior).                                |
| **Crear**  | Añadir tarea a la lista (optimista o con `data` del server) | Diálogo “Error al agregar tarea” → Reintentar (re-ejecutar `createTask` con mismo payload) o Cancelar (quitar la tarea añadida de la lista). |

En todos los casos, **Reintentar** solo vuelve a llamar al server con la misma información; no se vuelve a abrir el modal ni a pedir datos al usuario.

---

## 4. Escenarios detallados

### 4.1 Mover tarea (drag & drop)

- **Antes del server:** Guardar copia `previousTasks = tasks`. Aplicar movimiento optimista a la lista (ya existe `applyOptimisticTaskMove`) y actualizar estado (en el padre o en KanbanBoard según dónde vivan las tareas).
- **Llamar:** `updateTaskOrder(taskId, newStatus, newOrderIndex, oldStatus)`.
- **Éxito:** No hacer nada más (la UI ya está actualizada). No llamar `loadData()`.
- **Error:** Abrir diálogo de error con mensaje del server.
  - **Reintentar:** llamar de nuevo `updateTaskOrder(...)` con los mismos argumentos; si éxito cerrar diálogo; si error seguir mostrando diálogo.
  - **Cancelar:** restaurar estado con `previousTasks` (revertir el movimiento).

### 4.2 Actualizar tarea (EditTaskModal)

- **Antes del server:** Guardar `previousTask = { ...task }`. Aplicar en estado local los cambios del formulario (título, status, prioridad, etc.) para esa tarea y cerrar el modal.
- **Llamar:** `updateTask(task.id, formData)`.
- **Éxito:** Opcionalmente sincronizar con `result.data` si se quiere `updated_at` etc. No llamar `loadData()`.
- **Error:** Abrir diálogo de error.
  - **Reintentar:** volver a llamar `updateTask(task.id, formData)` con el mismo `formData` (el modal ya está cerrado; los datos se guardan en un ref o en estado del flujo de error).
  - **Cancelar:** restaurar `previousTask` en la lista (undo del edit).

### 4.3 Crear tarea (AddTaskModal)

- **Opción A (optimista):** Añadir a la lista una tarea “temporal” (id temporal, ej. `temp-${Date.now()}`) con los datos del formulario y cerrar el modal. Llamar `createTask(formData)`. Si éxito: reemplazar la tarea temporal por `result.data` (id real, `order_index`, etc.). Si error: diálogo.
  - **Reintentar:** volver a llamar `createTask(formData)` (guardar `formData` en ref/estado del flujo de error). Si éxito: reemplazar temporal por `result.data` y cerrar diálogo.
  - **Cancelar:** quitar de la lista la tarea que se había añadido (la temporal o la que se puso al cerrar el modal).
- **Opción B (no optimista hasta respuesta):** No añadir a la lista hasta tener respuesta. Si éxito: añadir `result.data` y cerrar modal. Si error: diálogo; Reintentar = mismo `createTask(formData)`; Cancelar = solo cerrar diálogo (no hay nada que quitar).  
  La opción B es más simple y evita ids temporales; la A da sensación más instantánea. Recomendación: **B** para la primera iteración (menos casos borde); luego se puede pasar a A si se desea.

---

## 5. Componentes y cambios

### 5.1 Diálogo de error reutilizable

- **Componente:** `MutationErrorDialog` (o nombre similar), por ejemplo en `components/MutationErrorDialog.tsx`.
- **Props:**
  - `open`, `onOpenChange`
  - `title` (ej. “Error al guardar”)
  - `message` (mensaje de error del server o genérico)
  - `onTryAgain: () => void | Promise<void>`
  - `onCancel: () => void` (revertir y cerrar)
- **Comportamiento:** Mostrar mensaje, botón “Reintentar” (puede mostrar loading mientras se reintenta) y botón “Cancelar” que llama `onCancel` y cierra.

### 5.2 ContextBoardClient (vista contexto — dueño de estado de tasks)

- **Estado:** ContextBoardClient debe ser el dueño de `tasks` en estado (ej. `useState(initialTasks)`) para poder actualizar sin refetch. Hoy solo pasa `initialTasks` al KanbanBoard; habrá que levantar estado y pasar `tasks` + callbacks de actualización.
- **Cambio de contrato con KanbanBoard:**
  - Dejar de pasar `onTaskUpdate={loadData}`.
  - Pasar en su lugar algo que permita actualizar la lista sin refetch:
    - `tasks` desde estado y `onTasksChange={(updater) => setTasks(updater)}` o callbacks concretos: `onTaskMoved`, `onTaskUpdated`, `onTaskAdded` que hagan `setTasks(...)`.
- **Manejo de error unificado:** Mantener estado (o ref) para el diálogo de error: `errorDialog: { open, title, message, onTryAgain, onCancel }`. Cuando cualquier acción falle, rellenar este estado y abrir el diálogo; “Reintentar” ejecutará la función guardada; “Cancelar” ejecutará el revert y cerrará.
- **Bulk delete:** Si en esta vista se añade borrado masivo más adelante, usar el mismo `MutationErrorDialog` (Reintentar / Cancelar con revert).

### 5.3 KanbanBoard

- **Props:** Recibir `tasks` y una forma de actualizar la lista en el padre: p. ej. `onTasksChange((prev) => newTasks)` o `setTasks` + `previousTasksRef` en el padre para revert.
- **Drag end:**
  - Guardar `previousTasks = tasks` (o que el padre lo guarde vía callback antes de aplicar optimista).
  - Aplicar movimiento optimista y notificar al padre (ej. `onTasksChange(updated)` o `setTasks(updated)`).
  - Llamar `updateTaskOrder(...)`.
  - Si **éxito:** no llamar a `loadData` ni refrescar.
  - Si **error:** notificar al padre que abra el diálogo de error con:
    - `onTryAgain`: volver a llamar `updateTaskOrder(taskId, newStatus, newOrderIndex, task.status)`.
    - `onCancel`: `setTasks(previousTasks)` (revertir).
- **Sincronización con props:** Si `tasks` viene del padre, al hacer revert o al recibir nuevos props, el estado interno optimista (si se mantiene en KanbanBoard) debe seguir sincronizado con `tasks` (ej. `useEffect(() => setOptimisticTasks(tasks), [tasks])`, que ya existe).

### 5.4 EditTaskModal

- **Nuevo contrato con el padre:** En lugar de solo `onTaskUpdate()`, el padre puede pasar p. ej. `onTaskUpdate(updatedTask)` o `onTaskUpdated(previousTask, formData, result)` para que el padre actualice la lista con la tarea editada y, en caso de error, tenga `previousTask` para revertir.
- **Flujo:**
  - Al guardar: el padre guarda `previousTask`, aplica en su estado los cambios del form (o un objeto “pending update”) y cierra el modal.
  - Se llama `updateTask(id, formData)`.
  - Si error: el padre abre `MutationErrorDialog` con `onTryAgain` = `() => updateTask(id, formData)` de nuevo (formData guardado en ref/estado) y `onCancel` = restaurar `previousTask` en la lista.
- **Alternativa:** El modal no cierra hasta tener respuesta del server; si hay error se muestra el diálogo (o el mensaje actual) con “Reintentar” y “Cancelar” (Cancel = cerrar diálogo y dejar la tarea como estaba). Así no hace falta guardar `formData` en el padre para el retry; el modal sigue abierto con el form. La decisión es de UX: cerrar pronto (optimista) vs mantener modal abierto hasta confirmación.

### 5.5 AddTaskModal

- **Mismo criterio que en 4.3:** Primera iteración: no añadir tarea a la lista hasta tener respuesta (opción B). Al éxito: callback `onTaskAdded(createdTask)`; el padre hace `setTasks(prev => [...prev, createdTask].sort(...))` y cierra el modal. No `loadData()`.
- **Si error:** Diálogo “Error al agregar la tarea”.
  - **Reintentar:** volver a llamar `createTask(formData)` (el modal puede quedarse abierto con el form, o cerrarse y guardar formData para retry).
  - **Cancelar:** cerrar diálogo; si se había añadido algo optimista, quitarlo.
- Si más adelante se hace creación optimista (opción A), al Cancelar del diálogo habría que quitar la tarea temporal de la lista.

---

## 6. Server actions

- **createTask:** Ya devuelve `{ data }`; el RPC `create_task_atomic` devuelve la fila. Asegurar que en el cliente se use `result.data` (y que el tipo sea la fila `tasks`) para añadir la tarea a la lista. No hace falta cambiar la firma si ya se devuelve la fila en `data`.
- **updateTask:** Ya devuelve `{ data }` con la tarea actualizada. Usar `result.data` para actualizar la tarea en el estado local (opcional, para `updated_at` etc.) o confiar en el estado optimista.
- **updateTaskOrder:** Sigue devolviendo `{ error }` o `{ success: true }`. No es necesario devolver la lista; la UI ya está actualizada por el optimismo.
- **revalidatePath:** Se puede seguir llamando en las acciones para que otras rutas (dashboard, context) sigan coherentes; la vista de board en contexto ya no dependerá de ese refresh para su propia lista.

---

## 7. Orden de implementación sugerido

1. **MutationErrorDialog:** Crear el componente con props `open`, `onOpenChange`, `title`, `message`, `onTryAgain`, `onCancel`.
2. **ContextBoardClient – estado de error y estado de tasks:** Añadir estado de `tasks` (useState(initialTasks)) y estado/ref para el diálogo de error (open, title, message, onTryAgain, onCancel); renderizar `MutationErrorDialog`.
3. **Move (KanbanBoard):**
   - Cambiar contrato a “actualizar lista en padre sin loadData” (setTasks / onTasksChange).
   - En error, en lugar de toast: llamar al padre para abrir el diálogo con Reintentar/Cancelar; Cancelar = revert con `previousTasks`.
4. **Create (AddTaskModal):**
   - Sin optimismo inicial: al éxito, `onTaskAdded(createdTask)` con `result.data`; padre hace `setTasks(prev => [...prev, createdTask].sort(...))` y cierra modal.
   - En error: abrir diálogo desde el padre (o desde el modal si el padre pasa un callback), Reintentar = `createTask(formData)` de nuevo, Cancelar = cerrar.
5. **Update (EditTaskModal):**
   - Aplicar en el padre el cambio optimista (o mantener modal abierto hasta respuesta, según UX elegida).
   - Al éxito: actualizar tarea en estado con `result.data` (o con el form) y cerrar modal.
   - Al error: diálogo Reintentar/Cancelar; Cancelar = restaurar `previousTask`.
6. **Bulk delete (opcional):** Usar el mismo `MutationErrorDialog` en caso de error; Reintentar = `deleteTasksByIds` de nuevo; Cancelar = restaurar las tareas en la lista.
7. **Traducciones:** Añadir en `locales` textos para el diálogo: título, mensaje genérico, “Reintentar”, “Cancelar” (si no existen ya).

---

## 8. Traducciones

- Asegurar claves para: “Error al guardar”, “Error al agregar la tarea”, “Reintentar”, “Cancelar” (o reutilizar “common.cancel”), y un mensaje genérico para errores de servidor.

---

## 9. Testing manual sugerido

- Mover tarea: ver que la columna cambia al instante y no hay refresh; simular error (ej. cortar red o fallo en server) y comprobar diálogo, Reintentar y Cancelar (revert).
- Crear tarea: ver que al crear la tarea aparece en la lista sin recargar; en error, Reintentar y Cancelar.
- Editar tarea: mismo criterio; Cancelar restaura título/estado/prioridad anteriores.
- Comprobar que al navegar fuera y volver (si aplica session cache) la lista sigue correcta sin doble fetch.

---

## 10. Resumen de decisión UX

- **Move:** Optimista; error → diálogo Reintentar/Cancelar; Cancelar = revert.
- **Create:** Primera versión sin añadir tarea hasta respuesta del server; al éxito se añade `result.data`; error → diálogo Reintentar/Cancelar.
- **Update:** Decidir si el modal se cierra en cuanto el usuario guarda (optimista) o solo tras éxito; en ambos casos, error → diálogo con Reintentar (misma llamada) y Cancelar (revert).

Cuando apruebes este plan (o ajustes de UX/contratos), se puede bajar al detalle de firma de callbacks y nombres de props en cada componente y proceder con la implementación.

---

## 11. Etapas de ejecución

Ejecutaremos el plan por etapas para no dañar el código actual.

### Etapa 1 — Optimista y diálogo de error en la vista contexto

- Implementar todo lo descrito en secciones 1–10 **solo en la vista** `/context/[projectId]/board` (ContextBoardClient + KanbanBoard + AddTaskModal + EditTaskModal).
- Crear `MutationErrorDialog`, levantar estado de `tasks` en ContextBoardClient, eliminar refresh en move/create/update y añadir Reintentar/Cancelar en error.
- **No tocar** `/project/[id]` ni `ProjectKanbanClient` en esta etapa.

### Etapa 2 — Redirigir vista antigua a contexto

- En `app/project/[id]/page.tsx`: en lugar de renderizar `ProjectKanbanClient`, hacer `redirect` a `/context/${id}/board`.
- Actualizar todos los enlaces que apuntan a `/project/[id]` para que apunten a `/context/[projectId]/board`: Sidebar, ProjectsPageClient, AnalyticsDashboard, IdeasPageClient, ClientDetailClient, BusinessDetailClient.
- Comprobar que nadie enlaza ya a `/project/[id]` con intención de ver el Kanban antiguo.

### Etapa 3 — Eliminar ruta y componentes de la vista antigua ✅ (hecho)

- `app/project/[id]/page.tsx` se mantiene solo con la redirección a `/context/[id]/board`.
- **Eliminados:** `components/ProjectKanbanClient.tsx` y `components/ProjectResourcesPanel.tsx`.
- Las referencias en documentación (auditorías, reportes) quedan como histórico; el plan y docs clave actualizados.

### Etapa 4 — Limpieza y revalidaciones (opcional) ✅ (hecho)

- **revalidatePath:** Eliminado `revalidatePath('/project')` y `revalidatePath(\`/project/${id}\`)` en `app/actions/tasks.ts`, `app/actions/projects.ts`, `app/notes/actions.ts`, `app/ideas/[id]/project-link-actions.ts`. Añadido `revalidatePath('/context')` en `createProject`; en el resto se mantiene o ya existía revalidación de `/context` o `\`/context/${projectId}\``.
- **Documentación:** Ya actualizada en Etapa 3 (RUTA_RECREACION_UI.md, context-navigation-design.md); la vista de proyecto es la de contexto.
