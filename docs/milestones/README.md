# Milestones: concepto, modelo e integración con IA

**Objetivo:** Definir qué son las milestones en ClearQueue, cómo se cumplen y cómo la IA (Copilot) puede ayudar a crear proyectos por etapas con milestones y tareas asociadas.

---

## 1. Qué son las milestones

Las **milestones** (hitos) son **metas u objetivos** de un proyecto que representan **etapas o fases** del mismo. Ejemplos:

- "Etapa de diseño"
- "Desarrollo del MVP"
- "Pruebas y QA"
- "Lanzamiento"

No son tareas sueltas: son **contenedores de progreso** que se consideran alcanzados cuando se cumple una condición (por ejemplo, terminar todas las tareas asociadas).

---

## 2. Cómo se cumplen las milestones

Una milestone se cumple cuando:

- **Se alcanzan ciertos objetivos**, o
- **Se terminan todas las tareas** asociadas a esa milestone.

**Ejemplo:** Si definimos la milestone "Etapa de diseño" y le asignamos 4 tareas (por ejemplo: "Wireframes", "Diseño visual", "Prototipo", "Revisión con cliente"), la milestone "Etapa de diseño" se considera alcanzada cuando **las 4 tareas están en estado terminado (done)**.

En resumen:

- A cada **milestone** se le **asocian tareas**.
- Cuando **todas las tareas** de esa milestone están **completadas**, se puede **marcar la milestone como completada** (manual o automáticamente, según el diseño final).

---

## 3. Quién puede crear milestones

- **Manual:** El usuario crea milestones desde la UI del proyecto (lista o vista de milestones).
- **IA (Copilot):** Al planificar un proyecto, la IA puede proponer milestones (y tareas por milestone) que el usuario revisa y aprueba.

Ambos flujos deben poder coexistir: el usuario puede crear hitos a mano y, además, aceptar propuestas de milestones y tareas generadas por el Copilot.

---

## 4. Uso en la planificación de proyectos

Cuando se **planifica un proyecto** (desde cero o reordenando):

1. Se pueden **definir las etapas** (milestones) del proyecto.
2. A cada etapa se le **asignan tareas** concretas.
3. El avance del proyecto se entiende por **cuántas milestones están completadas** y cuántas tareas de cada milestone faltan.

Así, el proyecto queda estructurado por **etapas claras** (milestones) y **tareas** que pertenecen a cada etapa. Esto facilita el manejo del proyecto y la comunicación con el equipo o el cliente.

---

## 5. Modelo de datos previsto (para implementación)

Para soportar lo anterior hace falta:

### 5.1 Tabla `milestones`

- **Alcance:** Por proyecto (`project_id`), con dueño implícito vía proyecto.
- **Campos sugeridos:**
  - `id` (UUID, PK)
  - `project_id` (FK a `projects`)
  - `title` (nombre de la etapa / meta)
  - `description` (opcional)
  - `sort_order` o `position` (orden dentro del proyecto)
  - `status`: p. ej. `pending` | `in_progress` | `completed`
  - `completed_at` (timestamptz, nullable; se rellena al completar)
  - `created_at`, `updated_at`
- **RLS:** Mismo criterio que el resto del proyecto: acceso según `projects.owner_id`.

### 5.2 Relación tareas ↔ milestones

- En la tabla **`tasks`** añadir una columna opcional:
  - **`milestone_id`** (UUID, nullable, FK a `milestones`).
- Una tarea puede:
  - No estar asociada a ninguna milestone (`milestone_id` null), o
  - Estar asociada a una milestone concreta.

### 5.3 Completar una milestone

- **Opción A (automática):** Cuando todas las tareas con `milestone_id = X` tienen `status = 'done'`, el sistema puede marcar la milestone como `completed` y rellenar `completed_at`.
- **Opción B (manual):** El usuario marca la milestone como completada en la UI (y opcionalmente el sistema solo lo permite si todas las tareas están `done`, o se permite “cerrar” igual).
- La decisión A vs B es de producto; el modelo de datos sirve para ambos.

---

## 6. Integración con el Copilot (IA)

Para que el **módulo de IA (Copilot)** ayude a configurar milestones:

### 6.1 Prerrequisitos

1. **Tabla `milestones`** creada (migración), con RLS e índices.
2. **Columna `tasks.milestone_id`** (migración) para asociar tareas a milestones.
3. **Acciones de servidor** (y si aplica RPC atómicos) para:
   - Crear/actualizar/archivar milestones.
   - Crear/actualizar tareas con `milestone_id`.
4. **UI básica** de milestones en el proyecto (lista/vista y, si aplica, asignar tareas a milestone desde el board o desde la tarea).

### 6.2 Cambios en el Copilot

- **Nuevo tipo de propuesta:** `milestone` además de `task` y `note`.
  - En `copilot_proposals`: ampliar `type` para aceptar `'milestone'`.
  - Payload de milestone: al menos `title`, opcional `description`, opcional `sort_order`.
- **Propuestas de tareas con milestone:** En las propuestas de tipo `task`, incluir opcionalmente `milestone_title` o `milestone_id` (referencia a una milestone propuesta o ya existente) para que, al aprobar, la tarea se cree ya asociada a esa milestone.
- **Prompt del Copilot:** Instruir al modelo para que, al planificar un proyecto desde cero (o por etapas), pueda:
  - Proponer primero milestones (etapas), y luego
  - Proponer tareas agrupadas por milestone.
- **Flujo de aprobación:** Igual que con tareas y notas: el usuario ve propuestas de milestones y de tareas, aprueba o rechaza; al aprobar una milestone se crea la fila en `milestones`; al aprobar una tarea con milestone se crea en `tasks` con `milestone_id` correspondiente.

Con esto, la IA puede ayudar a **crear un proyecto desde cero por etapas concretas (milestones)** y asignar tareas a cada etapa, lo que mejora el manejo del proyecto.

---

## 7. Resumen de pasos para implementar

| Orden | Qué hacer                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Redactar migración(es): tabla `milestones` (con RLS, índices, trigger `updated_at`) y columna `tasks.milestone_id`.                            |
| 2     | Tipos y acciones: actualizar `lib/supabase/types.ts`, acciones (crear/actualizar milestone, listar por proyecto, completar milestone).         |
| 3     | UI: vista/lista de milestones del proyecto y forma de asociar tareas a una milestone (board o formulario de tarea).                            |
| 4     | Copilot: ampliar contrato (tipo `milestone`, payload), parser, validación y flujo de aprobación; actualizar prompt para planificar por etapas. |

Este documento sirve como referencia de **concepto y modelo**; los detalles de implementación (nombres exactos de columnas, enums, RPC) se definen en el plan de implementación: **[docs/milestones/implementation-plan.md](implementation-plan.md)**.
