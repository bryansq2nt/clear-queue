# Project Copilot: Acceso completo a hitos (milestones) en el contexto

**Created:** 2026-03-06  
**Status:** Planning — no ejecutar todavía  
**Goal:** Dar al Copilot toda la información necesaria sobre los hitos para que pueda: saber cuántas tareas tiene cada hito (X/Y), identificar el hito "que tiene cero tareas", proponer asociaciones de tareas a hitos sin pedir IDs al usuario, y responder con precisión a preguntas como "asocia las tareas al hito que tiene cero tareas".

---

## 1. Problema actual

- En el **contexto estándar** el Copilot recibe la lista de hitos como `[id] title` (ej. `- [uuid] hito prueba`). **No** recibe cuántas tareas tiene cada hito ni qué tareas están asociadas.
- Por eso el Copilot responde cosas como: "No tengo visibilidad de cuántas tareas tiene cada milestone" o "Necesito ver los IDs de las tareas para hacer las asociaciones".
- El usuario tiene que indicar manualmente el ID del hito correcto o confirmar cuál es "el que tiene cero tareas".

---

## 2. Objetivo del plan

- Incluir en el **system prompt** (tanto en modo estándar como en full) la información de **progreso por hito**: para cada hito, `tasks_total` y `tasks_done` (formato X/Y tareas).
- Opcional pero recomendado en **full context**: para cada hito, listar los **ids (y títulos)** de las tareas asociadas, para que el Copilot pueda proponer `update_task` con `milestone_id` sin depender de que el usuario le pase IDs.
- Con esto el Copilot podrá:
  - Identificar "el hito que tiene 0 tareas" sin preguntar.
  - Proponer actualizaciones de tareas para asociarlas a un hito concreto usando los ids que ya ve en contexto.
  - Responder con precisión a "asocia las tareas al hito X" o "el hito que actualmente tiene cero tareas".

---

## 3. Cambios técnicos (resumen)

| Dónde                                              | Qué hacer                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **buildProjectContext** (`lib/copilot/context.ts`) | En lugar de (o además de) `listMilestones(projectId)`, usar **getMilestonesWithProgress(projectId)** para obtener hitos con `tasks_total` y `tasks_done`. En modo estándar y full, la sección de hitos debe incluir por cada hito: id, título y "X/Y tareas".                                                   |
| **Formato en el prompt**                           | Ejemplo: `- [id] title (3/5 tareas)` o `- [id] title — 3/5 tareas`. Si un hito tiene 0 tareas: `(0/2 tareas)` para que el modelo sepa cuál es "el que tiene cero tareas".                                                                                                                                       |
| **Full context (opcional)**                        | Si ya se incluyen tareas con `milestone_id` en full context, el modelo puede inferir qué tareas pertenecen a cada hito. Alternativamente, en la sección de hitos en full context, listar bajo cada hito los task ids (o id + title) de las tareas asociadas para no depender solo de la lista global de tareas. |

---

## 4. Implementación detallada (para cuando se ejecute)

### 4.1. Cambio de fuente de datos de hitos

- **Archivo:** `lib/copilot/context.ts`
- **Hoy:** Se llama `listMilestones(projectId)` y se obtienen filas con id, title, etc. (sin conteo de tareas).
- **Cambio:** Llamar **getMilestonesWithProgress(projectId)** en lugar de (o además de) listMilestones. Esa función ya existe en `app/actions/milestones.ts` y devuelve `MilestoneWithProgress[]` con `tasks_total` y `tasks_done`.
- **Import:** Asegurar que en `context.ts` se importe `getMilestonesWithProgress` desde `@/app/actions/milestones` (o la ruta correcta). Es una server action; buildProjectContext ya es async y se ejecuta en servidor, así que puede llamarla.

### 4.2. Formato de la sección "Project milestones" en el prompt

- **Estándar y full:** En lugar de solo `- [${m.id}] ${m.title}`, usar algo como:
  - `- [${m.id}] ${m.title} (${(m as MilestoneWithProgress).tasks_done ?? 0}/${(m as MilestoneWithProgress).tasks_total ?? 0} tareas)`
- Si `getMilestonesWithProgress` no está tipada en context, se puede usar tipo genérico o asegurar que el tipo de milestone en context incluya `tasks_total` y `tasks_done` (por ejemplo usando `MilestoneWithProgress` en el array).
- Texto de ayuda en el prompt: "Cada hito muestra X/Y tareas (completadas/total). Usa el id del hito para proponer update_task con milestone_id o para identificar el hito que tiene 0 tareas."

### 4.3. Full context: tareas por hito (opcional)

- En modo **full** ya se envían hasta 80 tareas con `milestone_id`. El modelo puede deducir qué tareas pertenecen a cada hito recorriendo la lista de tareas.
- Si se quiere ser más explícito, se puede añadir un bloque "Por hito, tareas asociadas" generado a partir de `tasks` agrupados por `milestone_id`, por ejemplo:
  - "Hito [id] title: tareas [id1] title1, [id2] title2, ..."
- Esto es opcional; con milestones con X/Y y la lista de tareas con milestone_id en full, suele ser suficiente.

### 4.4. Token budget

- Añadir 1–2 números por hito (X/Y) suma pocos tokens. No debería afectar el límite del system prompt.

---

## 5. Checklist de archivos (cuando se ejecute)

| Archivo                  | Cambio                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/copilot/context.ts` | Sustituir (o complementar) `listMilestones` por `getMilestonesWithProgress`. Construir la sección de hitos con id, título y "(tasks_done/tasks_total tareas)". Ajustar el texto de ayuda para el modelo (que use esta info para identificar hitos con 0 tareas y para proponer update_task con milestone_id). |

---

## 6. Criterios de éxito

- El Copilot recibe en contexto, para cada hito: id, título y número de tareas (X/Y).
- Puede responder correctamente a "¿cuál es el hito que tiene cero tareas?" sin pedir confirmación al usuario.
- Puede proponer `update_task` con `milestone_id` cuando tiene full context (con task ids y milestone ids), y en estándar al menos puede identificar hitos por id y explicar cuál tiene 0 tareas (las asociaciones masivas de tareas seguirán requiriendo full context si hace falta ver task ids).

---

## 7. Referencias

- `app/actions/milestones.ts`: `listMilestones`, `getMilestonesWithProgress`.
- `lib/copilot/context.ts`: `buildProjectContext`, sección "Project milestones", uso de `milestones` y `milestoneLines`.
- Tipo `MilestoneWithProgress` en `lib/milestones/schema.ts` (tasks_total, tasks_done).
