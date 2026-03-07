# Plan de implementación: Módulo Milestones

**Referencia de concepto:** [docs/milestones/README.md](README.md)  
**Fecha:** 2026-03-06  
**Estado:** Plan listo para ejecutar

---

## 1. Objetivo y alcance

Implementar el **módulo Milestones** dentro del contexto de proyecto para:

1. **Crear** milestones (manual y luego vía IA).
2. **Modificar** milestone (título, descripción, orden, estado).
3. **Ver** lista de milestones del proyecto.
4. **Ver progreso del proyecto** en una **timeline**: todas las milestones, dónde estamos y qué falta (tareas por milestone, completadas vs pendientes).

Todo el diseño (modelo, acciones, rutas y UI) debe quedar preparado para que la **IA (Copilot)** integre milestones en su flujo de sugerencias: proponer milestones, proponer tareas asociadas a milestones y reflejar el progreso en el contexto del proyecto.

---

## 2. User stories (resumen)

| ID  | Historia                      | Criterio de aceptación                                                                                                                                                                                                             |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Crear milestone               | Usuario crea una milestone con título (y opcional descripción/orden). Se persiste por proyecto.                                                                                                                                    |
| M2  | Modificar milestone           | Usuario edita título, descripción, orden o marca como completada. Cambios persisten.                                                                                                                                               |
| M3  | Ver milestones                | Usuario ve la lista de milestones del proyecto en orden (sort_order).                                                                                                                                                              |
| M4  | Timeline de progreso          | Usuario ve una vista tipo timeline con todas las milestones, indicador de “dónde estamos” (por ejemplo la primera no completada) y qué falta (tareas pendientes por milestone).                                                    |
| M5  | Asociar tareas a milestone    | Usuario puede asignar una tarea a una milestone (desde el board o desde la tarea). Al completar todas las tareas de una milestone, se puede marcar la milestone como completada (manual o automático, según decisión de producto). |
| M6  | IA integrada (fase posterior) | Copilot puede proponer milestones y tareas por milestone; al aprobar se crean milestones y tareas con `milestone_id`.                                                                                                              |

M1–M5 son parte de este plan; M6 se implementa en el plan de integración Copilot una vez exista el módulo.

---

## 3. Fases de implementación

### Fase 1 — Base de datos y tipos

**Objetivo:** Tabla `milestones`, columna `tasks.milestone_id`, RLS, índices y tipos en el cliente.

**Entregables:**

1. **Migración `YYYYMMDDHHMMSS_milestones.sql`:**
   - Tabla `public.milestones`:
     - `id` UUID PK, `project_id` UUID NOT NULL FK a `projects(id) ON DELETE CASCADE`
     - `title` TEXT NOT NULL
     - `description` TEXT
     - `sort_order` INTEGER NOT NULL DEFAULT 0
     - `status` TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed'))
     - `completed_at` TIMESTAMPTZ
     - `created_at`, `updated_at` TIMESTAMPTZ
   - Índices: `(project_id, sort_order)`, `(project_id)` para listados.
   - Trigger `updated_at`.
   - RLS: políticas SELECT/INSERT/UPDATE/DELETE vía `projects.owner_id` (mismo patrón que `tasks`).

2. **Migración `YYYYMMDDHHMMSS_tasks_milestone_id.sql`:**
   - `ALTER TABLE tasks ADD COLUMN milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;`
   - Índice `idx_tasks_milestone_id` para JOINs y “tareas por milestone”.
   - Sin cambio de RLS (ya se filtra por proyecto).

3. **Tipos:**
   - Regenerar o extender `lib/supabase/types.ts` con `milestones` y `tasks.milestone_id`.
   - Opcional: `lib/milestones/schema.ts` con tipos TypeScript exportados (Milestone, MilestoneStatus, etc.) para uso en acciones y UI.

**Criterio de salida:** Migraciones aplican sin error; tipos disponibles en el código.

---

### Fase 2 — Acciones de servidor (CRUD y consultas)

**Objetivo:** Todas las operaciones de milestones y la lectura de “progreso” (milestones + conteo de tareas) vía server actions, para uso de la UI y luego del Copilot.

**Archivo sugerido:** `app/actions/milestones.ts` (o `app/context/[projectId]/milestones/actions.ts` si se prefiere co-locar con la ruta).

**Acciones a implementar:**

| Acción                                                                         | Descripción                                                                                                     | Contrato (resumido)                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `listMilestones(projectId)`                                                    | Lista milestones del proyecto ordenadas por `sort_order`.                                                       | `Promise<Milestone[]>`; cacheable con `cache()` si es solo lectura.                   |
| `getMilestonesWithProgress(projectId)`                                         | Lista milestones con conteo de tareas (total, done) por milestone. Para timeline.                               | `Promise<MilestoneWithProgress[]>`; cada item: milestone + `tasksTotal`, `tasksDone`. |
| `createMilestone(projectId, { title, description?, sort_order? })`             | Crea milestone; `sort_order` por defecto = max+1.                                                               | `Promise<{ data?: Milestone, error?: string }>`; `revalidatePath` del proyecto.       |
| `updateMilestone(milestoneId, { title?, description?, sort_order?, status? })` | Actualiza campos; si `status === 'completed'` rellenar `completed_at`.                                          | `Promise<{ data?: Milestone, error?: string }>`; revalidate.                          |
| `deleteMilestone(milestoneId)`                                                 | Borra milestone; tareas con ese `milestone_id` pasan a `milestone_id = null` (o ON DELETE SET NULL ya lo hace). | `Promise<{ error?: string }>`; revalidate.                                            |
| `completeMilestone(milestoneId)`                                               | Pone `status = 'completed'`, `completed_at = now()`. Opcional: validar que todas las tareas estén `done`.       | Puede ser un caso de `updateMilestone(..., { status: 'completed' })`.                 |

**Reglas:**

- `requireAuth()` al inicio de cada acción.
- Scope por proyecto: en todas las mutaciones comprobar que la milestone pertenece a un proyecto cuyo `owner_id` es el usuario (o usar RLS y leer por `project_id` del layout).
- Select explícito (nunca `*`).
- Errores: `captureWithContext` en catch; devolver mensaje estable al cliente.

**Criterio de salida:** Acciones implementadas y probadas (manual o test); listado y creación/edición funcionan contra la BD.

---

### Fase 3 — Módulo en el registro y rutas

**Objetivo:** El tab “Milestones” existe en el contexto del proyecto y lleva a la vista del módulo.

**Cambios:**

1. **`lib/modules/registry.ts`:**
   - Añadir `'milestones'` al tipo `ModuleKey`.
   - Añadir entrada en `MODULE_REGISTRY`: `labelKey`, `descriptionKey`, `icon` (p. ej. `Flag` o `Target`), `defaultEnabled: false`, `lock: false`, `nav: { showInProjectTabs: true, slug: 'milestones', order: N }` (N según posición deseada entre tabs).

2. **`app/context/ContextDataCache.tsx`:**
   - Añadir clave de cache para milestones, p. ej. `{ type: 'milestones', projectId: string }` si se usa cache por proyecto para esta vista.

3. **Rutas:**
   - `app/context/[projectId]/milestones/page.tsx`: Server component con `requireAuth` y wrapper FromCache o cliente que cargue datos.
   - `app/context/[projectId]/milestones/ContextMilestonesFromCache.tsx`: Gestiona cache (si aplica) y carga inicial de milestones/progreso.
   - `app/context/[projectId]/milestones/ContextMilestonesClient.tsx`: UI (lista + timeline + formularios).

4. **i18n:** Añadir en `locales/en.json` y `locales/es.json` las claves del módulo (ej. `context.milestones`, `milestones.title`, `milestones.add`, `milestones.edit`, `milestones.timeline`, `milestones.progress`, etc.).

**Criterio de salida:** Con el módulo activado para un proyecto, el tab “Milestones” aparece y la página carga sin error (aunque la UI esté aún básica).

---

### Fase 4 — UI: lista, crear y editar

**Objetivo:** Ver milestones, crear una nueva y editar una existente.

**Componentes sugeridos:**

- **Lista de milestones:** En `ContextMilestonesClient`, mostrar tarjetas o filas por milestone (título, descripción truncada, estado, número de tareas si ya se expone). Orden según `sort_order` (drag-and-drop de orden puede ser fase posterior).
- **Crear:** Botón “Añadir milestone” que abre modal o formulario inline; campos título (obligatorio), descripción (opcional). Al enviar se llama `createMilestone` y se actualiza la lista (estado desde respuesta o invalidación de cache).
- **Editar:** Desde cada ítem, botón/acción “Editar” que abre modal o inline con título, descripción, y opcionalmente “Marcar como completada”. Se llama `updateMilestone` y se refresca la lista.

**Patrones:**

- No usar Supabase en el cliente; todo vía server actions.
- Manejo de errores con el patrón del proyecto (p. ej. mensaje estable, sin `alert()` en flujos críticos).
- Loading: skeleton/shimmer mientras carga la lista.

**Criterio de salida:** Usuario puede crear y editar milestones y ver la lista actualizada.

---

### Fase 5 — Vista timeline (progreso del proyecto)

**Objetivo:** Una vista tipo timeline donde se ven todas las milestones en orden, el estado actual del proyecto (“dónde estamos”) y qué falta.

**Diseño sugerido:**

- **Eje vertical u horizontal:** Cada milestone es un bloque (card o barra).
- **Por milestone:** Mostrar título, estado (pending / in_progress / completed), y progreso de tareas (ej. “3/5 tareas” o barra de progreso). Opcional: enlace a “Ver tareas” que filtre el board por esa milestone.
- **“Dónde estamos”:** Resaltar la primera milestone no completada (o la que tenga tareas en progreso). Texto tipo “Siguiente: [nombre milestone]” o indicador visual.
- **Qué falta:** Por cada milestone pendiente, resumen de tareas pendientes (número o lista corta).

**Datos:** Usar `getMilestonesWithProgress(projectId)` que devuelve milestones con `tasksTotal` y `tasksDone`. Calcular “completada” de la milestone por `status === 'completed'` o por regla “todas las tareas done” si se decide así.

**Criterio de salida:** El usuario ve la timeline con todas las milestones y entiende el progreso global y qué falta.

---

### Fase 6 — Asociar tareas a milestones

**Objetivo:** Poder asignar una tarea a una milestone desde la UI.

**Opciones (elegir al menos una):**

- **Desde el board:** En el modal de edición de tarea (o en la tarjeta), un selector “Milestone” (lista de milestones del proyecto). Al guardar se llama `updateTask(taskId, { milestone_id })`. Requiere exponer `updateTask` con soporte para `milestone_id` (o ya existente en `app/actions/tasks.ts`).
- **Desde la vista Milestones:** En la timeline o lista, “Añadir tarea a esta milestone” que lleve a crear tarea con `milestone_id` pre-rellenado (si el flujo de creación de tarea acepta milestone).

**Acciones:** Asegurar que `createTask` y `updateTask` en `app/actions/tasks.ts` acepten y persistan `milestone_id` (solo si la milestone pertenece al mismo proyecto). Comprobar RLS y ownership.

**Criterio de salida:** El usuario puede asignar y desasignar tareas a milestones; en la timeline el progreso (X/Y tareas) se actualiza correctamente.

---

### Fase 7 — Completar milestone (manual y/o automático)

**Objetivo:** Marcar una milestone como completada y, si se desea, permitir solo cuando todas las tareas estén `done`.

**Opciones:**

- **Solo manual:** Botón “Marcar como completada” en la milestone; al hacer clic se llama `updateMilestone(id, { status: 'completed' })` y se setea `completed_at`.
- **Con validación:** El mismo botón pero la acción comprueba que todas las tareas con `milestone_id = id` tengan `status = 'done'`; si no, devuelve error amigable (“Completa todas las tareas antes de cerrar la milestone”).
- **Automático (opcional):** Un trigger o job que, cuando la última tarea de una milestone pase a `done`, actualice la milestone a `completed`. Más complejo; se puede dejar para una iteración posterior.

**Criterio de salida:** Comportamiento definido e implementado; usuario ve el estado “completed” en la lista y en la timeline.

---

### Fase 8 — Preparación para IA (Copilot)

**Objetivo:** Dejar el módulo listo para que el Copilot integre milestones en su flujo (sin implementar aún el flujo en el Copilot).

**Checklist:**

- [ ] **API estable:** Todas las operaciones de milestones (crear, actualizar, listar, progreso) están en server actions con contratos claros (tipos TypeScript). El Copilot podrá llamar a “crear milestone” y “crear tarea con milestone_id” cuando se implemente la integración.
- [ ] **Contexto de proyecto:** Si el Copilot incluye en su contexto (system prompt) el estado del proyecto, añadir un resumen de milestones y progreso (por ejemplo “Milestones: Diseño 2/4, Desarrollo 0/6, Lanzamiento 0/3”) en una fase posterior del Copilot.
- [ ] **Documentación:** Este plan y `docs/milestones/README.md` describen el modelo y el flujo; el plan de integración Copilot (en `docs/project-copilot/` o aquí) referenciará estas acciones y tipos para proponer milestones y tareas asociadas.

No se implementa en esta fase el tipo de propuesta `milestone` en `copilot_proposals` ni el parser; eso corresponde al plan de integración Copilot con milestones.

**Criterio de salida:** Contratos documentados; cualquier desarrollador (o agente IA) puede ver qué acciones invocar para crear/actualizar milestones y tareas con milestone.

---

## 4. Resumen de archivos a tocar o crear

| Fase | Archivos                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `supabase/migrations/YYYYMMDDHHMMSS_milestones.sql`, `supabase/migrations/YYYYMMDDHHMMSS_tasks_milestone_id.sql`, `lib/supabase/types.ts`, opcional `lib/milestones/schema.ts`                                      |
| 2    | `app/actions/milestones.ts` (o `app/context/[projectId]/milestones/actions.ts`)                                                                                                                                     |
| 3    | `lib/modules/registry.ts`, `app/context/ContextDataCache.tsx`, `app/context/[projectId]/milestones/page.tsx`, `ContextMilestonesFromCache.tsx`, `ContextMilestonesClient.tsx`, `locales/en.json`, `locales/es.json` |
| 4    | Componentes en `app/context/[projectId]/milestones/` o `components/context/milestones/` (lista, formularios crear/editar), posible modal reutilizable                                                               |
| 5    | Vista timeline dentro de `ContextMilestonesClient` o componente `MilestoneTimeline.tsx`                                                                                                                             |
| 6    | `app/actions/tasks.ts` (soportar `milestone_id` en create/update), UI del board o de la tarea (selector de milestone)                                                                                               |
| 7    | Lógica en `updateMilestone` o acción `completeMilestone` con validación opcional                                                                                                                                    |
| 8    | Documentación (este plan + README); opcional: resumen de acciones para Copilot en `docs/project-copilot/` o `docs/milestones/README.md`                                                                             |

---

## 5. Orden recomendado y dependencias

```
Fase 1 (DB) → Fase 2 (acciones) → Fase 3 (módulo + rutas) → Fase 4 (UI CRUD)
     → Fase 5 (timeline) → Fase 6 (tareas ↔ milestone) → Fase 7 (completar) → Fase 8 (doc IA)
```

- Fase 6 puede empezar en paralelo a 4/5 una vez existan las acciones de tareas con `milestone_id`.
- Fase 8 es de cierre y no bloquea; la integración real del Copilot con propuestas `milestone` será un plan aparte que consumirá este módulo.

---

## 6. Riesgos y decisiones abiertas

- **Orden de milestones (drag-and-drop):** Si se quiere reordenar con DnD, hará falta una acción `reorderMilestones(projectId, orderedIds)` o `updateMilestone(id, { sort_order })` y actualizar la lista en la UI. Se puede dejar para una iteración posterior.
- **Completado automático:** Si se implementa “al completar todas las tareas se marca la milestone”, hay que definir si es un trigger en BD o una comprobación en el flujo de `updateTask` cuando una tarea pasa a `done`.
- **Módulo desactivado por defecto:** Se propone `defaultEnabled: false` para milestones (igual que Copilot), para que el usuario lo active explícitamente por proyecto.

---

Este plan cubre **crear**, **modificar**, **ver** milestones y **ver progreso en timeline**, y deja el módulo listo para que la **IA integre milestones** en su flujo de sugerencias en un siguiente paso.
