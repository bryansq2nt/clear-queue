# Project Settings → Module Toggle + Left Slide Sidebar

## Design Document

**Version:** 1.0
**Status:** Draft — Pending Approval
**Scope:** Per-project module activation/deactivation with a left-side settings drawer
**Architecture Pattern:** Server page → `*FromCache` → `*Client` + MODULE_REGISTRY as single source of truth

---

## 1. Resumen ejecutivo

Esta feature permite que **cada proyecto controle qué módulos están activos**, reduciendo ruido de navegación y permitiendo que los equipos configuren el proyecto a su flujo real.

### Qué cambia

| Área                | Antes                                | Después                                                               |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| ContextTabBar       | Array estático de 10 tabs            | Array dinámico filtrado por módulos activos del proyecto              |
| Header del proyecto | Nombre centrado + botón Salir        | Nombre centrado + botón "Ajustes" (izquierda) + botón Salir (derecha) |
| Navegación          | Siempre muestra todos los módulos    | Solo muestra los activos para ese proyecto                            |
| DB                  | No hay tabla de módulos por proyecto | Nueva tabla `project_modules`                                         |
| Registry            | Lista de tabs hardcodeada en tabbar  | `lib/modules/registry.ts` como fuente de verdad                       |

### Lo que NO cambia

- El patrón `*FromCache` → `*Client` para todas las tabs existentes
- La ubicación del `ContextDataCacheProvider` en `app/context/layout.tsx`
- Los server actions existentes de cada módulo
- El sistema de i18n
- La arquitectura de RLS en tablas existentes

---

## 2. Análisis del codebase actual

### 2.1 Header del proyecto (`components/context/ContextShell.tsx`)

El header actual tiene esta estructura:

```tsx
<header>
  <div className="flex-1" /> {/* spacer izquierda */}
  <span>{projectName}</span> {/* nombre centrado */}
  <div className="flex-1 flex ...">
    {' '}
    {/* botón Salir (derecha) */}
    <LogOut /> Salir
  </div>
</header>
```

**Cambio necesario:** Reemplazar el spacer izquierdo con el botón de ajustes.

```tsx
<header>
  <button onClick={openDrawer}>
    <Settings /> Ajustes
  </button>{' '}
  {/* izquierda */}
  <span>{projectName}</span> {/* centro */}
  <div>
    <LogOut /> Salir
  </div>{' '}
  {/* derecha */}
</header>
```

### 2.2 Tab bar (`components/context/ContextTabBar.tsx`)

El array de tabs actual es estático:

```ts
const TABS = [
  { slug: 'board', labelKey: 'context.stages', icon: LayoutGrid },
  { slug: 'owner', labelKey: 'context.project_owner', icon: UserCircle },
  { slug: 'documents', labelKey: 'context.documents', icon: FolderOpen },
  { slug: 'media', labelKey: 'context.media', icon: Image },
  { slug: 'calendar', labelKey: 'context.calendar', icon: Calendar },
  { slug: 'notes', labelKey: 'context.notes', icon: FileText },
  { slug: 'links', labelKey: 'context.links', icon: LinkIcon },
  { slug: 'ideas', labelKey: 'context.ideas', icon: Lightbulb },
  { slug: 'budgets', labelKey: 'context.budgets', icon: DollarSign },
  { slug: 'billings', labelKey: 'context.billings', icon: Receipt },
];
```

**Cambio necesario:** Que `ContextTabBar` reciba `enabledModuleKeys: Set<ModuleKey>` como prop y filtre desde `MODULE_REGISTRY`.

### 2.3 Layout del proyecto (`app/context/[projectId]/layout.tsx`)

```tsx
export default async function ContextProjectLayout({ children, params }) {
  await requireAuth();
  return (
    <ContextLayoutWrapper projectId={params.projectId}>
      {children}
    </ContextLayoutWrapper>
  );
}
```

El drawer de ajustes debe montarse a este nivel (en `ContextLayoutWrapper` o `ContextShell`) para que esté disponible en todas las sub-rutas del proyecto.

### 2.4 CacheKey existentes (`app/context/ContextDataCache.tsx`)

Se añadirá:

```ts
| { type: 'modules'; projectId: string }
```

### 2.5 Módulos actuales mapeados

| Slug (ruta) | Módulo          | Tab label key           |
| ----------- | --------------- | ----------------------- |
| `board`     | Etapas / Kanban | `context.stages`        |
| `owner`     | Responsable     | `context.project_owner` |
| `documents` | Documentos      | `context.documents`     |
| `media`     | Media           | `context.media`         |
| `calendar`  | Calendario      | `context.calendar`      |
| `notes`     | Notas           | `context.notes`         |
| `links`     | Enlaces         | `context.links`         |
| `ideas`     | Ideas           | `context.ideas`         |
| `budgets`   | Presupuestos    | `context.budgets`       |
| `billings`  | Facturación     | `context.billings`      |

---

## 3. Modelo de datos

### 3.1 Tabla `project_modules`

```sql
CREATE TABLE public.project_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Clave única: un módulo, un proyecto
CREATE UNIQUE INDEX idx_project_modules_project_key
  ON public.project_modules (project_id, module_key);

-- Query de carga: "dame todos los módulos del proyecto X"
CREATE INDEX idx_project_modules_project_id
  ON public.project_modules (project_id);

-- Trigger updated_at
CREATE TRIGGER update_project_modules_updated_at
  BEFORE UPDATE ON public.project_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 3.2 Estrategia de defaults (lazy defaults)

**No se insertan filas para proyectos existentes ni nuevos.** Si no existe fila para un `module_key`, se usa `defaultEnabled` del registry.

Esta estrategia:

- Evita migrations de seed complejas
- Permite cambiar defaults del registry sin tocar DB
- Hace el query de load trivial: "dame las filas que existen; lo que no hay, usa default"

**Cuándo se inserta una fila:** Únicamente cuando el usuario hace toggle. Solo overrides explícitos viven en DB.

### 3.3 Política de RLS

Los proyectos en ClearQueue son propios del owner. No hay tabla de memberships/roles por proyecto en el schema actual — la autorización es por `owner_id`.

```sql
ALTER TABLE public.project_modules ENABLE ROW LEVEL SECURITY;

-- SELECT: el owner del proyecto puede ver sus módulos
CREATE POLICY "Owner can select own project modules"
  ON public.project_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

-- INSERT: solo el owner puede insertar
CREATE POLICY "Owner can insert project modules"
  ON public.project_modules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

-- UPDATE: solo el owner puede actualizar
CREATE POLICY "Owner can update project modules"
  ON public.project_modules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

-- DELETE: solo el owner puede eliminar (limpieza)
CREATE POLICY "Owner can delete project modules"
  ON public.project_modules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );
```

---

## 4. Registry central (`lib/modules/registry.ts`)

### 4.1 Tipos

```ts
export type ModuleKey =
  | 'board'
  | 'owner'
  | 'documents'
  | 'media'
  | 'calendar'
  | 'notes'
  | 'links'
  | 'ideas'
  | 'budgets'
  | 'billings';

export interface ModuleDefinition {
  key: ModuleKey;
  /** i18n key para el label del tab y la vista de ajustes */
  labelKey: string;
  /** i18n key para descripción en vista Módulos */
  descriptionKey: string;
  /** Icono Lucide (componente) */
  icon: LucideIcon;
  /** Si defaultEnabled=false, el módulo arranca desactivado en proyectos nuevos */
  defaultEnabled: boolean;
  /**
   * Si lock=true, el toggle está deshabilitado.
   * El módulo siempre está visible. No se puede apagar.
   */
  lock: boolean;
  nav: {
    /** Si true, aparece en el tab bar del proyecto */
    showInProjectTabs: boolean;
    /**
     * Slug de la ruta bajo /context/[projectId]/
     * Si el slug es 'board', la ruta activa es la raíz del proyecto.
     */
    slug: string;
    /** Orden de aparición en tab bar y en lista de ajustes */
    order: number;
  };
}
```

### 4.2 Registry completo (MVP)

```ts
import {
  LayoutGrid,
  UserCircle,
  FolderOpen,
  Image,
  Calendar,
  FileText,
  Link as LinkIcon,
  Lightbulb,
  DollarSign,
  Receipt,
} from 'lucide-react';

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = {
  board: {
    key: 'board',
    labelKey: 'context.stages',
    descriptionKey: 'modules.board_description',
    icon: LayoutGrid,
    defaultEnabled: true,
    lock: true, // Módulo esencial, no se puede apagar
    nav: { showInProjectTabs: true, slug: 'board', order: 1 },
  },
  owner: {
    key: 'owner',
    labelKey: 'context.project_owner',
    descriptionKey: 'modules.owner_description',
    icon: UserCircle,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'owner', order: 2 },
  },
  documents: {
    key: 'documents',
    labelKey: 'context.documents',
    descriptionKey: 'modules.documents_description',
    icon: FolderOpen,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'documents', order: 3 },
  },
  media: {
    key: 'media',
    labelKey: 'context.media',
    descriptionKey: 'modules.media_description',
    icon: Image,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'media', order: 4 },
  },
  calendar: {
    key: 'calendar',
    labelKey: 'context.calendar',
    descriptionKey: 'modules.calendar_description',
    icon: Calendar,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'calendar', order: 5 },
  },
  notes: {
    key: 'notes',
    labelKey: 'context.notes',
    descriptionKey: 'modules.notes_description',
    icon: FileText,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'notes', order: 6 },
  },
  links: {
    key: 'links',
    labelKey: 'context.links',
    descriptionKey: 'modules.links_description',
    icon: LinkIcon,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'links', order: 7 },
  },
  ideas: {
    key: 'ideas',
    labelKey: 'context.ideas',
    descriptionKey: 'modules.ideas_description',
    icon: Lightbulb,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'ideas', order: 8 },
  },
  budgets: {
    key: 'budgets',
    labelKey: 'context.budgets',
    descriptionKey: 'modules.budgets_description',
    icon: DollarSign,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'budgets', order: 9 },
  },
  billings: {
    key: 'billings',
    labelKey: 'context.billings',
    descriptionKey: 'modules.billings_description',
    icon: Receipt,
    defaultEnabled: true,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'billings', order: 10 },
  },
};

/** Lista ordenada para render en UI (tab bar, lista de ajustes) */
export const ORDERED_MODULES: ModuleDefinition[] = Object.values(
  MODULE_REGISTRY
).sort((a, b) => a.nav.order - b.nav.order);
```

**Regla:** `board` tiene `lock: true` porque es el módulo base del proyecto. Sin él, el proyecto no tiene funcionalidad core.

### 4.3 Helper `resolveProjectModules`

```ts
// lib/modules/registry.ts (o lib/modules/resolver.ts)

export interface ResolvedModule extends ModuleDefinition {
  enabled: boolean;
}

/**
 * Combina el registry con los overrides de DB.
 * Si no hay fila en DB, usa defaultEnabled del registry.
 */
export function resolveModules(
  dbRows: Array<{ module_key: string; enabled: boolean }>
): ResolvedModule[] {
  const overrideMap = new Map(dbRows.map((r) => [r.module_key, r.enabled]));

  return ORDERED_MODULES.map((def) => ({
    ...def,
    enabled: def.lock ? true : (overrideMap.get(def.key) ?? def.defaultEnabled),
  }));
}

/** Devuelve solo los keys de módulos activos, en order */
export function getEnabledModuleKeys(
  resolved: ResolvedModule[]
): Set<ModuleKey> {
  return new Set(resolved.filter((m) => m.enabled).map((m) => m.key));
}
```

---

## 5. Server actions (`app/actions/modules.ts`)

### 5.1 `getProjectModules(projectId)`

```ts
// Lectura: devuelve el estado resuelto de todos los módulos del proyecto
export const getProjectModules = cache(
  async (projectId: string): Promise<ResolvedModule[]> => {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('project_modules')
      .select('module_key, enabled')
      .eq('project_id', projectId);

    if (error) {
      captureWithContext(error, {
        module: 'modules',
        action: 'getProjectModules',
        userIntent: 'Load project module settings',
        expected: 'List of project_modules rows',
      });
      return resolveModules([]); // fallback a defaults
    }

    return resolveModules(data ?? []);
  }
);
```

- Se envuelve con `cache()` porque es una lectura pura.
- La RLS garantiza que solo el owner puede leer (defensa en profundidad junto al `requireAuth`).
- El `user` es requerido pero no es necesario pasarlo al query porque RLS lo aplica.

> **Nota:** `requireAuth()` al inicio es mandatorio incluso si RLS protege la tabla. El user object se puede usar para scope explícito si se prefiere una capa adicional:
> `.eq('project_id', projectId)` — la RLS ya verifica ownership, pero podemos añadir un join explícito si se desea (ver AGENTS.md §Security).

### 5.2 `setProjectModuleEnabled(projectId, moduleKey, enabled)`

```ts
// Escritura: activa o desactiva un módulo para un proyecto
export async function setProjectModuleEnabled(
  projectId: string,
  moduleKey: ModuleKey,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();

  // Validar que el moduleKey es válido
  if (!(moduleKey in MODULE_REGISTRY)) {
    return { ok: false, error: 'Invalid module key' };
  }

  // No se puede modificar un módulo locked
  if (MODULE_REGISTRY[moduleKey].lock) {
    return { ok: false, error: 'This module cannot be disabled' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('project_modules')
    .upsert(
      { project_id: projectId, module_key: moduleKey, enabled },
      { onConflict: 'project_id,module_key' }
    );

  if (error) {
    captureWithContext(error, {
      module: 'modules',
      action: 'setProjectModuleEnabled',
      userIntent: `Toggle module ${moduleKey} to ${enabled} for project ${projectId}`,
      expected: 'Upsert into project_modules',
    });
    return { ok: false, error: 'No se pudo guardar el cambio' };
  }

  revalidatePath(`/context/${projectId}`);
  revalidatePath(
    `/context/${projectId}/${MODULE_REGISTRY[moduleKey].nav.slug}`
  );

  return { ok: true };
}
```

**Punto clave:** Se usa `upsert` con `onConflict` para implementar el lazy-default: si no existe fila, se inserta; si existe, se actualiza. Un solo query.

---

## 6. Arquitectura de componentes UI

### 6.1 Mapa de componentes nuevos

```
components/context/
  ProjectSettingsDrawer.tsx        ← Drawer lateral izquierdo (nuevo)
  ProjectModulesSettingsView.tsx   ← Vista "Módulos" dentro del drawer (nuevo)

app/context/[projectId]/
  ContextLayoutWrapper.tsx         ← MODIFICADO: pasa enabledModules + drawer state
  ContextLayoutClient.tsx          ← MODIFICADO: recibe y pasa enabledModules
```

```
components/context/ContextShell.tsx   ← MODIFICADO: botón Ajustes en header
components/context/ContextTabBar.tsx  ← MODIFICADO: tabs dinámicos desde registry
```

### 6.2 Flujo de datos

```
page.tsx (server)
  └─ await getProjectModules(projectId)        ← lectura server-side
  └─ ContextLayoutWrapper (client)
       └─ recibe initialModules
       └─ gestiona drawer open/close state
       └─ ContextShell
            ├─ botón Ajustes → abre drawer
            ├─ ProjectSettingsDrawer (overlay)
            │    └─ ProjectModulesSettingsView
            │         ├─ lista de módulos (resolvedModules)
            │         └─ toggle → setProjectModuleEnabled() → onModulesRefresh()
            └─ ContextTabBar (recibe enabledKeys)
                 └─ filtra ORDERED_MODULES por enabledKeys
```

### 6.3 `ContextLayoutWrapper` (modificado)

Hoy: fetcha el proyecto y lo pasa a `ContextLayoutClient`.
Después: también fetcha módulos (o los recibe como prop desde el server) y gestiona el state del drawer.

```tsx
// Opción A: Recibir initialModules desde page.tsx (preferido — un fetch server-side)
interface ContextLayoutWrapperProps {
  projectId: string;
  initialModules: ResolvedModule[];
  children: React.ReactNode;
}
```

El state del drawer y el estado de módulos viven en `ContextLayoutWrapper` para que sean compartidos entre el header (botón Ajustes) y el `ContextTabBar` (tabs filtrados).

### 6.4 `ProjectSettingsDrawer`

```tsx
interface ProjectSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  modules: ResolvedModule[];
  onModulesChange: (updated: ResolvedModule[]) => void;
}
```

**Estructura visual:**

```
┌─────────────────────────────┐
│  Ajustes del proyecto    ✕  │  ← header del drawer
├─────────────────────────────┤
│                             │
│  [●] Módulos                │  ← item activo (primera sección)
│      General                │  ← placeholder (disabled)
│      Accesos                │  ← placeholder (disabled)
│                             │
├─────────────────────────────┤
│  [contenido del item activo]│  ← ProjectModulesSettingsView
│                             │
└─────────────────────────────┘
```

**Animación:** `translate-x-0` / `-translate-x-full` con `transition-transform duration-280`. Igual al patrón de "Salir" que ya existe en `ContextShell`.

**Overlay:** `fixed inset-0 bg-black/40` detrás del drawer, click cierra.

**Montaje:** El drawer usa `fixed` positioning y se monta en el layout del proyecto, no en el tab específico. Así está disponible desde cualquier sub-ruta.

### 6.5 `ProjectModulesSettingsView`

```tsx
interface ProjectModulesSettingsViewProps {
  projectId: string;
  modules: ResolvedModule[];
  onModulesChange: (updated: ResolvedModule[]) => void;
}
```

**Layout:**

```
Módulos del proyecto
"Active solo lo que realmente usa. Menos ruido, más enfoque."

┌────────────────────────────────────────┐
│  [🔲] Etapas          Kanban de tareas │  lock → toggle disabled, tooltip
│  [✅] Responsable     Asigna un cliente│
│  [✅] Documentos      Sube y organiza… │
│  [✅] Media           Fotos y videos   │
│  [ ] Calendario       Fechas y eventos │  ← disabled (enabled=false)
│  [✅] Notas           Notas del proyect│
│  ...                                   │
└────────────────────────────────────────┘
```

**Cada fila:**

- Icono del módulo
- Nombre (i18n)
- Descripción breve (i18n)
- Toggle (`<Switch>` de shadcn/ui o equivalente)
  - Si `lock=true`: toggle deshabilitado + tooltip "Módulo esencial"
  - Si toggle cambia: llamar `setProjectModuleEnabled` + actualizar estado local + toast

**Loading por fila:** Cada toggle tiene loading state individual (no bloquea toda la lista). Estado: `loadingKey: ModuleKey | null`.

**Feedback:**

- Toast "Módulo activado" / "Módulo desactivado" tras éxito
- Si error: mostrar inline bajo el toggle (no alert, no MutationErrorDialog porque no es destructivo)

### 6.6 `ContextTabBar` (modificado)

Recibe `enabledKeys: Set<ModuleKey>` como prop adicional.

```tsx
// Antes: tabs estáticos
const TABS = [...]

// Después: tabs dinámicos desde registry
function buildTabs(enabledKeys: Set<ModuleKey>): TabDefinition[] {
  return ORDERED_MODULES
    .filter((m) => m.nav.showInProjectTabs && enabledKeys.has(m.key))
    .map((m) => ({
      slug: m.nav.slug,
      labelKey: m.labelKey,
      icon: m.icon,
    }));
}
```

La lógica de render del tab activo (basado en pathname) no cambia.

---

## 7. Route guards (fallback para módulos desactivados)

Para cada módulo, en su `page.tsx`:

```tsx
// app/context/[projectId]/media/page.tsx (ejemplo)
export default async function MediaPage({ params }: Props) {
  await requireAuth();
  const modules = await getProjectModules(params.projectId);
  const mediaModule = modules.find((m) => m.key === 'media');

  if (!mediaModule?.enabled) {
    return (
      <ModuleDisabledView moduleKey="media" projectId={params.projectId} />
    );
  }

  return <ContextMediaFromCache projectId={params.projectId} />;
}
```

**Componente `ModuleDisabledView`:**

```tsx
// components/context/ModuleDisabledView.tsx
interface ModuleDisabledViewProps {
  moduleKey: ModuleKey;
  projectId: string;
}
```

Muestra:

- Icono del módulo (grande, desaturado)
- Título: "Este módulo está desactivado para este proyecto"
- Descripción: "Puedes activarlo desde los ajustes del proyecto."
- Botón: "Abrir ajustes" → navega a `/context/[projectId]` y abre el drawer de ajustes

> **Nota de implementación:** Para "abrir el drawer" desde una página hija, se puede usar un query param `?settings=modules` que `ContextLayoutWrapper` lea al montar y abra el drawer automáticamente. Así no se necesita estado global ni contexto adicional.

**El `board` tiene `lock=true`**, por lo tanto su route guard nunca mostrará el fallback (no puede estar desactivado).

---

## 8. Carga de módulos — rendimiento

### 8.1 Cuándo se cargan

Los módulos se cargan **una vez**, server-side, en `app/context/[projectId]/layout.tsx`:

```tsx
export default async function ContextProjectLayout({ children, params }) {
  await requireAuth();
  const [project, modules] = await Promise.all([
    getProjectById(params.projectId), // ya existe
    getProjectModules(params.projectId), // nuevo
  ]);
  return (
    <ContextLayoutWrapper
      projectId={params.projectId}
      initialProject={project}
      initialModules={modules}
    >
      {children}
    </ContextLayoutWrapper>
  );
}
```

**Round trips:** 2 queries en paralelo (dentro del máximo permitido de 2 para detail pages).

### 8.2 Actualización tras toggle

Cuando el usuario hace toggle en `ProjectModulesSettingsView`:

1. Llamada a `setProjectModuleEnabled` (server action)
2. Si `ok: true`:
   - Actualizar estado local `modules` en `ContextLayoutWrapper` (no refetch completo)
   - El `ContextTabBar` re-renders con los nuevos `enabledKeys`
   - Toast de confirmación
3. Si `ok: false`:
   - Revertir toggle visual
   - Mensaje de error inline

No se llama `router.refresh()`. El estado local se actualiza desde el return value del action.

### 8.3 Cache key

Se añade `{ type: 'modules'; projectId: string }` al `CacheKey` en `ContextDataCache.tsx` para que, si en el futuro `ProjectModulesSettingsView` necesita cargar/recargar desde la session cache, el tipo ya esté disponible. Para MVP, la carga es directamente server-side en el layout y el estado vive en `ContextLayoutWrapper`.

---

## 9. i18n — claves nuevas

### `locales/en.json`

```json
{
  "context": {
    "settings": "Settings"
  },
  "modules": {
    "title": "Project modules",
    "subtitle": "Enable only what you really use. Less noise, more focus.",
    "essential_tooltip": "Essential module — cannot be disabled",
    "toggle_enabled_toast": "Module enabled",
    "toggle_disabled_toast": "Module disabled",
    "board_description": "Kanban board to manage project tasks",
    "owner_description": "Link a client or business to this project",
    "documents_description": "Upload, organize, and share project files",
    "media_description": "Photos and videos for the project",
    "calendar_description": "Dates, events, and scheduling",
    "notes_description": "Internal notes and references",
    "links_description": "Useful links, tools, and resources",
    "ideas_description": "Brainstorming and idea mapping",
    "budgets_description": "Budget planning and estimates",
    "billings_description": "Invoicing and billing tracking",
    "module_disabled_title": "This module is disabled for this project",
    "module_disabled_description": "You can enable it from the project settings.",
    "module_disabled_cta": "Open settings"
  },
  "project_settings": {
    "drawer_title": "Project settings",
    "nav_modules": "Modules",
    "nav_general": "General",
    "nav_access": "Access"
  }
}
```

### `locales/es.json`

```json
{
  "context": {
    "settings": "Ajustes"
  },
  "modules": {
    "title": "Módulos del proyecto",
    "subtitle": "Active solo lo que realmente usa. Menos ruido, más enfoque.",
    "essential_tooltip": "Módulo esencial — no se puede desactivar",
    "toggle_enabled_toast": "Módulo activado",
    "toggle_disabled_toast": "Módulo desactivado",
    "board_description": "Tablero kanban para gestionar las tareas del proyecto",
    "owner_description": "Vincula un cliente o empresa a este proyecto",
    "documents_description": "Sube, organiza y comparte archivos del proyecto",
    "media_description": "Fotos y videos del proyecto",
    "calendar_description": "Fechas, eventos y agenda",
    "notes_description": "Notas internas y referencias",
    "links_description": "Links útiles, herramientas y recursos",
    "ideas_description": "Lluvia de ideas y mapas conceptuales",
    "budgets_description": "Planificación de presupuestos y estimaciones",
    "billings_description": "Seguimiento de facturación y cobros",
    "module_disabled_title": "Este módulo está desactivado para este proyecto",
    "module_disabled_description": "Puedes activarlo desde los ajustes del proyecto.",
    "module_disabled_cta": "Abrir ajustes"
  },
  "project_settings": {
    "drawer_title": "Ajustes del proyecto",
    "nav_modules": "Módulos",
    "nav_general": "General",
    "nav_access": "Accesos"
  }
}
```

---

## 10. Etapas de implementación

### Etapa 1 — Migración SQL + RLS

**Archivos:** `supabase/migrations/YYYYMMDDHHMMSS_project_modules.sql`

- Tabla `project_modules` con unique index
- Trigger `updated_at`
- 4 políticas RLS (SELECT / INSERT / UPDATE / DELETE) por ownership de proyecto

**Deliverable:** Migration lista y testeada localmente.

---

### Etapa 2 — Registry + helpers

**Archivos nuevos:**

- `lib/modules/registry.ts` — tipos, `MODULE_REGISTRY`, `ORDERED_MODULES`
- `lib/modules/resolver.ts` (o en el mismo archivo) — `resolveModules`, `getEnabledModuleKeys`

**Deliverable:** Registry completo con los 10 módulos actuales, tipos estrictos, helper de resolución funcional con tests unitarios Vitest.

---

### Etapa 3 — Server actions

**Archivo nuevo:** `app/actions/modules.ts`

- `getProjectModules(projectId)` — lectura con `cache()`
- `setProjectModuleEnabled(projectId, moduleKey, enabled)` — upsert + revalidatePath

**Deliverable:** Actions con tipos, validación de `ModuleKey`, Sentry context, revalidación correcta.

---

### Etapa 4 — Layout: carga de módulos server-side

**Archivos modificados:**

- `app/context/[projectId]/layout.tsx` — añadir `getProjectModules` en paralelo con `getProjectById`
- `app/context/[projectId]/ContextLayoutWrapper.tsx` — recibir `initialModules`, gestionar state, prop del drawer
- `app/context/[projectId]/ContextLayoutClient.tsx` — pasar módulos hacia ContextShell

**Deliverable:** `enabledModuleKeys` disponible en el árbol de componentes del proyecto.

---

### Etapa 5 — Tab bar dinámico

**Archivo modificado:** `components/context/ContextTabBar.tsx`

- Eliminar array estático `TABS`
- Construir tabs desde `ORDERED_MODULES` filtrado por `enabledModuleKeys`
- El componente recibe `enabledKeys: Set<ModuleKey>` como prop

**Deliverable:** Tab bar muestra solo módulos activos, en el orden del registry.

---

### Etapa 6 — Drawer de ajustes + botón en header

**Archivos nuevos:**

- `components/context/ProjectSettingsDrawer.tsx`
- `components/context/ProjectModulesSettingsView.tsx`
- `components/context/ModuleDisabledView.tsx`

**Archivo modificado:** `components/context/ContextShell.tsx`

- Reemplazar spacer izquierdo con botón "Ajustes" (icono Settings + label)
- Render condicional del `ProjectSettingsDrawer`

**Deliverable:** Drawer abre/cierra correctamente, UI consistente con el diseño del proyecto.

---

### Etapa 7 — Toggles con persistencia

**Archivos modificados:** `ProjectModulesSettingsView.tsx`

- Toggle llama `setProjectModuleEnabled`
- Estado local optimista: actualizar antes de que responda el server, revertir si falla
- Toast de confirmación
- Loading state por módulo (no bloquea lista entera)
- Propagación de cambio al ContextLayoutWrapper (`onModulesChange`)

**Deliverable:** Toggle persiste en DB, tabs se actualizan en tiempo real, sin page reload.

---

### Etapa 8 — Route guards

**Archivos modificados:** `page.tsx` de cada módulo

```
app/context/[projectId]/owner/page.tsx
app/context/[projectId]/documents/page.tsx
app/context/[projectId]/media/page.tsx
app/context/[projectId]/calendar/page.tsx
app/context/[projectId]/notes/page.tsx
app/context/[projectId]/links/page.tsx
app/context/[projectId]/ideas/page.tsx
app/context/[projectId]/budgets/page.tsx
app/context/[projectId]/billings/page.tsx
```

Cada uno verifica `getProjectModules` y renderiza `<ModuleDisabledView>` si el módulo está desactivado.

**Nota:** El `board` NO necesita guard (tiene `lock=true`).

**Query param para abrir drawer:** `?settings=modules` en la URL, leído por `ContextLayoutWrapper` en mount.

**Deliverable:** Acceso directo por URL a módulo desactivado muestra fallback profesional.

---

### Etapa 9 — Testing

**Tests Vitest (unitarios):**

- `lib/modules/registry.test.ts`:
  - Todos los módulos tienen `labelKey`, `nav.slug`, `icon` definidos
  - `resolveModules([])` devuelve defaults correctos
  - `resolveModules` aplica overrides de DB correctamente
  - Módulos `lock=true` siempre devuelven `enabled=true` ignorando DB

**Tests Playwright (E2E):**

- `tests/project-modules.spec.ts`:
  - Abrir ajustes → ver lista de módulos → desactivar Media → tab desaparece
  - Navegar directamente a `/context/[projectId]/media` → ver fallback
  - Reactivar Media → tab reaparece → navegar a media funciona
  - Módulo board (lock) → toggle deshabilitado, tooltip visible
  - Refresh de página mantiene estado

---

## 11. Definition of Done

- [ ] `project_modules` table existe en DB con RLS, indexes y trigger `updated_at`
- [ ] `MODULE_REGISTRY` es la única fuente de verdad de módulos (no hay listas duplicadas)
- [ ] `ContextTabBar` se genera dinámicamente desde registry + DB state
- [ ] El drawer abre/cierra sin romper la UI ni el routing
- [ ] Toggles persisten en DB (upsert), con feedback visual inmediato
- [ ] Módulo desactivado no aparece en tabs
- [ ] URL directa a módulo desactivado muestra `ModuleDisabledView`
- [ ] `board` no puede desactivarse (lock=true, toggle disabled)
- [ ] Sin `createClient()` en componentes
- [ ] Sin `select('*')` en ningún query nuevo
- [ ] `requireAuth()` es la primera llamada en cada server action
- [ ] `captureWithContext` en todos los paths de error de server actions
- [ ] `revalidatePath` tras cada mutación
- [ ] i18n completo en `en.json` y `es.json`
- [ ] Tests Vitest para registry y resolver pasan
- [ ] Test Playwright happy-path pasa
- [ ] `npm run lint`, `npm run build`, `npm run test -- --run` pasan

---

## 12. Decisiones de diseño y trade-offs

| Decisión                                                         | Alternativa descartada                    | Razón                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Lazy defaults (no seed)                                          | Insertar filas para todos los proyectos   | Evita migración de datos compleja; defaults del registry son la fuente de verdad        |
| `upsert` para toggle                                             | INSERT + UPDATE separados                 | Un solo query, atómico, maneja ambos casos                                              |
| Estado en `ContextLayoutWrapper`                                 | Context/zustand global                    | Suficiente para este scope; no se necesita estado global                                |
| Query param `?settings=modules` para abrir drawer desde fallback | Context global                            | Más simple, sobrevive navegación, funciona con SSR                                      |
| Registry en `lib/modules/`                                       | Directamente en `components/`             | `lib/` es la capa de dominio; componentes no deben definir listas de módulos            |
| `board` como único módulo locked                                 | Todos los módulos opcionalmente lockeable | MVP conservador; se puede extender el registry si aparecen más módulos core             |
| Carga server-side en layout                                      | FromCache pattern                         | Los módulos son necesarios para renderizar el layout (tabs), no solo una tab específica |

---

## 13. Cómo añadir un nuevo módulo al sistema

Esta sección es la más importante para el trabajo diario. Explica el mecanismo completo: por qué un módulo nuevo aparece automáticamente en la vista de ajustes y en el tab bar, y exactamente qué pasos debe seguir quien cree el módulo.

---

### 13.1 Por qué funciona automáticamente (el mecanismo)

Hay tres lugares en el código que leen `ORDERED_MODULES` del registry para construir su UI:

| Componente                   | Qué hace con `ORDERED_MODULES`                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `ProjectModulesSettingsView` | Renderiza **toda** la lista de módulos con sus toggles. Itera sobre `ORDERED_MODULES` siempre. |
| `ContextTabBar`              | Filtra `ORDERED_MODULES` por `enabledKeys` y renderiza solo los tabs activos.                  |
| `ModuleDisabledView`         | Lee `MODULE_REGISTRY[moduleKey]` para mostrar el icono y nombre correcto.                      |

**La consecuencia directa:** En cuanto se añade una entrada al `MODULE_REGISTRY`, ese módulo aparece automáticamente en la lista de la vista "Módulos" del drawer de ajustes. No hay que cambiar ningún componente de UI.

```
MODULE_REGISTRY ← fuente de verdad
      │
      ├─── ORDERED_MODULES (lista ordenada derivada)
      │          │
      │          ├─── ProjectModulesSettingsView → muestra el toggle automáticamente
      │          │
      │          └─── ContextTabBar → muestra el tab si enabled=true
      │
      └─── resolveModules(dbRows) → combina registry + DB state
```

**Lo que no es automático** (lo que sí hay que hacer a mano):

- Crear las rutas y componentes del módulo en `app/context/[projectId]/<slug>/`
- Añadir el route guard en `page.tsx`
- Añadir las claves i18n

---

### 13.2 Checklist completo para crear un nuevo módulo

Usamos "Inventario" como ejemplo (`moduleKey: 'inventory'`, slug: `inventory`).

#### Paso 1 — Registrar el módulo (aparece automáticamente en ajustes)

En `lib/modules/registry.ts`:

```ts
// 1a. Añadir el key al tipo
export type ModuleKey =
  | 'board'
  | 'owner'
  // ... existentes ...
  | 'inventory'; // ← NUEVO

// 1b. Añadir la definición al registry
export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = {
  // ... existentes ...
  inventory: {
    key: 'inventory',
    labelKey: 'context.inventory', // ← clave i18n para el tab
    descriptionKey: 'modules.inventory_description', // ← clave i18n para ajustes
    icon: Package, // ← icono Lucide
    defaultEnabled: false, // ← opt-in: empieza desactivado
    lock: false,
    nav: {
      showInProjectTabs: true,
      slug: 'inventory', // ← debe coincidir con la carpeta de ruta
      order: 11, // ← posición en tab bar y en lista de ajustes
    },
  },
};
```

**Efecto inmediato:** En cuanto se guarda este archivo, el módulo "Inventario" aparece en `ProjectModulesSettingsView` con su toggle (desactivado por defecto, porque `defaultEnabled: false`). No se toca ningún componente más para lograr esto.

#### Paso 2 — Añadir claves i18n

En `locales/en.json`:

```json
{
  "context": {
    "inventory": "Inventory"
  },
  "modules": {
    "inventory_description": "Track materials, tools, and equipment"
  }
}
```

En `locales/es.json`:

```json
{
  "context": {
    "inventory": "Inventario"
  },
  "modules": {
    "inventory_description": "Seguimiento de materiales, herramientas y equipos"
  }
}
```

#### Paso 3 — Crear la ruta y componentes del módulo

Estructura mínima (igual que cualquier tab existente):

```
app/context/[projectId]/inventory/
  page.tsx                         ← requireAuth + route guard + ContextInventoryFromCache
  ContextInventoryFromCache.tsx    ← patrón cache miss/hit + skeleton + onRefresh
  ContextInventoryClient.tsx       ← UI del módulo, recibe data + onRefresh
  actions.ts                       ← server actions del módulo (getInventory, createItem, etc.)

components/skeletons/
  SkeletonInventory.tsx            ← shimmer skeleton para loading state
```

#### Paso 4 — Route guard en `page.tsx`

Este es el paso que protege el acceso directo por URL cuando el módulo está desactivado:

```tsx
// app/context/[projectId]/inventory/page.tsx
import { requireAuth } from '@/lib/auth';
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextInventoryFromCache from './ContextInventoryFromCache';

export default async function InventoryPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();

  const modules = await getProjectModules(params.projectId);
  const mod = modules.find((m) => m.key === 'inventory');

  if (!mod?.enabled) {
    return (
      <ModuleDisabledView moduleKey="inventory" projectId={params.projectId} />
    );
  }

  return <ContextInventoryFromCache projectId={params.projectId} />;
}
```

#### Paso 5 — Añadir el CacheKey (si el módulo usa session cache)

En `app/context/ContextDataCache.tsx`:

```ts
export type CacheKey =
  // ... existentes ...
  { type: 'inventory'; projectId: string }; // ← NUEVO
```

---

### 13.3 Qué ocurre visualmente cuando se activa el módulo

Con `defaultEnabled: false`, el flujo completo desde que se registra hasta que un usuario activa el módulo:

```
1. Developer añade 'inventory' al MODULE_REGISTRY
        ↓
2. ProjectModulesSettingsView muestra "Inventario" con toggle OFF
   (sin tocar ningún componente de UI)
        ↓
3. Usuario abre Ajustes → Módulos → activa toggle de Inventario
        ↓
4. setProjectModuleEnabled('inventory', true) → upsert en project_modules
        ↓
5. ContextLayoutWrapper actualiza enabledKeys desde el return value del action
        ↓
6. ContextTabBar re-renderiza → aparece el tab "Inventario"
        ↓
7. Usuario navega al tab → ContextInventoryFromCache carga los datos
```

---

### 13.4 Lo que NO es necesario al crear un módulo nuevo

- **No hay migración de DB.** El lazy default system usa `defaultEnabled` del registry si no existe fila en `project_modules`.
- **No se toca `ContextTabBar`.** Lee `ORDERED_MODULES` directamente.
- **No se toca `ProjectSettingsDrawer` ni `ProjectModulesSettingsView`.** Iteran sobre `ORDERED_MODULES` automáticamente.
- **No se tocan los módulos existentes.** Cada módulo es independiente en su carpeta de ruta.
- **No se toca la migración `project_modules`.** Ya tiene el diseño abierto (text `module_key` sin FK a una tabla de módulos).

---

### 13.5 Reglas de `defaultEnabled` y `lock`

| Situación                                      | `defaultEnabled` | `lock`  |
| ---------------------------------------------- | ---------------- | ------- |
| Módulo core sin el que el proyecto no funciona | `true`           | `true`  |
| Módulo útil para la mayoría de proyectos       | `true`           | `false` |
| Módulo especializado (no todos lo usan)        | `false`          | `false` |
| Módulo en beta / experimental                  | `false`          | `false` |

**Regla general para módulos nuevos:** usar `defaultEnabled: false` (opt-in). Es mejor que el usuario lo active cuando lo necesita a que aparezca en el tab bar de todos los proyectos existentes sin que lo hayan pedido.

---

## 14. Archivos que cambian (resumen)

### Nuevos

```
lib/modules/registry.ts
lib/modules/registry.test.ts
app/actions/modules.ts
components/context/ProjectSettingsDrawer.tsx
components/context/ProjectModulesSettingsView.tsx
components/context/ModuleDisabledView.tsx
supabase/migrations/YYYYMMDDHHMMSS_project_modules.sql
tests/project-modules.spec.ts
```

### Modificados

```
app/context/[projectId]/layout.tsx              ← parallelizar fetch de módulos
app/context/[projectId]/ContextLayoutWrapper.tsx ← recibir initialModules, drawer state
app/context/[projectId]/ContextLayoutClient.tsx  ← pasar enabledModules
components/context/ContextShell.tsx              ← botón Ajustes en header
components/context/ContextTabBar.tsx             ← tabs dinámicos desde registry
app/context/ContextDataCache.tsx                 ← añadir CacheKey 'modules'
locales/en.json                                  ← nuevas claves
locales/es.json                                  ← nuevas claves

-- Route guards (verificar módulo habilitado antes de renderizar tab):
app/context/[projectId]/owner/page.tsx
app/context/[projectId]/documents/page.tsx
app/context/[projectId]/media/page.tsx
app/context/[projectId]/calendar/page.tsx
app/context/[projectId]/notes/page.tsx
app/context/[projectId]/links/page.tsx
app/context/[projectId]/ideas/page.tsx
app/context/[projectId]/budgets/page.tsx
app/context/[projectId]/billings/page.tsx
```
