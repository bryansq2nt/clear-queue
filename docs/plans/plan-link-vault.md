# Plan: Módulo Link Vault (Enlaces)

**Objetivo:** Añadir un módulo **Link Vault** en el contexto de proyecto: un tab **"Links" / "Enlaces"** después de **Notes** donde el usuario pueda mantener una bitácora de enlaces (herramientas, referencias, sitios) organizados por categorías/secciones y tags, con la posibilidad de **abrir una categoría entera en pestañas nuevas** con un solo clic.

**Referencia:** Documento _Project Vaults + Timeline — Final Plan and PR1 Foundation Execution_ (schema y comportamientos de Link Vault). Este plan adapta y ejecuta **solo la parte Link Vault** y decide la ubicación del tab según lo solicitado.

---

## Reglas y patrones obligatorios (este módulo)

El módulo Link Vault **debe** respetar la arquitectura y las reglas ya establecidas en el repo. Referencias: **`.cursorrules`** y **`docs/patterns/`**.

### Traducciones (i18n)

- **Siempre** español e inglés. Todas las cadenas visibles para el usuario deben venir de `locales/es.json` y `locales/en.json` (claves bajo `context` y una sección `links` o `context_links`).
- Añadir las claves necesarias en **ambos** archivos antes o junto con la UI que las use. No dejar texto hardcodeado en el componente.

### Cache de sesión (no rehacer peticiones)

- Usar el **Context Session Cache** existente (`ContextDataCacheProvider` en `app/context/layout.tsx`). Añadir clave `{ type: 'links', projectId }`.
- **Al volver** al tab Links desde otro tab o proyecto, si ya hay datos en cache para ese `projectId`, **no** hacer nueva petición: mostrar datos desde cache.
- Patrón: wrapper `ContextLinksFromCache` que lee cache; si hay hit → renderizar con datos cacheados; si miss → **shimmer skeleton** (nunca spinner ni "Loading...") + server action, luego `cache.set` y render. Referencia: `docs/patterns/context-session-cache.md`.

### Sin refresh en insert/update; todo del lado del servidor

- **No** usar `router.refresh()` ni llamar a `load*()` después de una mutación en el mismo handler. Patrón: las mutaciones devuelven `{ data?, error? }`; el cliente usa los datos devueltos **o** llama a `onRefresh()` que invalida el cache y vuelve a cargar en el wrapper (sin recargar toda la página).
- **Server actions:** `revalidatePath` después de cada mutación; **nunca** depender de un refetch manual desde el cliente como única forma de actualizar. El cliente actualiza la UI vía: (1) datos devueltos por la acción (p. ej. añadir el nuevo link al estado local), o (2) `onRefresh()` que invalida cache y hace un único refetch en el wrapper y pasa nuevos datos al cliente. Referencia: `docs/patterns/server-actions.md`.
- **No** hacer fetch inicial en el cliente con `useEffect`; los datos iniciales vienen del servidor (page o FromCache en cache miss). Referencia: `docs/patterns/data-loading.md`.

### Loading: siempre efecto shimmer (nunca spinners ni "Loading...")

- **Siempre** usar **efecto shimmer** para cualquier estado de carga: placeholders tipo skeleton con animación shimmer que imiten la estructura del contenido real. Así el sistema se siente fluido.
- **Nunca** usar spinners ni texto "Loading..." (o similar) para loading. Prohibido.
- En cache miss o carga inicial: mostrar skeletons con shimmer; al llegar los datos, reemplazar por el contenido. No overlays de carga a pantalla completa.
- En mutaciones (p. ej. guardar en un sheet): usar `useTransition` solo en el control que dispara (botón deshabilitado o estado "Guardando..." en el botón), **no** overlay ni spinner global. Tras éxito: cerrar sheet y actualizar lista con datos devueltos o `onRefresh()`.

### Resumen de referencias

| Tema                                                     | Dónde                                    |
| -------------------------------------------------------- | ---------------------------------------- |
| Reglas globales                                          | `.cursorrules`                           |
| Carga de datos (servidor, cache(), props)                | `docs/patterns/data-loading.md`          |
| Acciones de servidor (revalidatePath, return data)       | `docs/patterns/server-actions.md`        |
| Queries (select explícito, project_id, owner_id)         | `docs/patterns/database-queries.md`      |
| Cache de sesión (FromCache, provider, onRefresh)         | `docs/patterns/context-session-cache.md` |
| Loading (shimmer siempre; nunca spinner ni "Loading...") | `.cursorrules` → Loading States          |

---

## 1. Resumen del documento original

### Qué es el Link Vault (según el doc)

- **Tabla:** `public.project_links` (no confundir con `idea_project_links`, que vincula ideas a proyectos).
- **Propósito:** Bitácora de enlaces por proyecto: herramientas en línea, referencias, recursos.
- **Enums:**
  - `project_link_type_enum`: `environment`, `tool`, `resource`, `social`, `reference`, `other`
  - `project_link_section_enum`: `delivery`, `infrastructure`, `product`, `marketing`, `operations`, `client`, `other`
- **Campos relevantes:** `project_id`, `owner_id`, `title`, `description`, `url`, `provider`, `link_type`, `section`, `tags[]`, `pinned`, `sort_order`, `open_in_new_tab`, `archived_at`, etc.
- **Comportamientos UI (doc):**
  - Mostrar por **section** (con cabeceras opcionales).
  - Links **pinned** primero.
  - Acción **"Abrir todos en sección"** (abre en ventanas nuevas del navegador los links no archivados de esa sección).

### Diferencia importante: ubicación del tab

| Documento original                                                           | Decisión para este plan                                                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Links como **sub-tab dentro de Files** (All / Media / Documents / **Links**) | **Tab principal en el context:** "Links" / "Enlaces" **después de Notes** en la barra de tabs del proyecto |

Motivo: el usuario necesita acceso directo a sus enlaces desde el contexto del proyecto, sin pasar por una página "Files" que además incluiría Media y Documents (no implementados aún). Un tab dedicado **Links** es más rápido y claro para el caso de uso "tener a mano herramientas y referencias".

Si más adelante se implementa la página Files (Media + Documents), se puede:

- Mantener el tab **Links** como está (recomendado para UX), y/o
- Incluir una sección/cards de links también en la vista "All" de Files, reutilizando los mismos datos.

---

## 2. Alcance de este plan

- **In scope:** Solo **Link Vault** (tab "Links", CRUD de enlaces, secciones, tags, pinned, "abrir todos en sección").
- **Out of scope en este plan:** Media Vault, Document Hub, Timeline, página Files unificada. La base de datos puede crecer después con `project_files` y `project_events` si se sigue el doc completo.

---

## 3. Arquitectura actual relevante

- **Rutas de contexto:** `/context/[projectId]/...` (no `/project/[id]/...` como en el doc).
- **Tabs actuales:** Board, Owner, **Notes**, Ideas, Budgets, Todos. Añadir **Links** después de Notes.
- **Patrones obligatorios:**
  - Datos iniciales en Server Component (`page.tsx`) o patrón FromCache con server action en cache miss.
  - Acciones con `'use server'`, `requireAuth()`, cliente Supabase desde `@/lib/supabase/server`, `revalidatePath` tras mutaciones.
  - Context session cache: clave `links:${projectId}`, provider en `app/context/layout.tsx`, wrapper `ContextLinksFromCache` y `onRefresh` tras mutaciones.
  - Queries con columnas explícitas y filtro por `project_id` y `owner_id`.

---

## 4. Schema de base de datos (solo Link Vault)

### 4.1 Enums

```sql
-- Tipos de enlace (tool, resource, reference, etc.)
CREATE TYPE public.project_link_type_enum AS ENUM (
  'environment', 'tool', 'resource', 'social', 'reference', 'other'
);

-- Secciones/categorías para agrupar y "abrir todos"
CREATE TYPE public.project_link_section_enum AS ENUM (
  'delivery', 'infrastructure', 'product', 'marketing', 'operations', 'client', 'other'
);
```

### 4.2 Tabla `public.project_links`

| Columna         | Tipo                      | Notas                                      |
| --------------- | ------------------------- | ------------------------------------------ |
| id              | uuid PK                   | default gen_random_uuid()                  |
| project_id      | uuid not null             | FK projects(id) ON DELETE CASCADE          |
| owner_id        | uuid not null             | FK auth.users(id) ON DELETE CASCADE        |
| linked_task_id  | uuid null                 | FK tasks(id) ON DELETE SET NULL (opcional) |
| title           | text not null             |                                            |
| description     | text null                 |                                            |
| url             | text not null             | CHECK (url ~ '^https?://')                 |
| provider        | text null                 | ej. "Figma", "Notion"                      |
| link_type       | project_link_type_enum    | not null                                   |
| section         | project_link_section_enum | not null                                   |
| tags            | text[] not null           | default '{}'                               |
| pinned          | boolean not null          | default false                              |
| sort_order      | int not null              | default 0                                  |
| open_in_new_tab | boolean not null          | default true                               |
| last_checked_at | timestamptz null          | opcional                                   |
| status_code     | int null                  | opcional                                   |
| archived_at     | timestamptz null          | soft delete                                |
| created_at      | timestamptz not null      | default now()                              |
| updated_at      | timestamptz not null      | default now(), trigger                     |

**Índices:**

- `(project_id, pinned desc, sort_order, created_at desc)` — listado principal
- `(project_id, section, pinned desc, created_at desc)` — por sección y "abrir todos"
- `(owner_id, created_at desc)` — auditoría
- GIN en `tags` — búsqueda por tags

**RLS:** SELECT/INSERT/UPDATE/DELETE solo si `owner_id = auth.uid()` y el `project_id` pertenece a un proyecto del usuario (join a `public.projects`).

---

## 5. Server actions

**Ubicación sugerida:** `app/context/[projectId]/links/actions.ts` (o `app/links/actions.ts` con `projectId` como argumento; recomendamos junto a la ruta para coherencia con notes).

- `listProjectLinksAction(projectId, params?)` — listar por proyecto; opcionalmente por `section`, incluir/ocultar archivados. Envuelto en `cache()` para lecturas.
- `createProjectLinkAction(projectId, input)` — validar URL (http/https), títulos, enums.
- `updateProjectLinkAction(linkId, input)` — mismo criterio de validación.
- `archiveProjectLinkAction(linkId)` — set `archived_at`.
- `reorderProjectLinksAction(projectId, orderedIds)` — opcional para orden manual.

**Validación:** URL obligatoria y que empiece por `http://` o `https://`; `title` requerido; `section` y `link_type` deben ser valores del enum.

**Revalidación:** Tras mutaciones, `revalidatePath(\`/context/${projectId}\`)` y `revalidatePath(\`/context/${projectId}/links\`)`. **No** depender de refetch manual en el cliente; las acciones deben devolver `{ data?, error? }`para que el cliente pueda actualizar la UI con el dato devuelto, o el cliente llamará a`onRefresh()`(invalidar cache + refetch en el wrapper) sin`router.refresh()`ni`load\*()`.

---

## 6. UI y rutas

### 6.1 Navegación

- **ContextTabBar:** Añadir tab `{ slug: 'links', labelKey: 'context.links', icon: Link }` **después de Notes**.
- **Ruta:** `/context/[projectId]/links` → página del Link Vault.

### 6.2 Estructura de la página

- **Layout:** Título "Enlaces" / "Links", CTA **Añadir enlace** (abre modal o sheet para crear).
- **Contenido:**
  - Agrupación por **section** (cabeceras con nombre de sección).
  - Dentro de cada sección: links **pinned** primero, luego por `sort_order`/`created_at`.
  - Cada ítem: título, URL (enlace que abre en nueva pestaña si `open_in_new_tab`), tags, acciones (editar, archivar, pin/unpin).
  - **"Abrir todos en sección"** por sección: botón que abre en nuevas pestañas todos los links no archivados de esa sección (usando `window.open(url, '_blank')` o similar).

### 6.3 Componentes sugeridos

- `app/context/[projectId]/links/page.tsx` — Server Component que renderiza wrapper FromCache.
- `ContextLinksFromCache` — Lee cache `links:${projectId}`, en miss carga con `listProjectLinksAction`, pasa datos + `onRefresh` al cliente.
- `ContextLinksClient` — Lista por secciones, cards/filas de link, botón "Abrir todos" por sección, modal/sheet para crear/editar.
- `LinkEditSheet` o `LinkFormModal` — Formulario crear/editar (title, url, section, link_type, tags, pinned, open_in_new_tab).

### 6.4 Session cache y actualización tras mutaciones

- En `ContextDataCache.tsx`: añadir tipo `{ type: 'links'; projectId: string }` a `CacheKey` y en `cacheKeyToString`.
- `ContextLinksFromCache` usa `cache.get({ type: 'links', projectId })`. **Cache hit:** renderizar con datos cacheados (sin petición). **Cache miss:** mostrar skeleton, llamar a `listProjectLinksAction`, `cache.set`, pasar datos a `ContextLinksClient`.
- **Tras mutaciones (create/update/archive/reorder):** no usar `router.refresh()` ni `load*()`. Opciones: (1) usar los datos devueltos por la acción para actualizar el estado local (p. ej. añadir el link creado a la lista), o (2) llamar a `onRefresh()` que invalida la clave, hace un refetch con `listProjectLinksAction`, actualiza el cache y re-renderiza con los nuevos datos. Así la UI se actualiza sin recargar la página y sin mostrar un loading global.

### 6.5 i18n (español e inglés)

Todas las cadenas visibles deben estar en **`locales/es.json`** y **`locales/en.json`**. Mínimo a implementar:

- **Tab y título:** En `context`: `"links": "Enlaces"` (es) / `"links": "Links"` (en).
- **Vista Links:** Crear sección `links` (o `context_links`) en ambos locales, por ejemplo:
  - `title`, `add_link`, `no_links_yet`, `no_links_hint`
  - `open_all_in_section`, `edit_link`, `archive_link`, `pinned`, `unpin`
  - Labels de sección: `section.delivery`, `section.infrastructure`, `section.product`, `section.marketing`, `section.operations`, `section.client`, `section.other`
  - Labels de tipo (opcional): `type.tool`, `type.resource`, `type.reference`, `type.environment`, `type.social`, `type.other`
  - Formulario: `title`, `url`, `description`, `provider`, `section`, `link_type`, `tags`, `open_in_new_tab`, `save`, `creating`, `updating`
  - Errores: `error_url_required`, `error_url_invalid`, `error_title_required`, etc.

No dejar texto hardcodeado en componentes; usar siempre `t('...')` con la clave correspondiente.

---

## 7. Plan de ejecución por fases (merge-safe)

### Fase 1 — Base de datos y tipos

- [ ] Migración: crear enums `project_link_type_enum`, `project_link_section_enum`.
- [ ] Migración: crear tabla `project_links` con constraints, índices y trigger `updated_at`.
- [ ] Habilitar RLS y políticas (owner + proyecto propio).
- [ ] Regenerar tipos Supabase (`lib/supabase/types.ts`) y comprobar que el build pasa.

**Criterio de salida:** Migración aplica sin errores; RLS activo; tipos actualizados.

### Fase 2 — Server actions y validación

- [ ] Crear `app/context/[projectId]/links/actions.ts` con:
  - `listProjectLinksAction(projectId, params?)` envuelto en `cache()` (solo lecturas).
  - `createProjectLinkAction`, `updateProjectLinkAction`, `archiveProjectLinkAction` que devuelvan `{ data?, error? }` (nunca depender de refetch manual).
  - Validación de URL (http/https), título, enums. Queries con columnas explícitas y scope por `project_id` y `owner_id` (ver `docs/patterns/database-queries.md`).
- [ ] Añadir helpers en `lib/validation/` si se desea (ej. `project-links.ts`).
- [ ] Tras cada mutación: `revalidatePath(\`/context/${projectId}\`)` y `revalidatePath(\`/context/${projectId}/links\`)`.

**Criterio de salida:** Acciones usables desde cliente; list/create/update/archive funcionan; no se usa `load*()` después de una acción.

### Fase 3 — Tab, ruta, i18n y session cache

- [ ] **i18n:** En `locales/es.json` y `locales/en.json`, añadir en `context` la clave `links`: "Enlaces" / "Links". Añadir sección `links` con las claves mínimas (title, add_link, no_links_yet, etc.) en ambos idiomas.
- [ ] En `ContextDataCache`: añadir `CacheKey` `{ type: 'links'; projectId: string }` y en `cacheKeyToString`.
- [ ] En `ContextTabBar`: añadir tab después de Notes con slug `links`, `labelKey: 'context.links'`, icono Link.
- [ ] Crear `app/context/[projectId]/links/page.tsx` (Server Component que solo renderiza `ContextLinksFromCache`; no fetch aquí para respetar cache en el cliente).
- [ ] Implementar `ContextLinksFromCache`: cache get → si hit, render con datos; si miss, **shimmer skeleton** (nunca spinner ni "Loading...") + `listProjectLinksAction` + cache.set + render. Pasar `onRefresh` (invalidate + refetch) a `ContextLinksClient`.
- [ ] Implementar `ContextLinksClient` mínimo: recibe `initialLinks` y `onRefresh`; lista plana; al mutar, usar dato devuelto o llamar `onRefresh()`; **no** `router.refresh()` ni `useEffect` para carga inicial.

**Criterio de salida:** Tab "Links"/"Enlaces" visible; al volver al tab no se rehace petición (cache); mutaciones actualizan UI sin refresh completo.

### Fase 4 — UI completa (secciones, pinned, abrir todos)

- [ ] Agrupar lista por `section` con cabeceras; etiquetas de sección vía i18n (`links.section.delivery`, etc.) en es/en.
- [ ] Ordenar por `pinned` primero, luego `sort_order`/`created_at`.
- [ ] Botón "Abrir todos en sección" por sección (texto desde i18n); abrir cada URL no archivada en nueva pestaña.
- [ ] Formulario crear/editar (sheet o modal): todos los labels desde i18n; al guardar usar `useTransition` para pending solo en el botón ("Guardando..."); en éxito, cerrar sheet y actualizar lista con dato devuelto o `onRefresh()` (sin loading global).
- [ ] Acciones por link: editar, archivar, pin/unpin; mutaciones devuelven data y/o se llama `onRefresh()`; no full-page refresh.

**Criterio de salida:** Usuario puede crear/editar/archivar; vista por secciones; "abrir todos"; loading solo con **shimmer** donde haga falta (nunca spinner ni texto "Loading..."); pending solo en el control que dispara la acción.

### Fase 5 (opcional) — Reordenación y refinamientos

- [ ] `reorderProjectLinksAction` y UI drag-and-drop o up/down para `sort_order`; actualizar UI con dato devuelto o `onRefresh()`.
- [ ] Filtro por tag o por `link_type`; etiquetas desde i18n.
- [ ] Ajustes mobile: tap targets ≥ 44px, CTA visible (sticky si se desea). Cualquier texto nuevo en es/en.

---

## 8. Riesgos y mitigaciones

| Riesgo                                    | Mitigación                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Confusión con `idea_project_links`        | Nombrar siempre "Link Vault" o "project links (vault)"; tabla y tipos con nombre `project_links`.  |
| Navegador bloquea múltiples `window.open` | "Abrir todos" puede abrir en secuencia con pequeño delay o advertir al usuario que permita popups. |
| Scope creep hacia Media/Docs              | Este plan solo incluye Link Vault; Media/Document Hub en planes separados.                         |

---

## 9. Resumen de decisión

- **Qué es:** Un tab **"Links" / "Enlaces"** en el contexto de proyecto para mantener una bitácora de enlaces (herramientas, referencias, sitios), organizados por **sección** y **tags**, con **pinned** y acción **"Abrir todos en sección"** en nuevas pestañas.
- **Dónde vive:** Tab principal en `/context/[projectId]/links`, **después de Notes**.
- **Cómo se ejecuta:** En 4 fases (DB → actions → tab + cache + lista mínima → UI completa con secciones y "abrir todos"), más una fase opcional de reordenación y filtros.

---

## Referencias de patrones

Al implementar, consultar siempre:

- **Reglas del repo:** `.cursorrules`
- **Carga de datos:** `docs/patterns/data-loading.md` — datos iniciales en servidor, `cache()` en lecturas, pasar datos por props; nunca `useEffect` para carga inicial.
- **Server actions:** `docs/patterns/server-actions.md` — `revalidatePath` tras mutaciones; devolver `{ data?, error? }`; no llamar `load*()` después de la acción.
- **Queries:** `docs/patterns/database-queries.md` — select explícito, scope por `project_id` y `owner_id`.
- **Cache de sesión:** `docs/patterns/context-session-cache.md` — provider en layout que no se desmonta; FromCache con onRefresh; invalidate + refetch sin router.refresh.
- **Loading:** `.cursorrules` — siempre efecto **shimmer** para loading; nunca spinners ni texto "Loading...". Cache siempre que el usuario pueda volver al mismo contexto; no refresh en la UI tras insert/update.

Cuando quieras, podemos bajar al detalle de la migración SQL o al código de una fase concreta (por ejemplo Fase 1 o Fase 3).
