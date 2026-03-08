# Auditoría: Facturación y Copilot tras ejecutar el plan

**Fecha:** 2026-03-08  
**Objetivo:** Identificar por qué, tras ejecutar el plan (HANDOFF_PROMPT_COPILOT_SIX_TASKS.md), el usuario sigue sin poder crear registros en el módulo de facturación y no ve las sugerencias del Copilot para facturación.

---

## 1. Resumen del plan (lo que debía aplicarse)

### Fase 1 — Módulo Facturación

- **Facturación 1:** Corregir error "Could not embed because more than one relationship was found for 'billings' and 'clients'" desambiguando la relación en los selects (usar `clients!billings_client_id_fkey` para el cliente del cargo).
- **Facturación 2:** Dropdown cliente por defecto = cliente del proyecto o "Personalizado / Sin cliente".
- **Facturación 3:** Validación fecha vencimiento ≥ fecha emisión.
- **Facturación 4:** Orden de campos: Fecha de emisión antes de Vence.
- **Facturación 5:** Date picker (mini calendario) para fechas.

### Fase 2 — Copilot

- Entre otras: acceso completo a Facturación, propuestas grandes por lotes, mensajes de estado.

---

## 2. Qué está aplicado (auditoría de código)

### 2.1. Tarea Facturación 1 — Embed billings ↔ clients

**Estado: APLICADO en `app/actions/billings.ts`.**

- `getBillingsByProjectId`: usa  
  `client:clients!billings_client_id_fkey(id, full_name)`  
  en el `.select()`, por tanto la relación por `client_id` está desambiguada.
- `createBilling`: tras el `.insert()` hace  
   `.select(\`${BILLING_COLS}, client:clients!billings_client_id_fkey(id, full_name), billing_categories(...)\`)` 
y devuelve`BillingWithRelations`. Misma desambiguación.
- No hay otros `.from('billings').select(...)` con embed de clients en el repo que omitan el hint.

**Conclusión:** La causa del error "Could not embed..." debería estar resuelta en el código actual. Si el error sigue apareciendo, puede deberse a: (1) caché o build antiguo, (2) otro cliente (p. ej. Supabase Studio o un script) que no use este hint, (3) nombre real del constraint en la BD distinto del esperado (`billings_client_id_fkey`).

### 2.2. Tareas Facturación 2, 3, 4

**Estado: APLICADAS.**

- **Facturación 2:** `app/context/[projectId]/billings/page.tsx` pasa `projectClientId={project?.client_id ?? null}` a `ContextBillingsFromCache`. En `ContextBillingsClient.tsx`, `openCreate()` hace `setForm({ ...emptyForm(), client_id: projectClientId ?? '' })`, por lo que el cliente por defecto es el del proyecto o vacío (Personalizado / Sin cliente).
- **Facturación 3:** En `ContextBillingsClient.tsx` (handleSave) se valida `form.due_date < form.issued_at` y se muestra `t('billings.due_date_before_issued')`. En `app/actions/billings.ts`, `createBilling` y `updateBilling` validan `due_date < issued_at` y devuelven error.
- **Facturación 4:** En el formulario del modal, el campo "Fecha de emisión" (`issued_at`) aparece antes que "Vence" (`due_date`) en el JSX (líneas ~648 y ~665 del client).

### 2.3. Copilot y facturación

**Estado: Módulo de facturación integrado en Copilot.**

- `lib/copilot/registry/modules/billings.ts`: define `billingsCapabilities` con tipos `billing`, `update_billing`, `delete_billing`; `validateBillingShape`, `approveBilling`, etc.
- `lib/copilot/context.ts`: incluye `fetchBillingsContext` y texto de billings en el prompt.
- `lib/copilot/registry/index.ts`: registra `billingsCapabilities`.
- `components/context/copilot/card-renderers/index.ts`: tiene config para `billing`, `update_billing`, `delete_billing` (icono, label, viewLink).
- `app/context/[projectId]/copilot/actions.ts`: `saveCopilotProposals` inserta en `copilot_proposals` con `type: p.type`; `approveProposal` obtiene la capability del registro por tipo y llama a `capability.approve(...)`.

---

## 3. Bug identificado: tipos `billing` no permitidos en la base de datos

### 3.1. Evidencia

La tabla `public.copilot_proposals` tiene un CHECK en la columna `type`. La migración más reciente que define ese CHECK es:

**`supabase/migrations/20260307100000_copilot_proposals_add_mind_map_type.sql`**

```sql
ALTER TABLE public.copilot_proposals
  ADD CONSTRAINT copilot_proposals_type_check
    CHECK (type IN (
      'task', 'note', 'milestone',
      'delete_milestone', 'update_milestone',
      'delete_task', 'update_task',
      'delete_note', 'update_note',
      'mind_map'
    ));
```

En esa lista **no** figuran: `'billing'`, `'update_billing'`, `'delete_billing'` (ni otros tipos que el registro pueda usar, como `'link'`, `'budget'`, `'client'` si existen).

### 3.2. Efecto

1. El Copilot genera un mensaje con bloque `<<PROPOSALS>>` que incluye objetos con `"type": "billing"`.
2. El cliente parsea con `parseProposals()` y obtiene propuestas validadas por el registro (p. ej. `{ type: 'billing', title: '...', amount: 20, ... }`).
3. Se llama a `saveCopilotProposals(sessionId, messageId, projectId, proposals)`.
4. Se hace `insert(rows)` en `copilot_proposals` con `type: 'billing'`.
5. Postgres rechaza el INSERT por violar el CHECK (`type` no está en la lista).
6. La acción captura el error y devuelve `[]`.
7. El estado `proposalsByMessage` no recibe propuestas para ese mensaje.
8. La UI no muestra tarjetas de propuestas → el usuario solo ve el texto del Copilot ("Lote 1 de 4") y **no puede ver las sugerencias** para aprobar.

Por tanto, **las propuestas de facturación nunca se guardan** y por eso el usuario no ve las sugerencias.

### 3.3. Creación directa en el formulario "Nuevo Cargo"

Si el usuario tampoco puede crear registros **desde el formulario** (modal Nuevo Cargo):

- El flujo usa `createBilling` en `app/actions/billings.ts`, que ya desambigua el embed. Si el error "Could not embed..." sigue apareciendo ahí, conviene: (1) confirmar que el constraint en la BD se llama exactamente `billings_client_id_fkey` (o el que use PostgREST) y que el hint en el select coincide, (2) hacer un build limpio y probar en ventana de incógnito por si hay caché.

Si el único problema es **no ver sugerencias del Copilot**, la causa es la del apartado 3.2: CHECK de `copilot_proposals` sin los tipos de billing.

---

## 4. Acción correctora recomendada

### 4.1. Migración: ampliar `copilot_proposals_type_check` con billing (y resto de tipos del registro)

Crear una nueva migración (p. ej. `supabase/migrations/YYYYMMDDHHMMSS_copilot_proposals_add_billing_and_module_types.sql`) que:

1. Haga `DROP CONSTRAINT IF EXISTS copilot_proposals_type_check` en `copilot_proposals`.
2. Añada de nuevo el CHECK incluyendo **todos** los tipos que el registro usa actualmente, para no repetir el mismo fallo con link, budget, client, etc.

Tipos que deben estar si el registro los expone (revisar `lib/copilot/registry/index.ts` y cada módulo):

- Los ya permitidos: `task`, `note`, `milestone`, `delete_milestone`, `update_milestone`, `delete_task`, `update_task`, `delete_note`, `update_note`, `mind_map`.
- Facturación: `billing`, `update_billing`, `delete_billing`.
- Cualquier otro que exista en el registro (p. ej. `link`, `update_link`, `delete_link`, `todo_item`, `toggle_todo`, `delete_todo_item`, `budget`, `client`, etc.). La lista exacta debe coincidir con los `type` de las capabilities registradas.

Ejemplo (solo billing; ampliar según el registro):

```sql
ALTER TABLE public.copilot_proposals
  DROP CONSTRAINT IF EXISTS copilot_proposals_type_check;

ALTER TABLE public.copilot_proposals
  ADD CONSTRAINT copilot_proposals_type_check
    CHECK (type IN (
      'task', 'note', 'milestone',
      'delete_milestone', 'update_milestone',
      'delete_task', 'update_task',
      'delete_note', 'update_note',
      'mind_map',
      'billing', 'update_billing', 'delete_billing'
    ));
```

### 4.2. Verificación

- Tras aplicar la migración, pedir al Copilot "crea 5 registros de facturación de prueba".
- Comprobar que aparecen las tarjetas de propuestas bajo el mensaje y que se pueden aprobar.
- Crear un cargo desde el formulario "Nuevo Cargo" y confirmar que no aparece el error de embed (y que la validación de fechas y el cliente por defecto se comportan como se espera).

---

## 5. Resumen

| Ítem                                  | Estado          | Notas                                                                                                      |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| Embed billings–clients en actions     | Aplicado        | Uso de `clients!billings_client_id_fkey` en getBillingsByProjectId y createBilling.                        |
| Cliente por defecto en formulario     | Aplicado        | projectClientId pasado desde page y usado en openCreate().                                                 |
| Validación due_date ≥ issued_at       | Aplicado        | En cliente y en createBilling/updateBilling.                                                               |
| Orden campos (emisión antes de vence) | Aplicado        | En ContextBillingsClient.                                                                                  |
| Date picker                           | A revisar       | No comprobado en esta auditoría.                                                                           |
| Tipos billing en copilot_proposals    | **No aplicado** | **CHECK no incluye 'billing', 'update_billing', 'delete_billing' → insert falla → no se ven sugerencias.** |

**Causa raíz del problema "no puedo ver las sugerencias":** La tabla `copilot_proposals` no permite `type IN ('billing', 'update_billing', 'delete_billing')`, por lo que el INSERT de las propuestas falla y la UI no muestra tarjetas. Solución: migración que amplíe el CHECK con estos tipos (y con cualquier otro tipo de propuesta que use el registro).
