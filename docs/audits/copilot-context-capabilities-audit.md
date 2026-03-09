# Auditoría: Capacidades de contexto del Copilot

**Fecha:** 2026-03-08  
**Motivo:** El Copilot no recibe los IDs necesarios (presupuestos, categorías, ítems) para proponer categorías e ítems tras crear un budget. El usuario no ve ninguna “solicitud de contexto” que aprobar y el modelo pide en lenguaje natural “contexto completo” o “refrescar contexto”.  
**Principio reclamado:** El modelo no debe pedir permiso para _leer_ contexto; solo las _acciones_ (crear/editar/eliminar) requieren aprobación del usuario.

---

## 1. Hallazgos

### 1.1 El cliente siempre envía contexto “standard” en la primera petición

**Dónde:** `app/context/[projectId]/copilot/ContextCopilotClient.tsx`

- En `handleSubmit`, al enviar cada mensaje del usuario se llama:
  ```ts
  const fullText = await streamChatRequest(contextMessages, 'standard');
  ```
- Es decir, **todas** las peticiones al API de chat usan `contextScope: 'standard'` por defecto.

**Efecto:** El API route recibe `body.contextScope === 'full' ? 'full' : 'standard'`, así que casi siempre se construye el prompt con **scope `standard`**. En ese modo, `buildProjectContext(projectId, { scope: 'standard' })` hace que:

- **Tasks:** solo ~10 tareas recientes, **sin IDs** (no se pueden proponer update_task/delete_task).
- **Notes:** solo ~5 notas recientes, **sin IDs** (no update_note/delete_note).
- **Budgets:** `fetchBudgetsContext(projectId, 'standard', supabase)` devuelve solo resumen por budget (nombre y totales), **sin IDs de budgets, categorías ni ítems**.
- **Billings, links, todos, etc.:** igual, en scope standard no se incluyen IDs en el texto de contexto.

Por tanto, el modelo **nunca** ve los UUID de budgets/categorías/ítems en la primera respuesta ni en las siguientes, salvo que el usuario haga algo explícito para pasar a “full”.

### 1.2 “Full context” solo se usa al hacer “Reintentar con contexto completo”

**Dónde:** mismo cliente

- La única llamada con `contextScope: 'full'` es en `handleRetryWithFullContext()`.
- Esa función solo se invoca cuando el usuario hace clic en el botón **“Cargar contexto completo y responder de nuevo”** (o equivalente i18n).

**Dónde aparece el botón:** `components/context/copilot/CopilotChatWindow.tsx`

- Se muestra un banner con ese botón **solo** cuando:
  - El mensaje del asistente es el que tiene `contextRequestMessageId === msg.id`, y
  - `contextRequestMessageId` se establece cuando, tras guardar la respuesta del asistente, `parseContextRequest(fullText)` devuelve distinto de `null`.

**Conclusión:** El usuario solo puede “dar contexto completo” si hace clic en ese botón, y el botón solo aparece si el asistente emitió un bloque `<<REQUEST_CONTEXT>>` parseable.

### 1.3 REQUEST_CONTEXT solo cubre tasks y notes

**Dónde:** `lib/copilot/parser.ts` → `parseContextRequest()`

- Solo se aceptan y devuelven `tasks` y `notes`:
  ```ts
  const result: { tasks?: boolean; notes?: boolean } = {};
  if (parsed.tasks === true) result.tasks = true;
  if (parsed.notes === true) result.notes = true;
  return Object.keys(result).length > 0 ? result : null;
  ```
- No existe `budgets`, `billings`, `links`, etc. en el protocolo.

**Dónde:** `lib/copilot/context.ts` (bloque de prompt en scope standard)

- Las instrucciones que ven el modelo en modo standard dicen:
  - “Task ids are NOT available in standard mode…”
  - “Emit exactly this block at the END of your response so the user can grant full access: <<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>>”
  - O con `{"tasks":true,"notes":true}` para notas.
- **No** se menciona en el prompt que pueda (o deba) pedir “contexto completo” para budgets, facturación, enlaces, etc. Por tanto, el modelo no tiene instrucción de emitir REQUEST_CONTEXT para presupuestos.

**Consecuencia:** En flujos de budgets (crear budget → luego categorías → luego ítems), el modelo no emite ningún `<<REQUEST_CONTEXT>>` que el parser reconozca para budgets. Aunque el modelo diga en prosa “necesito el contexto completo” o “refresca el contexto”, el cliente nunca parsea una “solicitud de contexto” para eso, así que **nunca se muestra el banner** y el usuario no ve “la solicitud de contexto” del Copilot. Coincide con “no veo tu solicitud de contexto”.

### 1.4 Diseño actual: contexto como algo que el usuario “aprueba”

- Hoy el flujo es: modelo con contexto limitado → si necesita más (solo tasks/notes), emite REQUEST_CONTEXT → el usuario debe hacer clic en “Cargar contexto completo y responder de nuevo” → se reenvía la última pregunta con `contextScope: 'full'`.
- Eso implica tratar el **acceso a más contexto** como algo que el usuario debe autorizar (un segundo paso). El usuario indica que ese no debería ser el caso: el modelo no debería pedir permiso para _usar_ contexto; el permiso debe ser solo para _acciones_ (aprobar/rechazar propuestas que escriben en base de datos).

---

## 2. Resumen del problema

| Aspecto              | Estado actual                                                                   | Problema                                                                                      |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Scope por defecto    | Siempre `standard` en cada envío                                                | El modelo no recibe IDs (budgets, categorías, ítems, etc.).                                   |
| Cuándo se usa `full` | Solo si el usuario hace clic en “Cargar contexto completo y responder de nuevo” | Un solo paso extra y poco visible; no aplica a budgets.                                       |
| REQUEST_CONTEXT      | Solo `tasks` y `notes`; prompt solo instruye para tasks/notes                   | No hay mecanismo ni instrucción para “pedir contexto” de budgets; el usuario no ve solicitud. |
| Principio            | Contexto tratado como algo a “aprobar”                                          | Debería ser: contexto siempre disponible; aprobación solo para acciones.                      |

---

## 3. Conclusión de la auditoría

- **Causa raíz:** Por defecto se usa contexto **standard** (sin IDs) y “full” solo en un reintento explícito. El protocolo REQUEST_CONTEXT es solo para tasks/notes y no está pensado (ni documentado en el prompt) para budgets; por eso el usuario no ve ninguna solicitud de contexto en el flujo de presupuestos.
- **Alineación con el principio:** Para alinearse con “el modelo no pide permiso para usar contexto; solo se aprueban acciones”, el sistema debe dar al modelo **siempre** el contexto necesario (por ejemplo, scope `full` por defecto), sin depender de que el usuario “apruebe” o “refresque” contexto. La aprobación debe limitarse a las **propuestas** (crear/editar/eliminar).

---

## 4. Referencias de código

| Qué                             | Dónde                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Envío de mensaje (scope)        | `ContextCopilotClient.tsx` → `handleSubmit` → `streamChatRequest(contextMessages, 'standard')`                    |
| Reintento con full              | `ContextCopilotClient.tsx` → `handleRetryWithFullContext` → `streamChatRequest(contextMessages, 'full')`          |
| API usa scope del body          | `app/api/copilot/[projectId]/chat/route.ts` → `contextScope = body.contextScope === 'full' ? 'full' : 'standard'` |
| Construcción del prompt         | `app/api/copilot/[projectId]/chat/route.ts` → `buildProjectContext(projectId, { scope: contextScope })`           |
| Bloque REQUEST_CONTEXT (prompt) | `lib/copilot/context.ts` (scope === 'standard') → requestContextBlock                                             |
| Parser REQUEST_CONTEXT          | `lib/copilot/parser.ts` → parseContextRequest (solo tasks, notes)                                                 |
| Banner y botón “full context”   | `CopilotChatWindow.tsx` (contextRequestMessageId, onRetryWithFullContext)                                         |
| Contexto de budgets por scope   | `lib/copilot/registry/modules/budgets.ts` → fetchBudgetsContext(projectId, scope, supabase)                       |
