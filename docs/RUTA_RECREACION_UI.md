# Ruta de recreación UI/UX (más de 72 archivos)

Este documento recopila **todo** lo que se implementó en el chat (~3 horas) para que se pueda volver a aplicar de forma sistemática. Incluye lo que ya está en el resumen del chat y lo que tú describes: headers normalizados, sidebar colapsable, vistas singulares sin sidebar (solo botón volver), FABs, formularios verticales y compactos, y cambios generales de interfaz.

---

## 1. Resumen de alcance (lo que hay que recrear)

- **Headers normalizados**: Misma estructura y estilo en todas las pantallas (título, acciones, búsqueda cuando aplique).
- **Sidebar colapsable**: En desktop se puede colapsar a iconos (localStorage); en móvil drawer con overlay. _(Parcialmente hecho.)_
- **Vistas singulares (detalle)**: En proyecto, presupuesto, lista de ideas, cliente, empresa, nota, etc. **no se muestra el Sidebar**; solo un **botón “Volver atrás”** y un header compacto/normalizado.
- **Floating Action Buttons (FABs)**: Añadidos donde tiene sentido (por ejemplo: añadir tarea en Kanban, añadir ítem en presupuesto, añadir negocio a cliente, etc.).
- **Formularios de creación/edición**: Clientes, empresas, ítems (y similares) en **layout vertical**, **ocupando menos espacio** (sin grids de 2–3 columnas amplios).
- **Panel de recursos del proyecto**: Columna derecha en vista de proyecto (Presupuestos, Notas, Ideas, Listas); en móvil modal. _(Hecho.)_
- **Kanban**: En pantallas grandes columnas horizontales; en pequeñas acordeón; columnas colapsables en desktop. _(Hecho.)_
- **Modal “Editar tablero” (Ideas)**: onSubmit, estados de guardado/error, cierre al éxito. _(Hecho.)_
- **Locales**: Claves `resources.*`, `sidebar.collapse`/`expand`, `kanban.tasks_count_one`, etc. _(Hecho.)_

---

## 2. Rutas por fases (orden sugerido para ejecutar en automático)

### Fase A: Layout base y componente “Detail”

**A1. Componente `DetailLayout` (o `DetailPageLayout`)**

- Crear un layout reutilizable para **vistas singulares**:
  - Sin Sidebar.
  - TopBar simplificada o header normalizado: solo “Volver” (ArrowLeft + texto) + título (y opcionalmente acciones a la derecha).
  - Contenido en `flex-1 overflow-y-auto`.
- Props sugeridas: `backHref`, `backLabel`, `title`, `children`, `actions?`.

**A2. Componente `DetailHeader` (opcional)**

- Header normalizado para detalle: botón volver + título + zona de acciones.
- Misma apariencia en todas las vistas singulares.

**A3. Actualizar TopBar (o crear variante “compact”)**

- Para uso en DetailLayout: sin búsqueda global si no aplica, sin menú de proyecto; solo volver + título + sign out / menú mínimo.
- O: en detalle no usar TopBar completa y usar solo `DetailHeader` dentro de `DetailLayout`.

---

### Fase B: Vistas singulares → quitar Sidebar y usar “Volver”

En cada una de estas rutas/páginas, **quitar** el `<Sidebar />` y envolver el contenido en `DetailLayout` (o equivalente) con **botón “Volver atrás”** y header normalizado.

| #   | Ruta / archivo                                                                     | Back link / label (i18n)                                           |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| B1  | `app/project/[id]` → redirect a `/context/[id]/board` (board = ContextBoardClient) | N/A (redirección); en contexto: “Todos los proyectos” → `/context` |
| B2  | `app/budgets/[id]` → `BudgetDetailClient`                                          | `budgets.back_to_budgets`                                          |
| B3  | `app/clients/[id]` → `ClientDetailClient`                                          | `clients.back_to_clients`                                          |
| B4  | `app/businesses/[id]` → `BusinessDetailClient`                                     | `businesses.back_to_businesses`                                    |
| B5  | `app/notes/[id]` → `NoteDetailClient`                                              | `notes.back_to_notes` (ya existe en editor)                        |
| B6  | `app/todo/list/[listId]` → `ListBoardClient`                                       | `todo.back_to_todo`                                                |
| B7  | `app/ideas/boards/[id]` → `BoardDetailClient`                                      | Volver a Ideas / tableros                                          |

Para cada uno:

- Eliminar import y uso de `Sidebar`.
- Eliminar la estructura `TopBar + div con Sidebar + contenido`.
- Usar `DetailLayout` con `backHref` y `backLabel` correctos, y el título de la entidad (nombre del proyecto, presupuesto, cliente, etc.).
- Mover el “back” que ya existía dentro del contenido al header del layout (para no duplicar).

---

### Fase C: Floating Action Buttons (FABs)

Añadir FAB donde corresponda (estilo: `fixed bottom-6 right-6 z-40 rounded-full bg-primary ...` como en el board de contexto):

| #   | Ubicación                                                             | Acción del FAB                                        |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| C1  | Board en contexto (`/context/[projectId]/board` → ContextBoardClient) | Ya existe: FAB abre Add Task.                         |
| C2  | `BudgetDetailClient`                                                  | Añadir categoría o “Añadir ítem” (según UX acordada). |
| C3  | `ClientDetailClient`                                                  | “Añadir negocio” (o “Nueva empresa”).                 |
| C4  | `ListBoardClient` (lista de tareas)                                   | “Añadir tarea” o “Nueva tarea”.                       |
| C5  | `BudgetsPageClient` (lista de presupuestos)                           | “Crear presupuesto”.                                  |
| C6  | `ClientsPageClient`                                                   | “Añadir cliente”.                                     |
| C7  | `BusinessesPageClient`                                                | “Añadir empresa”.                                     |
| C8  | `NotesPageClient`                                                     | “Nueva nota”.                                         |
| C9  | Otros listados (Ideas, Todo dashboard, etc.)                          | Según patrón: FAB = acción principal.                 |

Cada FAB debe abrir el modal o pantalla correspondiente (modal de creación, etc.).

---

### Fase D: Formularios verticales y compactos

Objetivo: **una columna**, menos espacio; sin `grid grid-cols-2` o `grid-cols-3` amplios.

**D1. CreateClientModal**

- Cambiar layout a **una columna**: `space-y-3` o `space-y-4`; cada campo en bloque (label + input).
- Eliminar `grid grid-cols-2` y `grid grid-cols-3`; poner campos en filas separadas (p. ej. teléfono, email, ciudad, estado, código postal cada uno en su fila).
- Reducir padding si hace falta para que “ocupe menos espacio”.

**D2. EditClientModal**

- Mismo criterio: formulario vertical, sin grids de 2/3 columnas.

**D3. CreateBusinessModal**

- Igual: layout vertical, campos en una columna.

**D4. EditBusinessModal**

- Igual: vertical y compacto.

**D5. CreateItemModal (presupuesto)**

- Ítems de presupuesto: formulario vertical y compacto.

**D6. CreateCategoryModal**

- Vertical y compacto.

**D7. Resto de modales de creación/edición**

- Aplicar el mismo patrón (vertical, poco espacio) en cualquier otro modal de creación/edición que se haya tocado (p. ej. EditBudgetModal, CreateBudgetModal, etc.).

---

### Fase E: Headers normalizados

**E1. Definir patrón de header**

- Listas (dashboard, presupuestos, clientes, empresas, notas, todo, ideas): TopBar actual con título de sección, búsqueda si aplica, acciones (y en móvil menú + Recursos si aplica).
- Detalle: `DetailHeader` con volver + título + acciones.

**E2. Aplicar en todas las pantallas**

- Revisar cada página que use TopBar o un título grande y unificar:
  - Misma altura/zona de header.
  - Mismo estilo de “Volver” (icono + texto).
  - Mismo estilo de título (tamaño, peso).
  - Acciones alineadas a la derecha de forma consistente.

---

### Fase F: Ajustes ya hechos (solo verificar)

- Sidebar: colapsable en desktop, drawer en móvil, botón colapsar/expandir. _(Hecho.)_
- Kanban: `useIsLargeScreen`, acordeón en móvil, columnas colapsables en desktop. _(Hecho.)_
- Column: props `accordion`, `isExpanded`, `onToggle`, tira colapsada. _(Hecho.)_
- Board en contexto: ContextBoardClient con KanbanBoard, FAB Add Task, AddTaskModal. _(Vista antigua ProjectKanbanClient/ProjectResourcesPanel eliminada; ver plan-kanban-optimistic-no-refresh.md.)_
- TopBar: botón Recursos, ProjectResourcesModal, `resourcesInSidebar`, menú móvil. _(Hecho.)_
- IdeasDashboardClient: modal Editar tablero con onSubmit, isSavingBoard, boardEditError. _(Hecho.)_
- Locales: `resources.*`, `sidebar.collapse`/`expand`, `kanban.tasks_count_one`. _(Hecho.)_

---

## 3. Lista de archivos a tocar (estimada)

- **Nuevos**: `DetailLayout.tsx`, opcionalmente `DetailHeader.tsx`, posible variante de TopBar para detalle.
- **Layout / detalle**: Board = ContextBoardClient (contexto); `BudgetDetailClient`, `ClientDetailClient`, `BusinessDetailClient`, `NoteDetailClient`, `ListBoardClient`, `BoardDetailClient` (ideas).
- **FABs**: Los mismos archivos de detalle/listado más `BudgetsPageClient`, `ClientsPageClient`, `BusinessesPageClient`, `NotesPageClient`, etc.
- **Formularios**: `CreateClientModal`, `EditClientModal`, `CreateBusinessModal`, `EditBusinessModal`, `CreateItemModal`, `CreateCategoryModal`, y otros modales de creación/edición que sigan el mismo patrón.
- **Headers**: Cualquier página que tenga TopBar o título de sección (dashboard, ideas, todo, settings, billings, etc.).
- **Locales**: Añadir claves que falten para “Volver” y títulos si se extraen a i18n.

Total estimado: **más de 72 archivos** si se cuentan todos los listados, detalles, modales y páginas de configuración.

---

## 4. Cómo usar esta ruta en automático

1. **Fase A**: Implementar `DetailLayout` (y opcionalmente `DetailHeader` / TopBar compacta).
2. **Fase B**: Ir ruta por ruta (B1–B7) sustituyendo Sidebar por DetailLayout + back.
3. **Fase C**: Añadir FABs en cada pantalla indicada (C1–C9).
4. **Fase D**: Refactorizar cada modal de formulario a vertical y compacto (D1–D7 y resto).
5. **Fase E**: Revisar y unificar headers en todas las pantallas.
6. **Fase F**: No rehacer; solo comprobar que lo ya hecho sigue igual.

Se puede ejecutar por fases en orden (A → B → C → D → E) y marcar cada ítem como hecho para no perder el hilo.

---

## 5. Confirmación de entendimiento

- **Headers**: Normalizados en listas y en detalle (volver + título + acciones).
- **Sidebar**: Colapsable en desktop; en vistas **singulares** (proyecto, presupuesto, cliente, empresa, nota, lista de tareas, tablero de ideas) **no se muestra**; solo botón “Volver atrás”.
- **FABs**: Añadidos en Kanban de proyecto, detalle de presupuesto, detalle de cliente, lista de tareas, y en listados principales (presupuestos, clientes, empresas, notas, etc.) para la acción principal.
- **Formularios**: Creación/edición de clientes, empresas, ítems (y similares) en **vertical** y **compactos** (menos espacio, sin grids amplios).

Si algo no coincide con lo que tenías hace 3 horas, se puede ajustar esta ruta y luego ejecutarla de nuevo en automático.
