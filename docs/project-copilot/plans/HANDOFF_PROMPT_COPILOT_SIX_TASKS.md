# Handoff: Plan único — tareas Copilot + módulo Facturación

**Creado:** 2026-03-07  
**Actualizado:** 2026-03-08 (Tareas 7 y 8 Copilot; Tareas Facturación 1–5)  
**Uso:** Copiar el contenido de este documento (o referenciarlo) en una sesión de Claude Code para que ejecute las tareas en el orden indicado. No generar código hasta que el agente lea este plan.

---

## Resumen ejecutivo

**Prioridad máxima:** Las **5 tareas del módulo Facturación** (formulario Nuevo Cargo y base de datos) deben ejecutarse primero; la más crítica es la **Tarea Facturación 1** (error de relación billings–clients).

Luego, **8 tareas del Copilot** (bulk UX, delete status, orden creación, budgets, clientes, facturación, propuestas grandes, mensajes de estado).

### Tareas módulo Facturación (ejecutar primero)

1. **[CRÍTICA] Error DB "Could not embed because more than one relationship was found for 'billings' and 'clients'":** La tabla `billings` tiene **dos** FKs a `clients`: `client_id` (cliente del cargo) y `reimburse_to_client_id` (a qué cliente reembolsar). Al hacer select con embed/expand de clients, PostgREST no sabe cuál usar. Hay que desambiguar en las consultas (usar la relación explícita, p. ej. por nombre de FK) o ajustar el cliente de Supabase para que no falle el embed.
2. **Dropdown Cliente por defecto:** En el formulario "Nuevo Cargo", el selector de cliente debe mostrar por defecto el **cliente asociado al proyecto actual** (si existe); si el proyecto no tiene cliente asignado, la opción por defecto debe ser "Personalizado / Sin cliente". Hoy el dropdown no muestra clientes o no preselecciona el del proyecto.
3. **Validación fechas:** La fecha de vencimiento no puede ser menor que la fecha de emisión; validar en front y/o backend y mostrar error claro.
4. **Orden de campos:** En el formulario, el campo "Fecha de emisión" debe ir **antes** que "Fecha de vencimiento" (Vence) para que tenga sentido lógico.
5. **Date picker:** Los campos de fecha (emisión y vencimiento) deben ser un **mini calendario desplegable** para elegir la fecha, no un input de texto donde escribirla.

### Tareas Copilot (después de Facturación)

1. **Bulk Approve/Reject + Stop:** Al hacer "Aprobar todo" o "Rechazar todo", el otro botón debe convertirse en "Stop" para poder cancelar la operación en curso; no mostrar "Rechazando..." en ambos.
2. **Estado de propuestas de eliminación:** Cuando una propuesta de tipo delete está aprobada, la tarjeta debe mostrar "Eliminado" y opción "Deshacer", no "Creado — ver en el tablero".
3. **Orden de creación: hitos antes que tareas:** Asegurar que al aprobar propuestas, los hitos se creen antes que las tareas para que los IDs existan al asociar tareas a hitos.
4. **Copilot acceso completo al módulo Budgets:** Incluir presupuestos en contexto y proponer creación/edición con aprobación del usuario.
5. **Copilot acceso completo al módulo Clientes (Owner/Responsable):** Incluir clientes y empresa en contexto, gestionar con lenguaje natural y aprobación.
6. **Copilot acceso completo al módulo Facturación:** Incluir facturación en contexto, crear/leer/editar/eliminar registros con aprobación del usuario.
7. **Propuestas muy grandes y límite de contexto:** Permitir generar muchas propuestas (p. ej. 20 registros) sin truncado (lotes o límites en prompt/API).
8. **Mensajes de estado del Copilot que reflejen la acción real:** "Reading...", "Reasoning...", "Creating note...", "Generating tasks...", etc., según lo que esté haciendo.

A continuación se detalla cada tarea. **Ejecutar primero las Tareas Facturación 1–5, luego las Tareas Copilot 1–8.**

---

## Tareas módulo Facturación (prioridad máxima)

### Tarea Facturación 1 — [CRÍTICA] Error "Could not embed because more than one relationship was found for 'billings' and 'clients'"

#### Problema

Al crear un nuevo cargo (o entry) en el módulo de facturación, al guardar aparece el error:

**"Could not embed because more than one relationship was found for 'billings' and 'clients'"**

Este error viene de **PostgREST / Supabase**: cuando se hace un `select` sobre `billings` pidiendo incluir (embed/expand) la relación con `clients`, hay **más de una** foreign key de `billings` hacia `clients`, y la API no sabe cuál usar para el embed.

#### Causa en la base de datos

La tabla `public.billings` tiene **dos** columnas que referencian `public.clients`:

1. **`client_id`** — cliente asociado al cargo (quien recibe el cobro o a quien se asocia el gasto). Añadida en `20260213120000_add_billings_module.sql` (y `20260213121000_billings_add_client_and_overdue.sql`).
2. **`reimburse_to_client_id`** — cliente al que se reembolsa (para gastos reembolsables). Añadida en `20260308100000_billing_categories.sql`.

Ambas son `REFERENCES public.clients(id)`. Por tanto existen **dos relaciones** desde `billings` a `clients`. Cuando el código hace algo como `.from('billings').select('*, clients(*)')` (o equivalente con embed), PostgREST no puede decidir qué FK usar y devuelve ese error.

#### Comportamiento deseado

- Poder crear y guardar un nuevo cargo sin error.
- Las consultas que lean `billings` y necesiten el **cliente del cargo** deben usar de forma explícita la relación por `client_id` (no la de `reimburse_to_client_id`).

#### Implementación (guía para Claude Code)

- **No hace falta cambiar el esquema de la base de datos** (las dos FKs son válidas: un cargo tiene un cliente principal y opcionalmente un cliente al que reembolsar). El cambio es en **cómo se pide el embed** en el cliente de Supabase.
- En **todas** las llamadas que hagan `select` de `billings` y expandan/incorporen `clients`, hay que **desambiguar** la relación usando el nombre de la foreign key. En Supabase JS v2, la sintaxis para especificar qué FK usar es con el **hint de relación**, por ejemplo:
  - Para traer el cliente del cargo (client_id): usar algo como `.select('*, client:clients!billings_client_id_fkey(*)')` o la forma que use el proyecto para indicar "la relación por client_id". En PostgREST, el hint es por el nombre de la constraint de la FK (p. ej. `billings_client_id_fkey`). Revisar la documentación de Supabase para "embed with multiple relationships" o "foreign key hint".
- **Archivos a revisar:** Donde se haga `from('billings').select(...)` con algún expand a clients (por ejemplo en `app/actions/` para billings, o en server components que carguen listados de cargos con cliente). Ajustar esas consultas para que usen explícitamente la relación `client_id` → `clients` (y si en algún lugar se necesita `reimburse_to_client_id` → clients, usar esa otra relación de forma explícita).
- **Referencias de migraciones:** `supabase/migrations/20260213120000_add_billings_module.sql`, `supabase/migrations/20260213121000_billings_add_client_and_overdue.sql`, `supabase/migrations/20260308100000_billing_categories.sql` (añade `reimburse_to_client_id`).

#### Criterios de éxito

- Crear un nuevo cargo y guardar no muestra el error "Could not embed because more than one relationship was found for 'billings' and 'clients'".
- Los listados o detalles de cargos que muestran el cliente del cargo siguen funcionando y muestran el cliente correcto (el de `client_id`).

---

### Tarea Facturación 2 — Dropdown Cliente: valor por defecto = cliente del proyecto o "Personalizado / Sin cliente"

#### Problema

En el formulario "Nuevo Cargo" del módulo de facturación, el dropdown de selección de cliente no muestra (o no preselecciona) el cliente adecuado. Debería mostrar como **valor por defecto** el cliente asociado al proyecto actual (el "responsable" o cliente vinculado al proyecto), y si el proyecto no tiene cliente asociado, la opción por defecto debe ser **"Personalizado / Sin cliente"**.

#### Comportamiento deseado

- Al abrir el modal "Nuevo Cargo" en un proyecto que **tiene** un cliente vinculado (el mismo que se ve en el módulo "Responsable del proyecto" / Owner): el dropdown de cliente debe listar clientes y tener **preseleccionado** ese cliente del proyecto.
- Si el proyecto **no** tiene cliente vinculado: el dropdown debe tener por defecto **"Personalizado / Sin cliente"** (y opcionalmente el campo de nombre de cliente personalizado visible/editable).
- El dropdown debe **mostrar** la lista de clientes del usuario (no quedar vacío o sin opciones).

#### Implementación (guía para Claude Code)

- Obtener el `project_id` del contexto actual (pestaña Facturación de un proyecto). Obtener el cliente vinculado a ese proyecto (misma fuente que usa el módulo Owner/Responsable: p. ej. `projects.client_id` o la tabla que vincule proyecto ↔ cliente).
- Al montar el formulario "Nuevo Cargo", cargar la lista de clientes del usuario (owner) y el cliente del proyecto (si existe). Setear como valor inicial del dropdown: si hay cliente en el proyecto → ese `client_id`; si no → valor que represente "Personalizado / Sin cliente" (null o el id/opción correspondiente).
- **Archivos a revisar:** Componente(s) del modal "Nuevo Cargo" (formulario de nuevo cargo), posiblemente en `app/context/[projectId]/billings/` o similar; acciones que devuelvan lista de clientes y proyecto con cliente asociado.

#### Criterios de éxito

- Con proyecto que tiene cliente: al abrir "Nuevo Cargo", el dropdown muestra ese cliente como seleccionado.
- Con proyecto sin cliente: el valor por defecto es "Personalizado / Sin cliente".
- El dropdown muestra la lista de clientes disponibles (no vacío).

---

### Tarea Facturación 3 — Validación: fecha de vencimiento no puede ser menor que fecha de emisión

#### Problema

Se puede guardar un cargo con **fecha de vencimiento** anterior a la **fecha de emisión**, lo cual no tiene sentido (el vencimiento debe ser igual o posterior a la emisión).

#### Comportamiento deseado

- Si el usuario introduce (o selecciona) una fecha de vencimiento **menor** que la fecha de emisión, no permitir guardar y mostrar un mensaje de error claro (p. ej. "La fecha de vencimiento no puede ser anterior a la fecha de emisión").
- Validación recomendada en **front** (al enviar el formulario) y, si es posible, en **backend** o en la base de datos (check constraint o validación en server action).

#### Implementación (guía para Claude Code)

- En el formulario "Nuevo Cargo" (y en edición de cargo si aplica): antes de submit, comparar `due_date` y `issued_at`; si `due_date < issued_at`, mostrar error y no llamar a la acción de guardado.
- En la server action que crea/actualiza el cargo: validar la misma condición y devolver error si no se cumple.
- i18n: clave para el mensaje de error (p. ej. `billing.due_date_before_issued` o similar).

#### Criterios de éxito

- No se puede guardar un cargo con fecha de vencimiento menor que fecha de emisión; se muestra mensaje de error entendible.

---

### Tarea Facturación 4 — Orden de campos: Fecha de emisión antes de Fecha de vencimiento

#### Problema

En el formulario "Nuevo Cargo", el campo "Vence" (fecha de vencimiento) aparece antes que "Fecha de emisión", lo que resulta poco intuitivo: lo lógico es definir primero cuándo se emite y después cuándo vence.

#### Comportamiento deseado

- En el formulario, el campo **"Fecha de emisión"** debe mostrarse **antes** que el campo **"Vence"** (fecha de vencimiento), manteniendo el resto de campos en un orden coherente.

#### Implementación (guía para Claude Code)

- Reordenar los campos en el JSX (o configuración del form) del modal "Nuevo Cargo" (y en edición si aplica) para que "Fecha de emisión" quede antes de "Vence".

#### Criterios de éxito

- En el formulario se ve primero "Fecha de emisión" y después "Vence".

---

### Tarea Facturación 5 — Campos de fecha: date picker (mini calendario) en lugar de input de texto

#### Problema

Los campos de fecha (Fecha de emisión y Vence) son inputs de texto donde el usuario tiene que escribir la fecha. El usuario prefiere un **mini calendario desplegable** para seleccionar la fecha sin escribir.

#### Comportamiento deseado

- Los campos "Fecha de emisión" y "Vence" deben usar un **date picker** (componente que al hacer foco o clic despliegue un pequeño calendario para elegir día/mes/año), en lugar de un simple `<input type="text">` donde se escribe la fecha.
- El valor debe seguir siendo una fecha válida (Date o string ISO) para enviar al backend.

#### Implementación (guía para Claude Code)

- Usar un componente de date picker ya existente en el proyecto (p. ej. en `components/ui/` si hay uno basado en radix o similar) o añadir uno. Reemplazar los inputs de texto de las dos fechas por el date picker, manteniendo el estado y el binding con el formulario.
- Si el proyecto usa una librería de componentes (shadcn/ui, etc.), comprobar si ya hay `DatePicker` o `Calendar` y usarlo; si no, añadir el componente según la guía del proyecto.
- Asegurar accesibilidad (label, teclado, cierre al elegir fecha) y que el formato enviado al backend sea el esperado (p. ej. YYYY-MM-DD o el que use la API).

#### Criterios de éxito

- El usuario puede abrir un mini calendario desde el campo y seleccionar la fecha con el ratón (o teclado), sin tener que escribir la fecha a mano.

---

## Tareas Copilot

### Tarea Copilot 1 — Bulk Approve/Reject: botón Stop y estados correctos

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

### Tarea Copilot 2 — Propuestas de eliminación: mostrar "Eliminado" y opción Deshacer

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

### Tarea Copilot 3 — Orden de creación: hitos antes que tareas

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

### Tarea Copilot 4 — Copilot: acceso completo al módulo Budgets

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

### Tarea Copilot 5 — Copilot: acceso completo al módulo Clientes (Owner / Responsable del proyecto)

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

### Tarea Copilot 6 — Copilot: acceso completo al módulo Facturación

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

### Tarea Copilot 7 — Propuestas muy grandes: evitar truncado por límite de contexto

### Problema actual

Cuando el usuario pide al Copilot generar una **propuesta muy grande** (p. ej. "crea 20 registros de facturación" o "agrega 20 registros al módulo de facturación"), la respuesta del modelo se **corta a medias**: solo llegan unos pocos objetos en el bloque `<<PROPOSALS>>` y el resto no se genera. El usuario ve JSON incompleto o truncado y no puede aprobar en bloque los 20 registros. Esto se ha observado de forma repetida (p. ej. al pedir 20 registros de facturación, el Copilot se queda a medias las dos veces).

Las causas probables son: (a) **límite de tokens de salida** del modelo (max_tokens en la API), (b) **límite de contexto** total (entrada + salida) que hace que la generación se detenga, o (c) el modelo intenta emitir un bloque `<<PROPOSALS>>` demasiado largo en una sola respuesta.

### Comportamiento deseado

- El usuario puede pedir "crea 20 registros de facturación" (o N registros de otro tipo) y el Copilot debe poder **generar y entregar** las N propuestas completas, listas para bulk approve, sin truncado.
- La respuesta no debe mostrarse como JSON crudo en el chat; las propuestas deben aparecer como tarjetas aprobables (según lo definido en otras tareas: no mostrar el proceso en el chat, solo el resultado listo para bulk approve).

### Implementación (guía para Claude Code)

- **Diagnóstico:** Revisar en `app/api/copilot/[projectId]/chat/route.ts` los parámetros de la llamada al modelo (Anthropic o el que sea): `max_tokens`, y si hay algún truncado en el stream. Comprobar si el corte ocurre por max_tokens, por timeout, o por otro límite.
- **Opción A — Aumentar max_tokens y/o contexto:** Si el límite es de salida, subir `max_tokens` para respuestas largas (con cuidado de coste y tiempo). Documentar el límite recomendado (p. ej. "para propuestas de más de X ítems, usar Opción B").
- **Opción B — Dividir en lotes desde el prompt:** En el system prompt, instruir al modelo para que **no** intente emitir más de un número razonable de propuestas en un solo mensaje (p. ej. "máximo 5–8 propuestas por respuesta"). Si el usuario pide "20 registros", el modelo debe responder algo como: "Voy a generarlos en varios pasos. Aquí van los primeros 8 [<<PROPOSALS>> ...]. Aprueba estos y en el siguiente mensaje te envío los siguientes 8." Así se evita truncado y el usuario aprueba en bloques.
- **Opción C — Chunking en backend (avanzado):** Si se quiere una sola respuesta con 20 propuestas: implementar un flujo donde el backend haga varias llamadas al modelo (cada una generando un subconjunto, p. ej. 5 propuestas) y concatene los resultados antes de parsear y guardar propuestas. Más complejo; solo si A y B no bastan.
- **Recomendación:** Combinar **A** (max_tokens suficiente para respuestas moderadamente largas, p. ej. 10–12 propuestas de facturación) con **B** (instrucción clara de no superar X propuestas por mensaje y ofrecer "siguiente lote" si el usuario pide muchas). Así "20 registros" se convierte en 2–3 mensajes de ~8 registros cada uno, sin truncado.
- **Archivos afectados:** `app/api/copilot/[projectId]/chat/route.ts` (max_tokens, timeouts), `lib/copilot/context.ts` (instrucciones en system prompt sobre límite de propuestas por mensaje y respuesta en lotes).

### Criterios de éxito

- Al pedir "crea 20 registros de facturación", el usuario recibe todas las propuestas (en uno o varios mensajes), sin respuesta cortada a medias.
- No se muestra JSON crudo en el chat; las propuestas se muestran como tarjetas listas para bulk approve (alineado con la petición de "solo mostrar cuando esté listo para bulk approve").

---

### Tarea Copilot 8 — Mensajes de estado del Copilot que reflejen la acción real

### Problema actual

Durante la generación de una respuesta, el Copilot muestra mensajes rotativos o genéricos como "Pensando...", "Razonando...", "Creando...". Esos mensajes **no reflejan** lo que el modelo está haciendo en cada momento: no hay diferencia entre "está leyendo el mensaje del usuario", "está razonando" o "está generando tareas / una nota / un presupuesto". El usuario no tiene feedback real sobre el estado del proceso.

### Comportamiento deseado

El **estado mostrado** (el texto que ve el usuario mientras espera) debe **reflejar de verdad** la fase o el tipo de acción en curso. No hace falta que sea exactamente estos textos, pero la **lógica** debe ser así:

- **Al poco de recibir el mensaje del usuario:** algo como "Reading..." (leyendo) — indica que está procesando el input.
- **Fase de razonamiento:** "Reasoning..." o "Thinking..." — cuando está elaborando la respuesta antes de generar propuestas.
- **Cuando está generando contenido específico:** mensajes que dependan del **tipo** de propuesta o acción que se esté generando, por ejemplo:
  - Si está creando una nota: "Creating note..." (o "Creando nota...").
  - Si está generando tareas: "Generating tasks..." (o "Generando tareas...").
  - Si está creando un presupuesto: "Creating budget..." (o "Creando presupuesto...").
  - Si está generando registros de facturación: "Creating billing records..." (o "Creando registros de facturación...").
  - Análogo para hitos, mapa mental, etc.

Es decir: el estado no debe ser una rotación genérica sin sentido, sino **coherente con la intención del usuario** y, en la medida de lo posible, con lo que el modelo está produciendo (propuestas de tipo task, note, budget, billing, etc.).

### Implementación (guía para Claude Code)

- **Limitación:** El cliente (navegador) **no sabe** con certeza qué está generando el modelo hasta que empieza a llegar contenido (stream). No se puede saber "está creando una nota" antes de ver tokens que indiquen `"type": "note"` en el stream. Por tanto, hay dos enfoques:
  - **Enfoque 1 — Heurístico por contenido streamado:** Mientras se recibe el stream, el cliente **no** muestra el texto crudo (ya acordado: solo mensaje de estado). El cliente puede ir analizando el buffer acumulado (por ejemplo buscar aparición de `"type": "task"`, `"type": "note"`, `"type": "billing"`, etc. dentro de un bloque `<<PROPOSALS>>`) y, en cuanto detecte el tipo, actualizar el mensaje de estado a "Creating note...", "Generating tasks...", "Creating billing records...", etc. Secuencia típica: "Reading..." al inicio (primeros 1–2 s o primeros N bytes), luego "Reasoning..." o "Thinking..." hasta que se detecte inicio de propuestas, luego el mensaje específico según el tipo detectado.
  - **Enfoque 2 — Solo fases genéricas pero claras:** Si no se quiere parsear el stream, al menos diferenciar fases: "Reading..." al inicio, "Thinking..." o "Reasoning..." a mitad, y "Preparing proposals..." cuando haya pasado un umbral de tiempo o de bytes, sin distinguir tipo. Menos preciso pero ya mejora respecto a una rotación aleatoria.
- **Recomendación:** Implementar **Enfoque 1** con detección ligera en el cliente: al acumular `streamingContent` (o un buffer interno que no se muestra), buscar en el buffer si aparece `<<PROPOSALS>>` y luego `"type":"...` para elegir la etiqueta (creating_note, generating_tasks, creating_budget, creating_billing_records, etc.). Si no se detecta tipo, mantener "Reasoning..." o "Thinking...". No mostrar el contenido crudo al usuario; solo usarlo para elegir el mensaje de estado.
- **i18n:** Añadir claves bajo `copilot.*` para cada estado, por ejemplo: `reading`, `reasoning`, `thinking`, `creating_note`, `generating_tasks`, `creating_budget`, `creating_billing_records`, `creating_milestones`, `creating_mind_map`, `preparing_proposals`, etc. (en y es).
- **Archivos afectados:** `app/context/[projectId]/copilot/ContextCopilotClient.tsx` (lógica del stream: actualizar `streamingContent` o un estado de "status label" según fase y, si aplica, según tipo detectado en el buffer; no mostrar buffer crudo), `components/context/copilot/CopilotChatWindow.tsx` (mostrar el mensaje de estado actual), `locales/en.json` y `locales/es.json`.

### Criterios de éxito

- Al enviar un mensaje, el usuario ve primero un estado tipo "Reading..." y luego "Reasoning..." o "Thinking...".
- Cuando el modelo está generando propuestas, el mensaje de estado pasa a reflejar el tipo (p. ej. "Creating note...", "Generating tasks...", "Creating billing records...") en la medida en que el cliente pueda detectarlo del stream.
- No se muestra contenido crudo del backend; solo el mensaje de estado y, al terminar, el resultado final con tarjetas de propuestas.

---

## Orden de ejecución recomendado

**Fase 1 — Módulo Facturación (prioridad máxima)**

1. **Tarea Facturación 1** (Error DB billings–clients) — desambiguar relación en todas las consultas que hagan embed de clients desde billings.
2. **Tarea Facturación 2** (Dropdown cliente por defecto) — preseleccionar cliente del proyecto o "Personalizado / Sin cliente".
3. **Tarea Facturación 3** (Validación fechas) — vencimiento ≥ emisión; front y opcionalmente backend.
4. **Tarea Facturación 4** (Orden campos) — Fecha de emisión antes de Vence en el formulario.
5. **Tarea Facturación 5** (Date picker) — mini calendario para emisión y vencimiento.

**Fase 2 — Copilot**  
6. **Tarea Copilot 1** (Bulk Stop y estados) — solo UX en Copilot.  
7. **Tarea Copilot 2** (Eliminado + Deshacer) — UX y opcionalmente lógica de restore.  
8. **Tarea Copilot 3** (Orden hitos antes que tareas) — cliente + prompt.  
9. **Tareas Copilot 4, 5 y 6** — acceso completo a Budgets, Clientes, Facturación (en paralelo o secuencia).  
10. **Tarea Copilot 7** (Propuestas muy grandes) — max_tokens y/o lotes en el prompt.  
11. **Tarea Copilot 8** (Mensajes de estado reales) — Reading → Reasoning → Creating X según tipo detectado en el stream.

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

| Tema                   | Archivos / ubicación                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk approve           | `ContextCopilotClient.tsx` (handleApproveAll, handleRejectAll), `CopilotChatWindow.tsx`                                                 |
| Proposal cards         | `CopilotProposalCard.tsx`, `card-renderers/index.ts`                                                                                    |
| Contexto Copilot       | `lib/copilot/context.ts` (buildProjectContext)                                                                                          |
| Parser / schema        | `lib/copilot/parser.ts`, `lib/copilot/schema.ts`                                                                                        |
| Approve flow           | `app/context/[projectId]/copilot/actions.ts`, RPC approve_copilot_proposal_atomic                                                       |
| Budgets                | `app/actions/budgets.ts`, rutas context budgets                                                                                         |
| Clientes / Owner       | `app/actions/clients.ts`, `app/context/[projectId]/owner/`                                                                              |
| Facturación            | Rutas billings, acciones de cargos/facturas                                                                                             |
| Billings ↔ clients     | `billings.client_id`, `billings.reimburse_to_client_id` → `clients(id)`; desambiguar embed en selects                                   |
| Formulario Nuevo Cargo | Modal en módulo Facturación; cliente por defecto, fechas, date picker                                                                   |
| Migraciones billings   | `20260213120000_add_billings_module.sql`, `20260213121000_billings_add_client_and_overdue.sql`, `20260308100000_billing_categories.sql` |
| Chat stream / límites  | `app/api/copilot/[projectId]/chat/route.ts` (max_tokens, stream)                                                                        |
| Estado durante stream  | `ContextCopilotClient.tsx` (streamingContent, lógica de status), `CopilotChatWindow.tsx`                                                |
