# Auditoría de Arquitectura de Software y Patrones de Diseño (2026-02-15)

## Alcance
- Carpetas auditadas: `app/actions/`, `app/**/actions.ts`, `lib/` (foco en tipado estricto, atomicidad RPC y deuda de UX/arquitectura).
- Objetivo: detectar desviaciones del patrón nuevo (RPC atómicas + tipado derivado de `Database`) y proponer un template CRUD estándar.

---

## 1) Análisis de consistencia (tipado estricto + atomicidad)

## Hallazgos críticos

### A. Uso de `any` en Server Actions de dominio core
- `app/actions/projects.ts` contiene múltiples casts a `any` en `insert`, `update`, queries intermedias y payloads de favoritos.
- Impacto:
  - Se pierde seguridad de tipos derivada de `Database`.
  - Se ocultan errores de shape en compile-time.

**Recomendación**
1. Reemplazar `any` por tipos explícitos:
   - `Database['public']['Tables']['projects']['Insert' | 'Update' | 'Row']`
   - `Database['public']['Tables']['project_favorites']['Insert']`
2. Estandarizar `ActionResult<T>` estricto con `data | error` discriminado.

### B. `any` y casts débiles en helper crítico de TODOs
- `lib/todo/lists.ts` usa `any` en operaciones `insert`/`update` para `todo_lists` y `todo_items`.
- Impacto:
  - El helper base que comparten varias acciones no garantiza contratos de tipos.

**Recomendación**
1. Tipar `insertData`/`updateData` con `Insert` y `Update` derivados de `Database` (ya parcial, pero eliminar `as any`).
2. Eliminar variables `query: any` y resolver sobrecargas de Supabase con utilidades typed (p. ej. helper interno `typedUpdate<Table>()`).

### C. Atomicidad incompleta en operaciones read-modify-write
Se detectan secuencias de varios pasos sin RPC transaccional:

1. `createTask` en `app/actions/tasks.ts`
   - Paso 1: lee máximo `order_index`.
   - Paso 2: inserta tarea con `order_index = max + 1`.
   - Riesgo de carrera en alta concurrencia (dos inserciones con mismo índice lógico).

2. `createTodoList` y `createTodoItem` en `lib/todo/lists.ts`
   - Patrón idéntico: consulta max `position` y luego inserta.
   - Riesgo de duplicados/solapamiento de posición bajo concurrencia.

3. `toggleTodoItem` en `lib/todo/lists.ts`
   - Paso 1: lee `is_done` actual.
   - Paso 2: hace `update` con negación calculada en app.
   - Riesgo de lost update (dos toggles simultáneos).

**Recomendación**
- Migrar estas rutas a RPC atómicas:
  - `create_task_atomic(project_id, title, status, priority, due_date, notes)`
  - `create_todo_list_atomic(owner_id, title, ...)`
  - `create_todo_item_atomic(owner_id, list_id, content, due_date)`
  - `toggle_todo_item_atomic(item_id, owner_id)`
- Mantener en Server Action solo validación + autorización + `revalidatePath`.

### D. Inconsistencia en patrón de errores
- Algunas acciones retornan `{ error }`, otras lanzan `throw`, y otras mezclan ambos.
- Resultado: clientes heterogéneos y ramas de UI duplicadas.

**Recomendación**
- Adoptar una convención única:
  - Capa `lib/*`: puede lanzar errores de dominio.
  - Capa `app/**/actions.ts`: nunca lanza, siempre serializa a `ActionResult<T>`.

---

## 2) Propuesta de template CRUD estándar

## Objetivo del template
- Reducir drift arquitectónico.
- Reusar tipado de `Database`.
- Homogeneizar UX de error y revalidación.

## A. Contratos comunes

```ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'VALIDATION' | 'AUTH' | 'CONFLICT' | 'DB' };
```

## B. `actions.ts` estándar (server)
1. `requireAuth()` al inicio.
2. Validación de input (idealmente con `zod`).
3. Llamado a helper o RPC atómica (sin lógica de merge en cliente).
4. `revalidatePath()` solo para rutas realmente afectadas.
5. Retorno `ActionResult<T>` consistente.

## C. Tipado derivado de `Database`
- Para cada entidad:
  - `Row = Database['public']['Tables']['<table>']['Row']`
  - `Insert = Database['public']['Tables']['<table>']['Insert']`
  - `Update = Database['public']['Tables']['<table>']['Update']`
- Evitar:
  - `as any`
  - `query: any`
  - `@ts-ignore` salvo deuda documentada con ticket.

## D. Estrategia `revalidatePath` eficiente
- Regla: invalidar solo vistas que consumen el recurso mutado.
- Ejemplo TODO item:
  - `revalidatePath('/todo')`
  - `revalidatePath('/todo/list/[listId]', 'page')`
  - `revalidatePath('/todo/project/[projectId]', 'page')` (si aplica)
- Evitar invalidaciones globales de dashboard salvo dependencia real.

## E. Template de cliente (mutación)
- Patrón recomendado:
  1. `useTransition` para estado pendiente no bloqueante.
  2. Optimistic update en estado local.
  3. Si falla: rollback + toast.
  4. Si éxito: reconciliar con `result.data`.
  5. `router.refresh()` opcional (solo cuando haga falta sincronizar RSC complejas).

---

## 3) Auditoría de UX fluida (bloqueos y Optimistic UI)

## Prioridad alta

### 1) Checkboxes de TODO
- Componentes:
  - `components/todo/TodoItemRow.tsx`
  - `app/todo/list/[listId]/ListBoardClient.tsx`
  - `app/todo/project/[projectId]/ProjectBoardClient.tsx`
- Estado actual:
  - Esperan al servidor para confirmar toggle (o actualizan tardíamente) y luego hacen `router.refresh()` en varios casos.
- Mejora:
  - Optimistic toggle inmediato (`is_done = !is_done`) + rollback si error.
  - Reemplazar `alert()` por sistema de toast unificado.

### 2) Reordenamiento Kanban
- Componente: `components/KanbanBoard.tsx`.
- Estado actual:
  - Ya existe optimistic reorder local (bien), pero el cálculo de reordenamiento vive en cliente y luego se llama acción.
- Mejora:
  - Mantener feedback visual inmediato.
  - Mover el cálculo canónico final al backend (RPC) para evitar divergencia con concurrencia multiusuario.
  - El cliente debería enviar intención (`taskId`, destino, índice objetivo aproximado), no el algoritmo completo.

## Prioridad media

### 3) Refreshes agresivos tras cada mutación
- Varios clientes invocan `router.refresh()` después de actualizar estado local.
- Efecto: parpadeo/re-render extra y sensación de latencia.
- Mejora:
  - Mantener optimistic state como source of truth temporal.
  - `router.refresh()` solo en eventos de navegación o reconciliación periódica.

---

## 4) Detección de deuda técnica (lógica de negocio en React)

## Hallazgos

### A. Lógica de reordenamiento de tareas en UI
- `components/KanbanBoard.tsx` contiene reglas de negocio para recalcular índices y columnas.
- Riesgo: duplicación de reglas, difícil testeo, inconsistencias con backend.

**Mover a**
- RPC/Helper servidor (`lib/tasks/reorder.ts` + `rpc_reorder_tasks`) como fuente canónica.

### B. Agregaciones de dominio en acciones tipo “BFF” sin RPC
- `app/todo/actions.ts` hace composición manual de listas/items/proyectos con reducciones y joins en memoria.
- Riesgo: crecimiento de complejidad y costo O(n) en servidor por request.

**Mover a**
- View/RPC de lectura optimizada (`get_project_todo_summary`) con payload ya agregado.

### C. Componentes con responsabilidad de orquestación de datos + UI
- `ListBoardClient` y `ProjectBoardClient` mezclan lógica de negocio (creación/toggle/update/delete + sincronización) con rendering.

**Mover a**
- Hooks de dominio (`useTodoListBoard`, `useProjectTodoBoard`) que encapsulen optimistic updates, rollback y errores.

---

## 5) Backlog de remediación priorizado

## Sprint 1 (impacto alto / bajo riesgo)
1. Eliminar `any` de `app/actions/projects.ts`.
2. Eliminar `any` de `lib/todo/lists.ts`.
3. Unificar `ActionResult<T>` + manejo de errores + toasts.

## Sprint 2 (consistencia concurrente)
1. RPC atómica para `toggleTodoItem`.
2. RPC atómica para creación con `position/order_index` en Tasks y Todo.
3. Reducir `router.refresh()` post-mutations.

## Sprint 3 (arquitectura de dominio)
1. Extraer lógica de reorder Kanban a backend canónico.
2. Introducir hooks de dominio en boards TODO.
3. RPC/view para agregaciones de dashboard TODO.

---

## 6) Riesgos si no se actúa
- Errores de tipos ocultos en runtime por uso de `any`.
- Condiciones de carrera en ordenamientos/posiciones.
- UX menos fluida por bloqueos y refresh redundante.
- Mayor costo de mantenimiento por reglas de negocio dispersas en UI.
