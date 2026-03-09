# Plan: Copilot — acceso completo al módulo Budgets

**Creado:** 2026-03-08  
**Estado:** Diseño listo para implementación  
**Objetivo:** Que el Copilot pueda crear, editar y eliminar presupuestos, categorías e ítems dentro de un budget (no solo un budget con nombre y descripción).

---

## 1. Estado actual

### Lo que el Copilot puede hacer hoy

- **Crear budget:** una sola capacidad `budget` con `name` y `description`. El budget se asocia al proyecto actual vía `project_id` y `owner_id` en el approve.
- No puede: actualizar/eliminar un budget, ni crear/editar/eliminar categorías ni ítems dentro de un budget.

### Lo que ya existe en la app (sin Copilot)

- **Schema:** Las tablas `budgets`, `budget_categories` y `budget_items` ya existen con la estructura completa (ver `supabase/migrations/202601250000_presupuestos.sql`, `20260208120000_multi_user_projects_tasks_budgets.sql`, `20260201090000_add_budget_item_sort_order.sql`).
- **Acciones:** En `app/actions/budgets.ts` y `app/actions/budget-detail.ts` ya hay:
  - Budget: create, update, delete, getBudgetsByProjectId.
  - Categorías: createCategory, updateCategory, deleteCategory, reorderCategories.
  - Ítems: createItem, updateItem, deleteItem, deleteItems, reorderItems.
- **Contexto Copilot:** `fetchBudgetsContext` en `lib/copilot/registry/modules/budgets.ts` solo devuelve resumen por budget (nombre, totales). En scope `full` incluye IDs de budgets pero **no** IDs de categorías ni de ítems, y no muestra la jerarquía budget → categorías → ítems.

### Conclusión

El límite no es el producto (el módulo Budgets ya soporta categorías e ítems), sino que el Copilot solo tiene registrada la capacidad de **crear budget** y el contexto no expone IDs de categorías/ítems para que el modelo proponga mutaciones.

---

## 2. Objetivo (full access)

El Copilot debe poder proponer (y el usuario aprobar/rechazar):

| Entidad         | Crear          | Editar | Eliminar |
| --------------- | -------------- | ------ | -------- |
| Budget          | ✅ (ya existe) | Sí     | Sí       |
| Budget category | Sí             | Sí     | Sí       |
| Budget item     | Sí             | Sí     | Sí       |

Flujo típico que debe ser posible: _"Crea un presupuesto Party $2k con categorías Furniture, Food & Drinks y Decor, e ítems como Mesas $200, Sillas $200, Bebidas $350..."_ → el modelo emite varias propuestas (1 budget, N categorías, M ítems); el usuario aprueba por lotes o una a una.

---

## 3. Diseño técnico

### 3.1 Contexto (fetchBudgetsContext)

- **Scope `standard`:** Mantener resumen actual (nombre de budget, totales) para no inflar tokens.
- **Scope `full`:** Incluir jerarquía con IDs para que el modelo use `budget_id`, `category_id` y `entity_id`:
  - Por cada budget del proyecto: `[budget_id] Nombre · $X total...`
  - Bajo cada budget: lista de categorías con id: `Categories: [category_id] Nombre, ...`
  - Bajo cada categoría (o bajo el budget): ítems con id y línea: `Items: [item_id] Nombre · qty × price, ...`

Ejemplo de salida en full:

```text
## Budgets (2 total)
- [uuid-b1] Party $2k: $2,000 total · $0 acquired · $2,000 pending
  Categories: [uuid-c1] Furniture, [uuid-c2] Food & Drinks
  Items: [uuid-i1] Tables (10 × $20), [uuid-i2] Chairs (80 × $2.50), [uuid-i3] Drinks · $350
- [uuid-b2] Q2 Marketing: $5,000 total · $1,200 acquired · $3,800 pending
  Categories: [uuid-c3] Ads
  Items: [uuid-i4] Google Ads · $1,200
```

Así el modelo puede:

- Crear categoría: `budget_id` = uno de los listados.
- Crear ítem: `category_id` = uno de los listados.
- Update/delete: `entity_id` = id de budget, categoría o ítem según el tipo de propuesta.

### 3.2 Nuevos tipos de propuesta y payloads (schema)

Añadir en `lib/copilot/schema.ts`:

- **ProposalType:**  
  `update_budget`, `delete_budget`,  
  `budget_category`, `update_budget_category`, `delete_budget_category`,  
  `budget_item`, `update_budget_item`, `delete_budget_item`.

- **Payloads:**
  - **UpdateBudgetPayload:** `type: 'update_budget'`, `entity_id`, `entity_title?`, `name?`, `description?`, `project_id?`
  - **DeleteBudgetPayload:** `type: 'delete_budget'`, `entity_id`, `entity_title?`
  - **BudgetCategoryProposalPayload:** `type: 'budget_category'`, `budget_id`, `name`, `description?`
  - **UpdateBudgetCategoryPayload:** `type: 'update_budget_category'`, `entity_id`, `entity_title?`, `name?`, `description?`
  - **DeleteBudgetCategoryPayload:** `type: 'delete_budget_category'`, `entity_id`, `entity_title?`
  - **BudgetItemProposalPayload:** `type: 'budget_item'`, `category_id`, `name`, `description?`, `quantity?`, `unit_price?`, `link?`, `status?`, `notes?`
  - **UpdateBudgetItemPayload:** `type: 'update_budget_item'`, `entity_id`, `entity_title?`, `name?`, `description?`, `quantity?`, `unit_price?`, `link?`, `status?`, `notes?`
  - **DeleteBudgetItemPayload:** `type: 'delete_budget_item'`, `entity_id`, `entity_title?`

Incluir todos en la unión `ParsedProposal` y, si se usa, en el tipo `payload` de `CopilotProposal` donde corresponda.

### 3.3 Registry (lib/copilot/registry/modules/budgets.ts)

- **Validadores:** Uno por cada payload anterior (validar UUIDs para entity_id, budget_id, category_id; nombres no vacíos; números válidos para quantity/unit_price; status en `pending`|`quoted`|`acquired`).
- **Approve:**
  - **update_budget:** `supabase.from('budgets').update(...).eq('id', entity_id).eq('owner_id', userId)` (y revalidar paths).
  - **delete_budget:** delete por id + owner_id.
  - **budget_category:** insert en `budget_categories` con `budget_id`, `name`, `description`, `sort_order` (siguiente disponible); comprobar que `budget_id` pertenece al usuario (vía budgets.owner_id o RLS).
  - **update_budget_category / delete_budget_category:** update/delete por `entity_id` asegurando que la categoría pertenece a un budget del usuario (existente en app vía RLS).
  - **budget_item:** insert en `budget_items` con `category_id`, name, description, quantity, unit_price, link, status, notes, sort_order; comprobar que la categoría pertenece a un budget del usuario.
  - **update_budget_item / delete_budget_item:** update/delete por `entity_id` con comprobación de pertenencia vía categoría → budget → owner.

- **Contexto:** Implementar la nueva estructura de `fetchBudgetsContext` para scope `full` como en 3.1 (budgets con ids, categorías con ids, ítems con ids).
- **Capabilities:** Registrar las 9 capacidades (budget ya existe; añadir update_budget, delete_budget, budget_category, update_budget_category, delete_budget_category, budget_item, update_budget_item, delete_budget_item) en `budgetsCapabilities` con labelKey, icon, cardVariant, promptDescription, examplePayload, validate, approve, revalidatePaths (incluir `/context/${projectId}/budgets` y ruta de detalle si aplica).

### 3.4 Migración

Nueva migración que amplíe el CHECK de `copilot_proposals.type` para incluir:

`update_budget`, `delete_budget`, `budget_category`, `update_budget_category`, `delete_budget_category`, `budget_item`, `update_budget_item`, `delete_budget_item`.

(Patrón: igual que `20260308140000_copilot_proposals_add_billing_category_types.sql`.)

### 3.5 Prompt (lib/copilot/context.ts)

Añadir reglas en la sección de proposals:

- **update_budget:** `entity_id` = UUID del budget (listado en Budgets en full). Opcionales: name, description, project_id.
- **delete_budget:** `entity_id` = UUID del budget. Incluir entity_title para mostrar.
- **budget_category:** `budget_id` = UUID del budget (en full). name obligatorio; description opcional.
- **update_budget_category / delete_budget_category:** `entity_id` = UUID de la categoría (en full bajo cada budget). Para delete, entity_title opcional.
- **budget_item:** `category_id` = UUID de la categoría (en full). name obligatorio; description, quantity (default 1), unit_price (default 0), link, status (pending|quoted|acquired), notes opcionales.
- **update_budget_item / delete_budget_item:** `entity_id` = UUID del ítem (en full). Para update, solo los campos a cambiar.

Indicar que los IDs de budgets, categorías e ítems solo están disponibles en **full context**; para crear categorías/ítems el modelo debe usar los IDs que aparecen en la sección Budgets.

### 3.6 Card renderers e i18n

- **components/context/copilot/card-renderers/index.ts:** Añadir entrada en `PROPOSAL_TYPE_CONFIG` para cada nuevo tipo: labelKey, Icon (Wallet/Pencil/Trash2/Folder/List según convenga), cardVariant (create/update/delete), getViewLink → `/context/${projectId}/budgets` o `/budgets/${budgetId}` cuando tengamos entity_id de un budget, viewLinkLabelKey (ej. `created_view_budgets`). Para create category/item, getTitle puede ser el name o "Category X" / "Item Y".
- **locales (en.json, es.json):** Añadir claves bajo `copilot` para cada label y, si hace falta, para el enlace "Ver en presupuestos" (ej. `created_view_budgets`, `proposal_budget_category`, etc.).

### 3.7 Orden de creación y lotes

- El modelo debe emitir **primero** un budget si el usuario pide "un presupuesto con categorías e ítems". En el mismo mensaje puede proponer solo el budget; en el siguiente mensaje (con el budget ya creado y su id en contexto) puede proponer categorías con ese `budget_id`, y luego ítems con esos `category_id`.
- Alternativa: en un solo bloque <<PROPOSALS>> el modelo puede emitir 1 budget + N categorías + M ítems si las categorías/ítems referencian un budget/categoría **por título** y el backend resuelve título → id (más complejo). Recomendación: no implementar resolución por título en la v1; el flujo "aprobar budget → siguiente mensaje con categorías" es suficiente y claro.
- Recordar límite de 8 propuestas por respuesta; para presupuestos grandes el modelo puede decir "Aquí el budget y las categorías; aprueba y envío el siguiente lote con los ítems."

---

## 4. Checklist de implementación

- [ ] **Schema:** Tipos y payloads en `lib/copilot/schema.ts`; unión `ParsedProposal`.
- [ ] **Contexto:** Reescribir/ampliar `fetchBudgetsContext` para full con jerarquía budgets → categories → items e IDs.
- [ ] **Registry:** Validadores + approve para update/delete budget, CRUD category, CRUD item; registrar las 9 capabilities (1 ya existe).
- [ ] **Migración:** CHECK de `copilot_proposals.type` con los 8 nuevos tipos.
- [ ] **Prompt:** Reglas en `lib/copilot/context.ts` para los 8 tipos.
- [ ] **Cards e i18n:** PROPOSAL_TYPE_CONFIG y claves en en.json / es.json.
- [ ] **Scoping y seguridad:** Asegurar que approve siempre filtre por owner (budgets.owner_id) o por existencia en proyecto del usuario; RLS ya ayuda pero no confiar solo en RLS.
- [ ] **Revalidación:** Tras approve de budget/category/item, revalidar `/context`, `/context/${projectId}/budgets`, `/budgets`, `/budgets/${budgetId}` según corresponda.

---

## 5. Referencias

- Schema budgets: `supabase/migrations/202601250000_presupuestos.sql`, `20260208120000_multi_user_projects_tasks_budgets.sql`, `20260201090000_add_budget_item_sort_order.sql`
- Acciones: `app/actions/budgets.ts`, `app/actions/budget-detail.ts`
- Copilot budgets actual: `lib/copilot/registry/modules/budgets.ts`
- Patrón de capacidades completas (billing categories): implementación reciente de `billing_category`, `update_billing_category`, `delete_billing_category` en registry, schema, prompt, cards e i18n.

---

## 6. Criterios de éxito

- Usuario puede pedir al Copilot "crea un presupuesto Party $2k con categorías Furniture, Food, Decor e ítems Mesas $200, Sillas $200, Bebidas $350..." y recibir propuestas de budget, categorías e ítems que pueda aprobar.
- Tras aprobar, el budget aparece en el módulo Presupuestos con las categorías e ítems correctos.
- Usuario puede pedir "edita el ítem X a $400" o "elimina la categoría Y" y recibir propuestas de update/delete que, al aprobar, actualizan o borran en la app.
- No se requieren refrescos manuales; la revalidación de paths mantiene la UI al día.
