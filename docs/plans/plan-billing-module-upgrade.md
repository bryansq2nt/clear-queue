# Plan: Billing Module Upgrade (v2 — aprobado y ampliado)

**Date:** 2026-02-24  
**Status:** Aprobado — ejecución fase por fase  
**Scope:** Billings tab en project context (`/context/[projectId]/billings`) + integración Document Hub + Budgets + recordatorios

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
| paid_at                 | timestamptz | Opcional                                |
| notes                   | text        | Opcional                                |
| created_at / updated_at | timestamptz |                                         |

- Sin categorías, sin adjuntos, sin filtros, errores con `alert()`.

### UI actual

- Resumen: Total, Pagado, Pendiente. Formulario inline, tabla, FAB “Nuevo cargo”.

---

## 2. Objetivos del plan (actualizados)

- **Categorías por usuario** (globales en todos sus proyectos), con categorías por defecto y CRUD.
- **Filtros** por categoría, estado y rango de fechas (aprobado).
- **Recibos/tickets** reutilizando el módulo de documentos; carpeta/vista “Receipts & tickets” no modificable (solo renombrar, ver, descargar; eliminar/reemplazar solo desde el bill).
- **UX:** MutationErrorDialog, modal create/edit, mejoras de tabla/cards.
- **Campos:** Tipo de billing (cobro / pago / gasto), método de pago, issue date; para gastos: quién pagó y si alguien debe devolver.
- **Export** por período (mes, año) y por categoría.
- **Vínculo con Budgets:** Adjudicar el bill a un ítem de presupuesto del proyecto actual.
- **Recordatorios** con widget al top (como “documentos recientes” en Documents).

Todo debe seguir AGENTS.md, CONVENTIONS.md y patrones en `docs/patterns/`.

---

## 3. Features aprobadas y especificaciones

### A. Categorías de billing — por usuario (globales)

**Decisión:** Categorías **por usuario** (owner_id), no por proyecto. Las mismas categorías se ven en todos sus proyectos. El usuario puede agregar y remover categorías. Cada usuario tiene **categorías creadas por defecto** para no empezar con lista vacía.

**Schema:**

- Tabla **`billing_categories`**:  
  `id`, `owner_id` (FK auth.users), `name`, `color` (text nullable), `sort_order` (int default 0), `created_at`, `updated_at`.  
  RLS: todas las políticas por `owner_id`.  
  Índice: `(owner_id, sort_order)`.
- Columna en **`billings`**: `category_id uuid NULL REFERENCES billing_categories(id) ON DELETE SET NULL`.

**Categorías por defecto:** Al crear usuario o al primer uso del módulo de billings, si el usuario no tiene categorías, insertar desde app (o RPC) un set fijo, ej.: “Servicios”, “Materiales”, “Honorarios”, “Suscripciones”, “Otro”. Opción alternativa: trigger o job que inserte defaults al primer INSERT en billings si no existe ninguna categoría para ese owner (evita doble trabajo luego).

**UI:** Select de categoría en formulario create/edit; filtro por categoría en la lista (dropdown o chips). En settings o dentro del módulo billings, pantalla o modal para “Gestionar categorías” (añadir, editar nombre/color, borrar, reordenar). Las categorías se cargan una vez por usuario (acción `getBillingCategories(owner_id)` cacheable).

---

### B. Filtros (aprobado)

- Filtro por **categoría**.
- Filtro por **estado** (pending, paid, overdue, cancelled).
- Filtro por **rango de fechas** (due_date o issued_at/created_at): ej. “Este mes”, “Este año”, custom.

Implementación: filtros en cliente sobre la lista ya cargada (≤3 round trips por tab). Si la lista crece, valorar filtros server-side.

---

### C. Recibos / tickets — Document Hub + carpeta “Receipts & tickets”

**Decisión:** Los receipts/tickets adjuntos a un bill se suben **reutilizando el módulo de documentos** (project_files + storage). Esos archivos se muestran en una **carpeta aparte no modificable** en el módulo de documentos: “Receipts & tickets”. Desde esa vista: **renombrar** (título), **ver** y **descargar** permitidos; **eliminar no permitido**. Para eliminar o reemplazar un recibo/ticket se hace **desde el bill en el módulo Billing**; así el usuario entiende que no puede dejar un bill sin archivo desde Documents.

**Schema:**

- En **`billings`**: `receipt_file_id uuid NULL REFERENCES project_files(id) ON DELETE SET NULL`.
- Los archivos de recibos se suben al mismo bucket/patrón del Document Hub (project-docs), con `document_category` = `invoice` o un valor específico `receipt` si se añade al enum. Se asocian al proyecto del bill (`project_id`) y se enlazan con `receipt_file_id`.

**Document Hub — carpeta “Receipts & tickets”:**

- **Origen de datos:** Lista de archivos que son recibos del proyecto:  
  `SELECT id FROM project_files WHERE id IN (SELECT receipt_file_id FROM billings WHERE project_id = :projectId AND receipt_file_id IS NOT NULL)`.
- **Comportamiento:**
  - Esta “carpeta” es una vista especial (no es un folder_id editable): no se puede crear/eliminar la carpeta ni subir directamente a ella; los archivos entran solo al adjuntar desde un bill.
  - En la lista de esa carpeta: **renombrar** (actualizar `project_files.title`) permitido; **ver/descargar** (misma API route 302 que Document Hub) permitido; **eliminar** y **mover** deshabilitados (tooltip: “Para quitar o reemplazar este recibo, ve a Facturación y quita o reemplaza el adjunto del cargo”).
  - No se permite eliminar el archivo desde Documents; si se hace “reemplazar” desde Billing, el archivo viejo puede quedar huérfano (opción: soft-delete o marcar como “replaced” para no mostrarlo en Receipts).

**Billing UI:** En la fila o detalle del billing: “Subir recibo” / “Ver recibo” / “Reemplazar” / “Quitar recibo” según corresponda. Upload reutiliza flujo Document Hub; al guardar se actualiza `billings.receipt_file_id`.

**Referencia:** `app/api/documents/[fileId]/view/route.ts`, Document Hub, regla `window.open` en AGENTS.md.

---

### D. Mejoras de UI y MutationErrorDialog

- Sustituir **todos** los `alert()` por el patrón **MutationErrorDialog** (como en board/tasks).
- **Formulario:** Modal para crear/editar en lugar de formulario inline.
- **Tabla/cards:** Mejorar legibilidad; en móvil considerar cards o tabla scrolleable.
- Respetar shimmer en loading; no spinners ni “Loading…”.

---

### E. Tipo de billing, método de pago, issue date y gastos

**Tipos de billing:** Un billing puede ser:

- **Cobro (charge):** lo que emites al cliente; tendrá **issue date** (fecha de emisión).
- **Pago (payment):** pagos que registras (ej. pagos a proveedores).
- **Gasto (spending):** gastos (ej. tú pagas algo por el cliente o suscripciones/artículos pagados con tarjeta del cliente).

**Schema:**

- **`billings`**:
  - `type` text NOT NULL default 'charge' CHECK (type IN ('charge', 'payment', 'spending')).
  - `issued_at` date NULL — para cobros (y opcionalmente otros).
  - `payment_method` text NULL — ej. enum o texto: 'cash', 'transfer', 'card', 'client_card', 'other'.
  - Para **spendings**:
    - `paid_by` text NULL — quién pagó: 'me', 'client', 'other' (o texto libre si se prefiere).
    - `expect_reimbursement` boolean NOT NULL default false — si alguien debe devolver el dinero (ej. tú pagas y luego cobras al cliente).
    - `reimburse_to_client_id` uuid NULL REFERENCES clients(id) — opcional, a quién se le debe cobrar la devolución.

**Casos de uso:** (7) “Yo pago algo por mis clientes pero luego debo cobrarles” → spending, paid_by=me, expect_reimbursement=true, reimburse_to_client_id=cliente. (8) “Pago suscripciones o artículos con tarjetas de mis clientes” → spending, payment_method=client_card, paid_by=client (o similar). **Método de pago** y **issue date** aprobados explícitamente.

**UI:** Selector de tipo (cobro / pago / gasto). Si “cobro”, mostrar issued_at. Siempre opción de método de pago. Si “gasto”, mostrar paid_by, expect_reimbursement y opcionalmente reimburse_to_client_id.

---

### F. Export por período y por categoría (aprobado)

- **Export** (CSV o similar) con filtros:
  - Por **período:** por mes, por año, rango custom.
  - Por **categoría**.
  - Combinable con estado, tipo, etc.
- Los datos exportados serán los billings visibles según filtros (o explícitamente “exportar por mes X”, “por año Y”, “por categoría Z”).

Implementación: server action o API route que devuelve CSV con columnas: tipo, categoría, título, cliente, monto, estado, due_date, issued_at, payment_method, etc.

---

### G. Vínculo con Budgets (aprobado)

- Poder **adjudicar un bill a un ítem de presupuesto** del proyecto.
- **Solo ítems de budgets del proyecto actual** (project_id del bill = project_id del budget).

**Schema:**

- **`billings`**: `budget_item_id uuid NULL REFERENCES budget_items(id) ON DELETE SET NULL`.
- Al elegir “Vincular a presupuesto”, el selector muestra solo budget_items de budgets cuyo `project_id` = projectId actual. Validación en server action.

**UI:** En formulario create/edit, selector opcional “Ítem de presupuesto” (listar budgets del proyecto → categorías → ítems). Mostrar en la tabla/detalle el ítem vinculado (nombre del ítem o del budget).

---

### H. Recordatorios y widget al top

- **Recordatorios** por billing: el usuario puede definir uno o más recordatorios (fecha/hora + mensaje opcional).
- En la vista de Billings, un **widget al top** (igual que “Documentos recientes” en Documents) que muestre los **próximos recordatorios** (ej. próximos 7 días o próximos N recordatorios), con enlace al bill correspondiente.

**Schema:**

- Tabla **`billing_reminders`**:  
  `id`, `billing_id` (FK billings ON DELETE CASCADE), `owner_id` (FK auth.users, para RLS), `remind_at` (timestamptz NOT NULL), `message` (text NULL), `created_at`.  
  RLS por `owner_id`. Índice: `(owner_id, remind_at)`.
- Widget: consultar reminders donde `remind_at` entre now y now+7 días (o límite N), orden por `remind_at`, join con billings para mostrar título, monto, due_date.

**UI (Billings):** En create/edit billing, sección “Recordatorio” (añadir fecha/hora y mensaje opcional; si se permiten varios, lista de recordatorios). En la parte superior del tab Billings, sección “Próximos recordatorios” con lista de ítems (fecha, mensaje, título del bill, enlace a editar/ver el bill).

---

## 4. Esquema de cambios (resumen)

### Tablas nuevas

- **`billing_categories`**: id, owner_id, name, color, sort_order, created_at, updated_at. RLS por owner_id. Índice (owner_id, sort_order).
- **`billing_reminders`**: id, billing_id, owner_id, remind_at, message, created_at. RLS por owner_id. Índice (owner_id, remind_at).

### Cambios en `billings`

| Columna                | Tipo          | Notas                                            |
| ---------------------- | ------------- | ------------------------------------------------ |
| category_id            | uuid NULL     | FK billing_categories ON DELETE SET NULL         |
| type                   | text NOT NULL | 'charge', 'payment', 'spending' (default charge) |
| issued_at              | date NULL     | Fecha emisión (cobros)                           |
| payment_method         | text NULL     | cash, transfer, card, client_card, other         |
| paid_by                | text NULL     | me, client, other (spendings)                    |
| expect_reimbursement   | boolean       | default false                                    |
| reimburse_to_client_id | uuid NULL     | FK clients ON DELETE SET NULL                    |
| receipt_file_id        | uuid NULL     | FK project_files ON DELETE SET NULL              |
| budget_item_id         | uuid NULL     | FK budget_items ON DELETE SET NULL               |

### Document Hub

- Añadir categoría `receipt` a `project_document_category_enum` si no existe (o usar `invoice`).
- Vista/carpeta especial “Receipts & tickets” por proyecto: archivos con id en (SELECT receipt_file_id FROM billings WHERE project_id = ?). En esa vista: renombrar sí; eliminar/mover no.

### Índices

- billings: (project_id, category_id), (project_id, type), (budget_item_id) si se filtra por ello.
- billing_reminders: (owner_id, remind_at).

---

## 5. Fases de implementación (orden sugerido)

| Fase       | Contenido                                                                                                                                                                                                    | Dependencias                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **Fase 1** | Categorías por usuario: tabla `billing_categories`, seed por defecto, CRUD categorías, columna `category_id` en billings, select en formulario, filtro por categoría. Gestión de categorías (modal o vista). | Ninguna                     |
| **Fase 2** | Filtros: por estado, por categoría, por rango de fechas (en cliente).                                                                                                                                        | Fase 1                      |
| **Fase 3** | Tipo de billing (charge/payment/spending), issued_at, payment_method, paid_by, expect_reimbursement, reimburse_to_client_id. UI condicional por tipo.                                                        | Ninguna                     |
| **Fase 4** | Recibos: receipt_file_id, upload desde Billing, carpeta “Receipts & tickets” en Documents (solo lectura de eliminación, renombrar/ver/descargar). Reemplazar/quitar recibo desde Billing.                    | Document Hub, project_files |
| **Fase 5** | UX: MutationErrorDialog, modal create/edit, mejoras tabla/cards.                                                                                                                                             | Ninguna                     |
| **Fase 6** | Vínculo Budgets: budget_item_id, selector solo ítems del proyecto actual.                                                                                                                                    | Budgets existente           |
| **Fase 7** | Recordatorios: tabla billing_reminders, UI en create/edit billing, widget “Próximos recordatorios” al top del tab Billings.                                                                                  | Ninguna                     |
| **Fase 8** | Export: por período (mes, año), por categoría; server action o API route CSV.                                                                                                                                | Fase 1, 2                   |

El orden se puede ajustar (ej. Fase 4 antes que 2 si priorizan recibos). Fase 5 puede hacerse en paralelo o después de 1–3.

---

## 6. Riesgos y consideraciones

- **Categorías por usuario:** Si un usuario borra una categoría que está en uso, `category_id` en billings queda SET NULL (o prohibir borrar si tiene billings). Definir política (ej. “desasignar” vs “no permitir borrar si hay billings”).
- **Receipts en Documents:** Archivos “reemplazados” desde Billing: decidir si el archivo viejo se oculta en “Receipts & tickets” (ej. ya no está en receipt_file_id) y si se puede eliminar desde Documents entonces (opcional).
- **Recordatorios:** Por ahora solo visualización en widget; notificaciones push/email quedan fuera de este plan.
- **i18n:** Añadir claves EN/ES para todos los nuevos labels (tipos, métodos de pago, paid_by, recordatorios, Receipts & tickets, etc.).
- **Performance:** Filtros en cliente; si crece la lista, valorar paginación o filtros server-side. Export puede ser server-side con filtros.

---

## 7. Checklist de aprobación (actualizado)

- [x] **A. Categorías** — por usuario, globales, con defaults y CRUD.
- [x] **B. Filtros** — por categoría, estado y rango de fechas.
- [x] **C. Recibos/tickets** — un archivo por bill, Document Hub, carpeta “Receipts & tickets” no eliminable desde Documents; eliminar/reemplazar solo desde Billing.
- [x] **D. UX** — MutationErrorDialog, modal, mejoras tabla/cards.
- [x] **E. Campos** — método de pago, issue date; tipo charge/payment/spending; para gastos: quién pagó y expectativa de reembolso.
- [x] **F. Export** — por período (mes, año), por categoría.
- [x] **G. Budgets** — vínculo con budget_item del proyecto actual.
- [x] **H. Recordatorios** — tabla + widget al top como “documentos recientes”.

**Notas:** Ejecución fase por fase; se puede ajustar orden de fases según prioridad.

---

## 8. Referencias

- `app/context/[projectId]/billings/`, `app/actions/billings.ts`
- `supabase/migrations/20260213120000_add_billings_module.sql`, `20260213121000_billings_add_client_and_overdue.sql`
- Document Hub: `20260224100000_document_hub.sql`, `20260224120000_document_hub_folders.sql`, `app/api/documents/[fileId]/view/route.ts`
- Documents widget: `ContextDocumentsClient.tsx` — sección “Recently opened”.
- Budgets: `supabase/migrations/202601250000_presupuestos.sql` (budgets, budget_categories, budget_items)
- AGENTS.md — MutationErrorDialog, window.open, data loading, RPC para multi-step
