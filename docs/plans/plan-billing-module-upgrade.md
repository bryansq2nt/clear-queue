# Plan: Billing Module Upgrade

**Date:** 2026-02-24  
**Status:** Draft — pending approval  
**Scope:** Billings tab in project context (`/context/[projectId]/billings`)

---

## 1. Current state (resumen)

### Schema (`billings`)

| Campo                   | Tipo        | Notas                                   |
| ----------------------- | ----------- | --------------------------------------- |
| id                      | uuid        | PK                                      |
| owner_id                | uuid        | FK auth.users                           |
| client_id               | uuid        | Opcional, FK clients                    |
| project_id              | uuid        | Opcional, FK projects                   |
| title                   | text        | Requerido                               |
| client_name             | text        | Cuando no hay client_id                 |
| amount                  | numeric     | Requerido, >= 0                         |
| currency                | text        | Default 'USD'                           |
| status                  | text        | pending \| paid \| overdue \| cancelled |
| due_date                | date        | Opcional                                |
| paid_at                 | timestamptz | Opcional, se setea al marcar paid       |
| notes                   | text        | Opcional                                |
| created_at / updated_at | timestamptz |                                         |

- **No hay categorías**: no se puede clasificar el tipo de gasto/cobro ni filtrar.
- **No hay adjuntos**: no hay forma de subir recibo o ticket por billing.
- **Filtros**: no hay filtros en la UI (solo lista completa por proyecto).
- **Errores**: se usa `alert()` en lugar del patrón `MutationErrorDialog` (ver AGENTS.md).

### UI actual

- Resumen: Total, Pagado, Pendiente (3 cards).
- Formulario inline: cliente (select o nombre libre), título, monto, fecha vencimiento, notas.
- Tabla: título, cliente, vence, monto, estado (select), editar.
- FAB: “Nuevo cargo”.

### Flujo de datos

- `ContextBillingsFromCache` → cache por `projectId` + tipo `billings`.
- `getBillingsByProjectId(projectId)` con joins a `projects` y `clients`.
- Acciones: `createBilling`, `updateBilling`, `updateBillingStatus`.
- Revalidación: `/billings` y `/context/${projectId}/billings`.

---

## 2. Objetivos del plan

- Añadir **categorías de billing** para clasificar y filtrar (tipos de gasto/cobro).
- Permitir **adjuntar recibo o ticket** por billing (un archivo por entrada, o varios según diseño).
- Hacer el módulo **más útil** sin complicarlo demasiado: filtros, mejor UX, opcionalmente más datos para reportes.

Todo debe seguir: AGENTS.md, CONVENTIONS.md, patrones en `docs/patterns/` (data-loading, server-actions, context-session-cache, transactions si hay multi-step).

---

## 3. Features propuestas (para aprobar / rechazar)

### A. Categorías de billing (prioridad alta)

**Qué:** Un billing puede tener una categoría (ej. “Servicios”, “Materiales”, “Honorarios”, “Otro”). Las categorías pueden ser:

- **Opción 1 — Lista fija (enum):** Valores predefinidos en DB (más simple, sin CRUD de categorías).
- **Opción 2 — Categorías por usuario/proyecto:** Tabla `billing_categories` (owner_id, name, color?, sort_order), el usuario crea/edita sus categorías (más flexible, más trabajo).

**Recomendación:** Empezar con **Opción 1** (enum) para tener filtros rápido; luego, si hace falta, migrar a tabla en una fase 2.

**Cambios:**

- Migration: enum `billing_category_enum` + columna `category` en `billings` (nullable al inicio para no romper datos existentes, luego backfill “other”).
- UI: select de categoría en formulario create/edit; filtro por categoría en la lista (dropdown o chips).
- Acciones: incluir `category` en create/update; getters filtran por categoría (query param o filtro en cliente).

**Filtros:** Lista filtrable por categoría (y opcionalmente por status, ver B).

---

### B. Filtros en la lista (prioridad alta)

**Qué:**

- Filtro por **categoría** (cuando exista).
- Filtro por **estado** (pending, paid, overdue, cancelled) — ya existe el dato, solo falta UI (chips o select).
- Opcional: **rango de fechas** (due_date o created_at) para ver “este mes” / “este año”.

**Implementación:** Filtros en cliente sobre la lista ya cargada (sin nuevo endpoint) para no superar el contrato de ≤3 round trips por tab. Si en el futuro la lista crece mucho, se puede pasar a filtros server-side con query params.

---

### C. Adjunto de recibo / ticket por billing (prioridad alta)

**Qué:** Poder subir (y ver) un recibo o ticket asociado a un billing. Un archivo por billing (el caso más común); si se quiere “varios archivos”, se puede dejar para una fase posterior.

**Opciones de diseño:**

- **Opción 1 — Columna en `billings`:** `receipt_file_id uuid REFERENCES project_files(id)` (o tabla dedicada `billing_receipts`). Reutiliza `project_files` + storage existente si los recibos viven por proyecto.
- **Opción 2 — Storage dedicado “billing-receipts”:** Bucket/rama solo para recibos, tabla `billing_receipts (billing_id, file_path, ...)` con RLS por owner.

**Recomendación:** Reutilizar **project_files** y asociar con una FK opcional desde `billings` (ej. `receipt_file_id`) o una tabla de unión `billing_receipts (billing_id, project_file_id)` si en el futuro se permiten varios archivos. Así se reutiliza upload, signed URLs y vista de documentos.  
Requisito: el billing ya tiene `project_id`; el archivo se sube al mismo proyecto y se enlaza al billing.

**Cambios:**

- Migration: añadir `receipt_file_id uuid NULL REFERENCES project_files(id) ON DELETE SET NULL` en `billings` (o tabla `billing_receipts` con 1:1 por ahora).
- Storage: mismo bucket/patrón que Document Hub (subir a project-docs o similar), con categoría “receipt”/“invoice” si existe en `project_document_category_enum`, o un tipo nuevo.
- Server actions: upload de archivo + actualizar billing con `receipt_file_id`; acción para “quitar recibo” (SET NULL). Descarga/vista: mismo patrón que Document Hub (API route 302 para signed URL).
- UI: en la fila o detalle del billing, botón “Subir recibo” / “Ver recibo” según exista o no archivo.

**Referencia en repo:** `app/api/documents/[fileId]/view/route.ts` + `lib/storage/upload.ts` (y Document Hub); no abrir ventana en blanco y luego navegar después de await (regla window.open en AGENTS.md).

---

### D. Mejoras de UX y consistencia (prioridad media)

- **Errores:** Sustituir `alert()` por el patrón `MutationErrorDialog` (como en board/tasks) en create/update/updateStatus.
- **Formulario:** Considerar modal en lugar de formulario inline para crear/editar (más espacio y menos ruido).
- **Tabla:** En móvil, considerar cards en lugar de tabla, o tabla scrolleable con columnas prioritarias.
- **Resumen:** Mantener Total / Pagado / Pendiente; opcionalmente “Total por categoría” si hay categorías.

---

### E. Campos opcionales (prioridad baja — aprobar si aplica)

- **Método de pago / referencia:** Ej. “Transferencia”, “Tarjeta”, “Efectivo”, “Otro” (text libre o enum). Útil para conciliación.
- **Fecha de emisión:** Además de `due_date`, un `issued_at` para facturas (opcional).
- **Número de factura / referencia externa:** Campo texto para número de factura o ID en sistema externo.

Solo añadir si realmente lo van a usar; cada campo implica formulario, validación y posiblemente filtros.

---

### F. Export y reportes (prioridad baja)

- **Export CSV:** Botón “Exportar” que genere CSV de los billings visibles (con filtros aplicados) para contabilidad. Implementación: server action que devuelve CSV o blob, o API route que devuelve archivo.
- **Totales por período:** “Pendiente este mes” / “Pagado este trimestre” como variante del resumen (requiere filtro por fechas o cálculos por fecha).

---

### G. Integración con otros módulos (futuro, no en este plan)

- **Vínculo con Budgets:** Opcionalmente relacionar un billing con un ítem de presupuesto (budget_item_id). Útil para “gasto real vs presupuestado”. Dejar fuera del alcance inicial.
- **Recordatorios:** Notificaciones o avisos de vencimiento. Fuera de alcance por ahora.

---

## 4. Fases sugeridas de implementación

| Fase                  | Contenido                                                                                                  | Dependencias                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Fase 1**            | Categorías (enum) + columna en `billings` + select en formulario + filtro por categoría en UI              | Ninguna                                           |
| **Fase 2**            | Filtros por estado (y opcionalmente por rango de fechas en cliente)                                        | Ninguna                                           |
| **Fase 3**            | Adjunto recibo: schema (receipt_file_id o billing_receipts), upload, vista/descarga, UI “Subir/Ver recibo” | Document Hub / project_files y storage existentes |
| **Fase 4**            | UX: MutationErrorDialog, modal create/edit, mejoras tabla/cards                                            | Ninguna                                           |
| **Fase 5** (opcional) | Campos opcionales (método de pago, issued_at, ref externa)                                                 | Fase 1                                            |
| **Fase 6** (opcional) | Export CSV, totales por período                                                                            | Fase 1, 2                                         |

El orden se puede ajustar; por ejemplo, hacer Fase 3 (recibos) antes que Fase 2 si la prioridad es tener recibos ya.

---

## 5. Esquema de cambios (resumen)

- **billings:** `category` (enum, nullable al inicio), `receipt_file_id` (uuid, nullable, FK project_files) — o tabla `billing_receipts` si se prefiere 1:N desde el inicio.
- **Nuevo enum:** `billing_category_enum` (ej. services, materials, fees, subscription, other).
- **RLS:** Sin cambio si solo se añaden columnas; si hay tabla nueva (billing_receipts o billing_categories), políticas por owner_id/project_id según patrón existente.
- **Índices:** `idx_billings_project_category`, `idx_billings_status` (ya existe), opcional `idx_billings_due_date` (ya existe).

---

## 6. Riesgos y consideraciones

- **Categorías:** Si luego se pasa de enum a tabla, hará falta migración de datos (mapeo enum → category_id).
- **Recibos:** Reutilizar `project_files` implica que borrar un archivo (soft delete) debe dejar `receipt_file_id` en NULL o manejar “archivo no disponible” en UI.
- **Performance:** Filtros en cliente están bien mientras la lista por proyecto sea razonable (< ~500 filas); si crece, mover filtros al servidor.
- **i18n:** Añadir claves para categorías, filtros, “Subir recibo”, “Ver recibo”, “Sin recibo”, etc. (EN/ES).

---

## 7. Checklist de aprobación

Marcar lo que se aprueba para implementar:

- [ ] **A. Categorías de billing** — enum + filtro (Opción 1) / tabla usuario (Opción 2) / rechazado
- [ ] **B. Filtros** — por categoría + estado (+ fechas opcional) / rechazado
- [ ] **C. Recibo/ticket** — un archivo por billing usando project_files / rechazado
- [ ] **D. UX** — MutationErrorDialog + modal + mejoras tabla / rechazado
- [ ] **E. Campos opcionales** — método de pago, issued_at, ref / rechazado
- [ ] **F. Export CSV** — incluir en plan / rechazado

**Notas del revisor:**  
_(espacio para que indiques prioridades, cambios o exclusiones)_

---

## 8. Referencias

- `app/context/[projectId]/billings/` — UI actual
- `app/actions/billings.ts` — acciones
- `supabase/migrations/20260213120000_add_billings_module.sql`, `20260213121000_billings_add_client_and_overdue.sql`
- `docs/patterns/data-loading.md`, `server-actions.md`, `context-session-cache.md`
- Document Hub: `supabase/migrations/20260224100000_document_hub.sql`, `app/api/documents/[fileId]/view/route.ts`
- AGENTS.md — MutationErrorDialog, no alert(), window.open
