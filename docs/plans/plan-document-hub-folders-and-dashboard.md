# Document Hub — Carpetas, Recently Opened Widget y Dashboard

**Fecha:** 2026-02-24  
**Estado:** Plan aprobado — ejecución por fases  
**Objetivo:** Organizar documentos por carpetas, widget de recientes arriba y dashboard con búsqueda/filtros.

---

## 1. Contexto y motivación

- **Problema:** En proyectos con muchos documentos (ej. construcción: planos, change orders, etc.) la lista plana se vuelve un desorden.
- **Ya tenemos:** Lista de documentos, categorías, tags, “recently opened” (top 5 en orden), subida simple y bulk.
- **Necesitamos:**
  1. **Carpetas** (folders): el usuario crea carpetas y asigna documentos a carpetas (no son categorías; son contenedores).
  2. **Widget arriba:** “Recently opened documents” (los mismos 5 que ya ordenamos) como sección destacada al tope de la vista.
  3. **Dashboard:** Vista de carpetas + archivos con barra de búsqueda y filtros (tags, categoría).

Este documento define el plan por fases para implementar todo eso.

---

## 2. Alcance por fases

| Fase       | Nombre corto                          | Entregable principal                                                                                 |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Fase 1** | Carpetas (modelo + CRUD + asignación) | Tabla `project_document_folders`, CRUD carpetas, subir/mover documento a carpeta, vista por carpetas |
| **Fase 2** | Widget Recently Opened                | Sección fija arriba con “Últimos 5 abiertos” (diseño tipo project picker)                            |
| **Fase 3** | Dashboard + búsqueda y filtros        | Vista tipo dashboard: carpetas + archivos, searchbar, filtros por tags y categoría                   |

Cada fase es ejecutable de forma independiente; la Fase 2 y 3 dependen del modelo de la Fase 1 solo en que los documentos pueden tener `folder_id` (en Fase 1 se implementa; en Fase 2/3 se usa si aplica).

---

## 3. Fase 1 — Carpetas

### 3.1 Modelo de datos

- **Nueva tabla: `project_document_folders`**
  - `id` UUID PK
  - `project_id` UUID NOT NULL → `projects(id)` ON DELETE CASCADE
  - `owner_id` UUID NOT NULL → `auth.users(id)` ON DELETE CASCADE
  - `name` TEXT NOT NULL
  - `sort_order` INT NOT NULL DEFAULT 0 (para ordenar carpetas en la UI)
  - `created_at`, `updated_at`
  - RLS: mismo patrón que `project_files` (owner_id = auth.uid())
  - Índices: `(project_id, sort_order)`, `(owner_id)`

- **Cambio en `project_files`**
  - Añadir `folder_id` UUID NULL → `project_document_folders(id)` ON DELETE SET NULL
  - Documentos sin carpeta: `folder_id IS NULL` (“raíz” del proyecto)
  - Índice: `(project_id, folder_id)` para listar por carpeta

- **Sin subcarpetas en v1:** No `parent_id` en folders; una sola jerarquía plana (carpetas a un nivel). Si más adelante se pide anidamiento, se añade `parent_id` en una migración posterior.

### 3.2 Server actions (Fase 1)

- **Folders**
  - `listFolders(projectId)` — listar carpetas del proyecto (orden por `sort_order`, `name`). Cacheable con `cache()`.
  - `createFolder(projectId, name)` — crear carpeta, devolver fila. Revalidar paths de documents.
  - `updateFolder(folderId, { name?, sort_order? })` — renombrar / reordenar.
  - `deleteFolder(folderId)` — borrar carpeta; los documentos quedan con `folder_id = NULL` (SET NULL). Revalidar.

- **Documents**
  - En `uploadDocument` / `uploadDocumentsBulk`: aceptar opcional `folder_id` (nullable). Si viene, insertar con ese `folder_id`.
  - En `updateDocument`: aceptar `folder_id?: string | null` para mover documento a otra carpeta o a raíz.
  - `getDocuments(projectId, folderId?: string | null)`: si se pasa `folderId`, filtrar `folder_id = folderId` (o `folder_id IS NULL` si `folderId === null`). Mantener orden “recent” + resto como hoy para la lista que se use en cada contexto.

### 3.3 Cache (Fase 1)

- Añadir clave de caché para carpetas: `{ type: 'documentFolders', projectId }`.
- Después de create/update/delete folder: invalidar esa clave y la de documentos del proyecto si se revalida lista.
- Mantener `{ type: 'documents', projectId }` para la lista “global” (o listas por carpeta según cómo se consuma en la UI).

### 3.4 UI (Fase 1)

- **Vista Documentos (estructura preparatoria para Fase 2 y 3):**
  - Opción A (recomendada para Fase 1): mantener lista actual pero añadir **selector de carpeta** (dropdown o tabs: “Todos” | Carpeta 1 | Carpeta 2 | …). Al elegir “Todos” se listan documentos con `folder_id IS NULL` + opcionalmente “sin carpeta” si se quiere; al elegir una carpeta, se listan solo los de esa carpeta. En ambos casos orden “recent” + resto.
  - Crear carpeta: botón “Nueva carpeta” que abre modal/dialog (solo nombre). Al crear, se invalida caché de folders y se puede dejar seleccionada la nueva carpeta.
  - Subir documento: en el diálogo de subida (simple y bulk), añadir campo opcional “Carpeta” (dropdown). Por defecto “Ninguna” (raíz).
  - Editar documento: en el diálogo de edición, añadir “Carpeta” (dropdown) para mover el archivo.
  - Lista: si hay carpetas, mostrar al menos un control para filtrar por carpeta (y luego en Fase 3 el dashboard mostrará las carpetas como bloques).

- **Mínimo viable Fase 1:** CRUD carpetas + `folder_id` en upload/update + lista filtrable por carpeta (dropdown “Todos” / “Carpeta X”) sin cambiar aún el layout a “widget + dashboard”.

### 3.5 Migración (Fase 1)

- Nueva migración: `YYYYMMDDHHMMSS_document_hub_folders.sql`
  - Crear tabla `project_document_folders` con RLS e índices.
  - ALTER `project_files` ADD COLUMN `folder_id`; FK y ON DELETE SET NULL; índice.
  - Trigger `updated_at` en `project_document_folders` si no existe.

---

## 4. Fase 2 — Widget “Recently Opened Documents”

### 4.1 Objetivo

- Sección fija **arriba** de la vista de Documentos que muestre solo los **últimos 5 documentos abiertos** (mismo criterio que hoy: `last_opened_at ?? created_at` desc, max 5).
- Diseño inspirado en el project picker: tarjetas o filas compactas con indicador visual (ej. icono de reloj / borde primario) y mismo texto “Recently opened” (i18n existente).

### 4.2 Datos

- Reutilizar la misma lista que ya devuelve `getDocuments(projectId)` (ordenada con “recent” primero). En el cliente, tomar `documents.slice(0, 5)` para el widget.
- No hace falta nuevo endpoint ni nueva clave de caché: un solo fetch de documentos y, en UI, una sección “Recently opened” (primeros 5) y debajo el resto (o el dashboard en Fase 3).

### 4.3 UI

- Arriba del contenido principal:
  - Título/sección: “Recently opened” (o clave i18n tipo `documents.recently_opened_section`).
  - 5 slots: tarjetas o filas compactas (click abre documento). Si hay menos de 5, solo mostrar los que haya.
  - Mismo estilo “recent” que en project picker: borde izquierdo primario, icono de reloj.
- Debajo: el resto de la vista (en Fase 1 sería la lista filtrable por carpeta; en Fase 3 será el dashboard con carpetas + búsqueda/filtros).

### 4.4 Dependencias

- Solo depende de que la lista de documentos siga teniendo el orden “recent first” (ya implementado). Fase 2 puede hacerse sin Fase 1 si no se muestra carpeta en el widget; con Fase 1 se puede mostrar la carpeta en cada tarjeta si se desea.

---

## 5. Fase 3 — Dashboard con carpetas, búsqueda y filtros

### 5.1 Objetivo

- **Vista tipo dashboard** debajo del widget “Recently opened”: bloques por carpeta (y un bloque “Sin carpeta” si hay documentos en raíz).
- **Barra de búsqueda:** filtrar documentos por texto (título, descripción o tags).
- **Filtros:** por categoría (document_category) y/o por tags (multiselect o chips). Opcional: “Solo finales”.

### 5.2 Datos

- **Carpetas:** `listFolders(projectId)` (Fase 1).
- **Documentos por carpeta:** Opción 1) `getDocuments(projectId)` y en cliente agrupar por `folder_id` y aplicar búsqueda/filtros. Opción 2) Nuevo getter que devuelva documentos agrupados por carpeta (ej. `getDocumentsGroupedByFolder(projectId)`). Para búsqueda/filtros en cliente, Option 1 es suficiente en v1; si la cantidad crece mucho, se puede mover filtro a servidor en una iteración posterior.
- **Búsqueda:** en cliente filtrar por `title`, `description`, `tags` (incluye término). Case-insensitive, trim.
- **Filtros:** en cliente filtrar por `document_category` (uno o varios) y por intersección de tags seleccionados.

### 5.3 UI

- Debajo del widget “Recently opened”:
  - **Searchbar:** input de búsqueda (placeholder “Buscar documentos…”). Al escribir, filtrar la lista/agrupación en tiempo real (o con debounce 300 ms).
  - **Filtros:** dropdowns o chips para “Categoría” (multi?) y “Tags” (multi?). Botón “Limpiar filtros”.
  - **Dashboard de carpetas:** cada carpeta es un bloque (card o sección) con nombre de carpeta y dentro la lista de documentos que pertenecen a esa carpeta (ya filtrados por búsqueda y filtros). Un bloque “Sin carpeta” para `folder_id IS NULL`.
  - Dentro de cada bloque, documentos en el mismo orden “recent” + resto (o solo por fecha si se prefiere simplicidad).
  - Si no hay carpetas: un solo bloque “Todos los documentos” con la lista filtrada.

### 5.4 Performance

- Si en un proyecto hay muchos documentos (cientos), considerar:
  - Paginación por carpeta o virtualización.
  - Mover búsqueda/filtros a servidor (RPC o query con `ilike`, `contains` para tags).
    Fase 3 puede empezar con filtrado en cliente y luego optimizar si hace falta.

---

## 6. Orden de ejecución recomendado

1. **Fase 1** — Carpetas (modelo, CRUD, asignación en upload/edit, lista por carpeta). Base para todo lo demás.
2. **Fase 2** — Widget “Recently opened” arriba. Mejora UX inmediata sin depender del dashboard.
3. **Fase 3** — Dashboard + búsqueda + filtros. Aprovecha carpetas y widget ya existentes.

---

## 7. Resumen de entregables por fase

| Fase  | Entregables                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Migración `project_document_folders` + `folder_id` en `project_files`; RLS e índices; server actions folders (list, create, update, delete) y documentos (upload/update con folder_id, getDocuments con folderId opcional); caché folders; UI: CRUD carpetas, selector de carpeta en upload/edición, lista filtrable por carpeta. |
| **2** | Sección “Recently opened” arriba con hasta 5 documentos (mismo orden que hoy); estilo tipo project picker (borde + icono reloj).                                                                                                                                                                                                  |
| **3** | Searchbar; filtros por categoría y tags; vista dashboard por carpetas (bloques) + bloque “Sin carpeta”; filtrado en cliente (v1).                                                                                                                                                                                                 |

---

## 8. Referencias

- Document Hub actual: `app/context/[projectId]/documents/`, `app/actions/documents.ts`, `components/context/documents/`.
- Diseño previo: `docs/pre-build/document-hub-design.md`.
- Patrones: `docs/patterns/context-session-cache.md`, `docs/patterns/server-actions.md`, `docs/patterns/database-queries.md`.
- Project picker (recent style): `app/context/ContextProjectPicker.tsx` (MAX_RECENT_HIGHLIGHT, Clock icon, border-l-primary).

Cuando quieras ejecutar una fase, se puede partir de este plan y bajar al detalle de archivos y nombres de funciones en esa fase.
