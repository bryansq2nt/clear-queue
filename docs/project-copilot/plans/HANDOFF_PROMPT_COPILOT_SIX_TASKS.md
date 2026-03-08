# Handoff: Plan único — seis tareas Copilot (bulk UX, delete status, orden creación, budgets, clientes, facturación)

**Creado:** 2026-03-07  
**Uso:** Copiar el contenido de este documento (o referenciarlo) en una sesión de Claude Code para que ejecute las seis tareas en el orden indicado. No generar código hasta que el agente lea este plan.

---

## Resumen ejecutivo

Seis tareas independientes pero relacionadas con el Copilot y los módulos del proyecto:

1. **Bulk Approve/Reject + Stop:** Al hacer "Aprobar todo" o "Rechazar todo", el otro botón debe convertirse en "Stop" para poder cancelar la operación en curso; no mostrar "Rechazando..." en ambos.
2. **Estado de propuestas de eliminación:** Cuando una propuesta de tipo delete (delete_task, delete_milestone, delete_note) está aprobada, la tarjeta debe mostrar "Eliminado" y una opción "Deshacer" (undo), no "Creado — ver en el tablero".
3. **Orden de creación: hitos antes que tareas:** Asegurar que al aprobar propuestas (en bloque o individual), los hitos se creen antes que las tareas para que los IDs existan al asociar tareas a hitos.
4. **Copilot acceso completo al módulo Budgets:** Incluir presupuestos en contexto, permitir proponer creación/edición (budgets, categorías, ítems, enlaces de producto, etc.) con aprobación del usuario.
5. **Copilot acceso completo al módulo Clientes (Owner/Responsable):** Incluir clientes y empresa en contexto, permitir agregar clientes, vincular responsable del proyecto, gestionar con lenguaje natural y aprobación.
6. **Copilot acceso completo al módulo Facturación:** Incluir facturación en contexto, permitir crear, leer, editar y eliminar registros (cargos, facturas) con aprobación del usuario.

A continuación se detalla cada tarea para que Claude Code las implemente en orden.

---

## Tarea 1 — Bulk Approve/Reject: botón Stop y estados correctos

### Problema actual

Cuando el usuario hace clic en "Aprobar todo", ambos botones pasan a mostrar "Aprobando..." y "Rechazando..." (o el equivalente en i18n). Eso es confuso: si el usuario aprobó todo, el botón de rechazar no debería decir "Rechazando...".

### Comportamiento deseado

- **Si el usuario hace clic en "Aprobar todo":**
  - El botón de aprobar todo muestra "Aprobando..." (o `copilot.approving_all`) y está deshabilitado.
  - El botón que antes era "Rechazar todo" se convierte en **"Stop"** (o "Detener"), activo, para que el usuario pueda cancelar la operación bulk de aprobación a mitad de camino.
- **Si el usuario hace clic en "Rechazar todo":**
  - El botón de rechazar todo muestra "Rechazando..." (o `copilot.rejecting_all`) y está deshabilitado.
  - El botón que antes era "Aprobar todo" se convierte en **"Stop"**, activo, para poder cancelar la operación bulk de rechazo.

### Implementación (guía para Claude Code)

- **Estado en el cliente:** Además de `bulkActionMessageId`, introducir un estado que indique **qué** acción bulk está en curso, por ejemplo `bulkActionType: 'approving' | 'rejecting' | null`. Cuando se inicia "Aprobar todo", setear `bulkActionMessageId` y `bulkActionType = 'approving'`; cuando se inicia "Rechazar todo", `bulkActionType = 'rejecting'`.
- **Renderizado de los dos botones:**
  - Cuando `bulkActionType === 'approving'`: primer botón = "Aprobando..." (disabled); segundo botón = "Stop" (enabled), que al hacer clic cancela el bulk (por ejemplo setear un ref o flag que el loop de approve compruebe para salir, o usar AbortController/patrón cancelación).
  - Cuando `bulkActionType === 'rejecting'`: primer botón = "Stop" (enabled); segundo botón = "Rechazando..." (disabled).
- **Cancelación del bulk:** En `handleApproveAll` / `handleRejectAll`, el loop que llama a `approveProposal` / `rejectProposal` debe poder ser interrumpido cuando el usuario pulse Stop (por ejemplo comprobar un ref `shouldAbortBulk.current` antes de cada iteración, y setearlo a `true` desde el handler del botón Stop). Al pulsar Stop, limpiar `bulkActionMessageId` y `bulkActionType`.
- **i18n:** Añadir claves como `copilot.stop` / "Stop" y "Detener" (en/es) para el botón Stop.
- **Archivos afectados (referencia):** `app/context/[projectId]/copilot/ContextCopilotClient.tsx` (handlers, estado bulk, lógica de cancelación), `components/context/copilot/CopilotChatWindow.tsx` (render de los dos botones según `bulkActionType` y botón Stop), `locales/en.json` y `locales/es.json`.

### Criterios de éxito

- Al hacer "Aprobar todo", solo el botón de aprobar muestra "Aprobando..."; el otro es "Stop" y permite detener.
- Al hacer "Rechazar todo", solo el botón de rechazar muestra "Rechazando..."; el otro es "Stop" y permite detener.
- Al pulsar Stop, la operación bulk se detiene y los botones vuelven a "Aprobar todo" / "Rechazar todo".

---

## Tarea 2 — Propuestas de eliminación: mostrar "Eliminado" y opción Deshacer

### Problema actual

Las tarjetas de propuestas de tipo **delete** (delete_task, delete_milestone, delete_note, y en el futuro delete_link, etc.) cuando están **aprobadas** muestran el mismo texto que las de creación: "Creado — ver en el tablero" (o "ver en hitos", "ver en notas"). El usuario interpreta que el elemento fue "creado" cuando en realidad fue **eliminado**.

### Comportamiento deseado

- Para propuestas con `type` delete (delete_task, delete_milestone, delete_note, delete_link, etc.) y `status === 'approved'`:
  - **No** mostrar "Creado — ver en el tablero" (ni enlace a la vista).
  - Mostrar texto tipo **"Eliminado"** (o equivalente i18n, p. ej. `copilot.deleted`).
  - Mostrar una opción **"Deshacer"** (o "Undo", `copilot.undo`) que permita al usuario revertir la eliminación si se arrepiente.

### Implementación (guía para Claude Code)

- **CopilotProposalCard / card-renderers:** Para tipos con `cardVariant === 'delete'` y `proposal.status === 'approved'`:
  - No usar `createdLink` / `viewLinkLabelKey` para mostrar "Creado — ver en...".
  - Mostrar un bloque con texto "Eliminado" y un botón o enlace "Deshacer".
- **Comportamiento de Deshacer:**
  - Hoy las entidades (task, note, milestone) se eliminan con **hard delete** en la base de datos. Para ofrecer "Deshacer" hay dos caminos posibles:
    - **Opción A (recomendada para MVP):** Deshacer solo dentro de una ventana corta (p. ej. 5–10 minutos): guardar en `copilot_proposals` o en una tabla auxiliar un snapshot del payload/estado antes de borrar (o el `entity_id` borrado + datos mínimos para recrear). El botón "Deshacer" llama a una acción que restaura o recrea esa entidad a partir del snapshot. Si no hay snapshot o la ventana expiró, el botón puede ocultarse o mostrarse deshabilitado con tooltip.
    - **Opción B:** Introducir **soft delete** en las tablas afectadas (tasks, notes, milestones) cuando la eliminación viene del Copilot, y "Deshacer" hace UPDATE que restaura la fila. Requiere migración y cambios en todas las lecturas para filtrar `deleted_at IS NULL`.
  - El plan deja que el implementador elija A o B según criterios del repo; lo mínimo es que la **UI** muestre "Eliminado" y el botón "Deshacer", y que la acción de Deshacer esté conectada a alguna lógica (aunque sea solo para delete_task al principio).
- **i18n:** Añadir `copilot.deleted` ("Deleted" / "Eliminado") y `copilot.undo` ("Undo" / "Deshacer").
- **Archivos afectados:** `components/context/copilot/CopilotProposalCard.tsx`, posiblemente `components/context/copilot/card-renderers/index.ts` (no reutilizar viewLinkLabelKey para deletes aprobados), `app/context/[projectId]/copilot/actions.ts` o nuevas acciones para restore/undo si se implementa Opción A o B, `locales`.

### Criterios de éxito

- Una propuesta delete\_\* aprobada muestra "Eliminado" y "Deshacer", nunca "Creado — ver en el tablero".
- Deshacer tiene un comportamiento definido (restaurar o recrear) documentado o implementado para al menos delete_task.

---

## Tarea 3 — Orden de creación: hitos antes que tareas

### Problema

Cuando el Copilot propone varios hitos y tareas en un mismo mensaje y el usuario aprueba todo (o aprueba en secuencia), si las tareas se procesan antes que los hitos, las tareas pueden llevar `milestone_id` o `milestone_title` que aún no existe en la base de datos, y la asociación falla o queda nula.

### Comportamiento deseado

- Al ejecutar aprobaciones (bulk o individual en la misma respuesta), **siempre** crear primero todos los hitos (proposals con `type === 'milestone'`) y **después** el resto (tareas, notas, etc.), de modo que cuando se procese una tarea con `milestone_id` o `milestone_title`, el hito ya exista.

### Implementación (guía para Claude Code)

- **Opción A — Cliente (recomendada para consistencia con UI):** En `handleApproveAll(messageId)`, al construir la lista de propuestas pendientes a aprobar, **ordenar** la lista de forma que todas las propuestas con `type === 'milestone'` vayan primero, y el resto después (p. ej. orden: milestone, task, note, luego el resto por tipo). Iterar en ese orden al llamar a `approveProposal(proposalId)`.
- **Opción B — Backend:** En el RPC `approve_copilot_proposal_atomic` no se puede reordenar otras propuestas; cada llamada es por una sola. La orden la controla el cliente. Si en el futuro hubiera un "approve all in one RPC", ese RPC debería procesar milestones antes que tasks.
- **Prompt / AI:** En `lib/copilot/context.ts` (o en el system prompt), añadir o reforzar la instrucción de que en el bloque `<<PROPOSALS>>` el modelo debe **emitir primero las propuestas de tipo milestone** y después las de tipo task (y otras), para que el orden natural del array sea el correcto cuando el usuario aprueba en secuencia o con "Aprobar todo".
- **Archivos afectados:** `app/context/[projectId]/copilot/ContextCopilotClient.tsx` (ordenación en handleApproveAll), `lib/copilot/context.ts` (instrucción de orden en el prompt).

### Criterios de éxito

- En un mensaje con N hitos y M tareas, al hacer "Aprobar todo", las N aprobaciones de tipo milestone se ejecutan antes que las M de tipo task.
- Las tareas que referencian milestone_id o milestone_title encuentran el hito ya creado y la asociación se persiste correctamente.

---

## Tarea 4 — Copilot: acceso completo al módulo Budgets

### Objetivo

El Copilot debe tener **acceso completo** al módulo de presupuestos (budgets) para poder, con lenguaje natural y con aprobación del usuario: crear/editar presupuestos, buscar o sugerir enlaces de producto, crear categorías, ítems, etc.

### Implementación (guía para Claude Code)

- **Contexto:** Incluir en `buildProjectContext` (en `lib/copilot/context.ts`) datos del módulo de presupuestos del proyecto: por ejemplo listado de budgets del proyecto, categorías, ítems (o resumen), según lo que expongan las acciones existentes en `app/actions/budgets.ts` y módulos relacionados. Añadir una sección en el system prompt tipo "Project budgets" con la información necesaria para que el modelo proponga acciones.
- **Tipos de propuesta:** Definir los tipos de propuesta necesarios para el módulo (p. ej. `budget`, `budget_category`, `budget_item`, o los que correspondan al esquema actual). Añadir payloads en `lib/copilot/schema.ts`, validación en `lib/copilot/parser.ts`, y ramas en `approveProposal` (y RPC si aplica) para ejecutar las mutaciones con aprobación.
- **Prompt:** Extender el bloque `<<PROPOSALS>>` del system prompt con ejemplos y reglas para crear/editar presupuestos, categorías, ítems; si aplica, enlaces de producto o referencias.
- **UI:** En `CopilotProposalCard` y `card-renderers` añadir los casos para los nuevos tipos de propuesta de budgets (icono, etiqueta, enlace "ver en" tras aprobar).
- **i18n:** Añadir claves bajo `copilot.*` para las nuevas etiquetas y mensajes.
- **Referencias:** Revisar `app/actions/budgets.ts`, rutas de contexto de presupuestos (p. ej. `app/context/[projectId]/budgets/`), esquema de tablas `budgets`, categorías e ítems en migraciones. Seguir el mismo patrón que para tasks, notes, milestones (contexto + proposal types + approve flow + UI).

### Criterios de éxito

- El Copilot recibe en su contexto información de presupuestos del proyecto.
- El usuario puede pedir en lenguaje natural cosas como crear un presupuesto, una categoría, ítems, o enlaces de producto, y el Copilot propone acciones que el usuario puede aprobar o rechazar.
- Las propuestas aprobadas se persisten correctamente en el módulo de budgets.

---

## Tarea 5 — Copilot: acceso completo al módulo Clientes (Owner / Responsable del proyecto)

### Objetivo

El Copilot debe tener **acceso completo** al módulo de clientes (y responsable del proyecto) para, con lenguaje natural y aprobación del usuario: agregar nuevos clientes, vincular o cambiar el responsable del proyecto, gestionar empresa (business) vinculada, etc.

### Implementación (guía para Claude Code)

- **Contexto:** Incluir en `buildProjectContext` datos relevantes del "owner" del proyecto y del módulo de clientes: por ejemplo cliente y empresa vinculados al proyecto actual (si existen), y opcionalmente lista de clientes disponibles o recientes (según permisos y privacidad). La sección "Responsable del proyecto" (Owner) en la app muestra cliente y empresa; el Copilot debe poder leer y proponer cambios.
- **Acciones existentes:** Revisar `app/actions/clients.ts` (y acciones que vinculan proyecto a cliente/empresa, p. ej. en `app/actions/projects.ts`) para crear/actualizar clientes, empresas, y asignar responsable del proyecto.
- **Tipos de propuesta:** Definir tipos como `client` (crear cliente), `link_project_client` o `set_project_owner` (vincular responsable), `business` (crear empresa), etc., según el modelo de datos actual. Añadir payloads, parser, ramas en approve y UI.
- **Prompt:** Añadir sección "Project owner / Clients" en el contexto y reglas en `<<PROPOSALS>>` para proponer creación de clientes, vinculación de responsable, creación/vinculación de empresa.
- **UI e i18n:** Tarjetas de propuesta y claves de traducción para los nuevos tipos.
- **Archivos de referencia:** `app/context/[projectId]/owner/`, `app/actions/clients.ts`, `app/actions/projects.ts`, tablas clients, businesses, y la relación project ↔ client/business.

### Criterios de éxito

- El Copilot conoce el cliente y empresa vinculados al proyecto (y datos necesarios para proponer cambios).
- El usuario puede pedir en lenguaje natural "agregar cliente X", "asignar como responsable del proyecto a Y", etc., y el Copilot propone acciones aprobables que se persisten correctamente.

---

## Tarea 6 — Copilot: acceso completo al módulo Facturación

### Objetivo

El Copilot debe tener **acceso completo** al módulo de facturación (Billing) para, con aprobación del usuario: **crear, leer, editar y eliminar** registros (cargos, facturas, estados, etc.) usando lenguaje natural.

### Implementación (guía para Claude Code)

- **Contexto:** Incluir en `buildProjectContext` datos del módulo de facturación del proyecto: por ejemplo cargos (charges), facturas, estados (pendiente/pagado), totales (según lo que exista en la app). Revisar rutas como `app/context/[projectId]/billings/` y acciones relacionadas con facturación.
- **Tipos de propuesta:** Definir tipos para crear cargo (`charge` o similar), editar cargo (update_charge), eliminar cargo (delete_charge), y si aplica actualizar estado (p. ej. marcar como pagado). Añadir payloads en schema, validación en parser, ramas en approve (y RPC o server actions que llamen a la capa de facturación existente).
- **Prompt:** Añadir sección "Billing / Facturación" en el contexto y ejemplos en `<<PROPOSALS>>` para crear/editar/eliminar cargos y cambiar estados.
- **UI e i18n:** Tarjetas para cada tipo de propuesta de facturación y claves bajo `copilot.*`.
- **Seguridad y scope:** Todas las mutaciones deben estar scoped por proyecto y por usuario (owner_id / auth), y requerir aprobación explícita; el Copilot solo propone, no ejecuta sin aprobar.

### Criterios de éxito

- El Copilot recibe información de facturación del proyecto (cargos, estados, totales).
- El usuario puede pedir crear un cargo, editar monto o estado, o eliminar un registro, y el Copilot propone acciones que el usuario aprueba o rechaza.
- Las aprobaciones se traducen en creates/updates/deletes correctos en el módulo de facturación.

---

## Orden de ejecución recomendado

1. **Tarea 1** (Bulk Stop y estados) — solo UX en Copilot, sin nuevos módulos.
2. **Tarea 2** (Eliminado + Deshacer) — UX y opcionalmente lógica de restore.
3. **Tarea 3** (Orden hitos antes que tareas) — cliente + prompt.
4. **Tareas 4, 5 y 6** pueden implementarse en paralelo o en secuencia (4 → 5 → 6); cada una añade un módulo completo al contexto y a las propuestas.

---

## Reglas transversales (recordatorio para Claude Code)

- Seguir **AGENTS.md**, **CONVENTIONS.md** y **.cursorrules**; leer `docs/patterns/` según el tipo de cambio (server-actions, database-queries, data-loading, context-session-cache).
- Server actions: `'use server'`, `requireAuth()` primero, `revalidatePath` tras mutaciones, nombres verb-first sin sufijo "Action".
- No usar `createClient()` de `@/lib/supabase/client` en componentes ni en `*Client.tsx`.
- Operaciones multi-paso que deban ser atómicas: RPC con sufijo `_atomic` en Postgres.
- i18n: todas las cadenas nuevas bajo `copilot.*` en `locales/en.json` y `locales/es.json`.
- Tras editar: `npx prettier --write` en archivos tocados y corregir lint.

---

## Referencias rápidas

| Tema             | Archivos / ubicación                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| Bulk approve     | `ContextCopilotClient.tsx` (handleApproveAll, handleRejectAll), `CopilotChatWindow.tsx` |
| Proposal cards   | `CopilotProposalCard.tsx`, `card-renderers/index.ts`                                    |
| Contexto Copilot | `lib/copilot/context.ts` (buildProjectContext)                                          |
| Parser / schema  | `lib/copilot/parser.ts`, `lib/copilot/schema.ts`                                        |
| Approve flow     | `app/context/[projectId]/copilot/actions.ts`, RPC approve_copilot_proposal_atomic       |
| Budgets          | `app/actions/budgets.ts`, rutas context budgets                                         |
| Clientes / Owner | `app/actions/clients.ts`, `app/context/[projectId]/owner/`                              |
| Facturación      | Rutas billings, acciones de cargos/facturas                                             |
