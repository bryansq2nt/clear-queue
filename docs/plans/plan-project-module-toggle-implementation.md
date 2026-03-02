# Project Settings → Module Toggle

## Plan de implementación + Audit inicial

**Referencia:** `docs/plans/plan-project-module-toggle.md` (documento de diseño)
**Fecha:** 2026-03-02
**Estado:** Listo para ejecutar

---

## Parte 1 — Audit inicial del codebase

Esta sección documenta el estado real de cada archivo que será tocado, lo que se encontró, y si se requiere pre-trabajo antes de implementar.

---

### AUDIT-01: `components/context/ContextTabBar.tsx`

**Estado actual:**

```ts
const TABS = [
  { slug: 'board', labelKey: 'context.stages', icon: LayoutGrid },
  ...
] as const;  // ← array estático marcado como const

export interface ContextTabBarProps {
  projectId: string;  // ← única prop, no recibe enabledModuleKeys
}
```

**Problema:** El array es `as const` (inmutable en tipos), no recibe `enabledModuleKeys`, y los tabs están duplicados con el registry que crearemos. Cuando se integre el registry, este array desaparece completamente.

**¿Requiere pre-trabajo?** No. El cambio es directo: eliminar `TABS`, añadir prop `enabledModuleKeys`, leer del registry.

**Cambio de contrato:** `ContextTabBarProps` pasa de `{ projectId }` a `{ projectId, enabledModuleKeys: Set<ModuleKey> }`. Esto requiere que todos los places que renderizan `<ContextTabBar>` (actualmente solo `ContextShell`) pasen la nueva prop.

---

### AUDIT-02: `components/context/ContextShell.tsx`

**Estado actual:**

```tsx
export interface ContextShellProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
  // ← no tiene enabledModuleKeys, no tiene onOpenSettings
}

// Header:
<div className="flex-1 min-w-0" aria-hidden />  // ← spacer vacío (izquierda)
<h1>{projectName}</h1>                           // ← centro
<div className="flex flex-1 justify-end">        // ← botón Salir (derecha)
  <Link href="/?from=project">...</Link>
</div>

// Tab bar:
<ContextTabBar projectId={projectId} />  // ← sin enabledModuleKeys
```

**Problema:**

- El spacer izquierdo debe reemplazarse por el botón "Ajustes"
- `ContextTabBar` se llama sin `enabledModuleKeys`
- El drawer de ajustes debe montarse aquí (o en su componente padre)
- Props insuficientes para el nuevo comportamiento

**¿Requiere pre-trabajo?** No. El componente es limpio y el cambio es cirúrgico.

**Cambio de contrato:** `ContextShellProps` añade `enabledModuleKeys: Set<ModuleKey>` y `onOpenSettings: () => void`.

---

### AUDIT-03: `app/context/[projectId]/ContextLayoutWrapper.tsx`

**Estado actual:**

```tsx
interface ContextLayoutWrapperProps {
  projectId: string;
  children: React.ReactNode;
  // ← no recibe initialModules
}

// Solo gestiona estado del proyecto:
const [project, setProject] = useState<Project | null>(cached ?? null);
const [checked, setChecked] = useState(!!cached);
const [displayName, setDisplayName] = useState<string>(...);

// Render:
return (
  <ContextLayoutClient projectId={projectId} projectName={displayName}>
    {children}
  </ContextLayoutClient>
);
```

**Problema:** No gestiona estado de módulos ni del drawer. Es aquí donde deben vivir ambos (el drawer debe ser accesible desde cualquier sub-ruta del proyecto).

**¿Requiere pre-trabajo?** No. El componente tiene un patrón claro para añadir nuevo estado.

**Cambio de contrato:** Se añade carga de módulos (via `getProjectModules` server action), estado del drawer (`drawerOpen: boolean`), y se pasan ambos hacia `ContextLayoutClient`.

---

### AUDIT-04: `app/context/[projectId]/ContextLayoutClient.tsx`

**Estado actual:**

```tsx
interface ContextLayoutClientProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
  // ← no recibe módulos ni drawer state
}

// Solo llama recordProjectAccess y renderiza ContextShell:
return (
  <ContextShell projectId={projectId} projectName={projectName}>
    {children}
  </ContextShell>
);
```

**Problema:** Componente muy delgado que es el puente entre `ContextLayoutWrapper` y `ContextShell`. Necesita pasar las nuevas props hacia abajo.

**¿Requiere pre-trabajo?** No. Cambio mecánico de pasar props.

---

### AUDIT-05: `app/context/[projectId]/layout.tsx` (server)

**Estado actual:**

```tsx
export default async function ContextProjectLayout({ children, params }) {
  await requireAuth();
  const projectId = params.projectId;
  return (
    <ContextLayoutWrapper projectId={projectId}>
      {children}
    </ContextLayoutWrapper>
  );
}
```

**¿Requiere cambio?** No. Los módulos se cargarán client-side dentro de `ContextLayoutWrapper` (consistente con cómo se carga el proyecto hoy). El `layout.tsx` server solo hace `requireAuth()`, y eso está bien.

**Justificación:** `getProjectById` ya se carga cliente en `ContextLayoutWrapper`, no en el server layout. Mantener el mismo patrón para módulos evita un cambio de arquitectura innecesario y es consistente con la base existente.

---

### AUDIT-06: `app/context/ContextDataCache.tsx`

**Estado actual:** 16 tipos de CacheKey, ninguno para módulos.

**Cambio requerido:** Añadir `| { type: 'modules'; projectId: string }` al union type. Cambio de una línea. No rompe nada.

---

### AUDIT-07: Pages de cada módulo (`*/page.tsx`)

**Estado actual de las 9 páginas que necesitan route guard:**

Todas siguen exactamente el mismo patrón:

```tsx
export default async function ContextXxxPage({ params }) {
  await requireAuth();
  return <ContextXxxFromCache projectId={params.projectId} />;
}
```

**No existe ningún guard de módulo hoy.** Alguien puede navegar directamente a `/context/[id]/media` aunque el módulo estuviera desactivado.

**Cambio requerido:** Añadir llamada a `getProjectModules` y renderizar `<ModuleDisabledView>` si el módulo está inactivo. El patrón es idéntico para las 9 páginas.

**Nota sobre `board/page.tsx`:** Este módulo tiene `lock: true` — NO necesita route guard. Si alguien navega a `/context/[id]` (board), siempre muestra el board.

---

### AUDIT-08: Dependencias — Switch (toggle) y Tooltip

**Problema crítico encontrado:**

```json
// package.json — lo que existe:
"@radix-ui/react-dialog": "^1.0.5",
"@radix-ui/react-dropdown-menu": "^2.0.6",
"@radix-ui/react-label": "^2.0.2",
"@radix-ui/react-select": "^2.0.0",
"@radix-ui/react-slot": "^1.0.2",
"@radix-ui/react-tabs": "^1.1.13",

// Lo que NO existe y el diseño requiere:
// ❌ @radix-ui/react-switch  (toggle)
// ❌ @radix-ui/react-tooltip (tooltip para módulos locked)
```

**Decisiones de resolución:**

**Toggle / Switch:** Instalar `@radix-ui/react-switch` y crear `components/ui/switch.tsx` siguiendo el mismo patrón que los otros primitivos (`button.tsx`, `dialog.tsx`, etc.).

**Tooltip para módulos locked:** Usar el atributo nativo HTML `title` en el elemento deshabilitado. No requiere instalar nada. El diseño no exige tooltip animado — solo que el usuario vea por qué no puede apagar el módulo.

```tsx
// Suficiente para MVP:
<button disabled title={t('modules.essential_tooltip')}>
  ...
</button>
```

**¿Requiere pre-trabajo?** Sí — instalar `@radix-ui/react-switch` y crear `components/ui/switch.tsx` **antes** de construir `ProjectModulesSettingsView`.

---

### AUDIT-09: Sistema de toasts

**Estado actual:** El proyecto usa un sistema propio de eventos (NO sonner, NO shadcn toast):

```ts
// lib/ui/toast.ts
export function toastSuccess(message: string) {
  window.dispatchEvent(new CustomEvent('clear-queue:toast', {
    detail: { type: 'success', message },
  }));
}

export function toastError(message: string) { ... }
```

Ya funciona en `ContextMediaClient`, `ContextNotesClient`, etc. Los toasts de módulo usarán exactamente este mismo sistema. No se necesita ningún cambio.

---

### AUDIT-10: `lib/` — estructura para el registry

**Estado actual:**

```
lib/
  auth.ts
  board.ts
  constants.ts
  i18n.ts
  idea-graph/
  kanban/
  media-image-cache.ts
  projects.ts
  sentry.ts
  storage/
  supabase/
  theme.ts
  todo/
  ui/
  utils.ts
  validation/
```

**No existe `lib/modules/`.** Hay que crearlo. El patrón de subcarpeta en `lib/` está bien establecido (`idea-graph/`, `kanban/`, `todo/`, `storage/`).

**¿Requiere pre-trabajo?** No. Solo crear la carpeta y los archivos en el proceso de implementación.

---

### AUDIT-11: Migración — timestamp

**Última migración existente:** `20260228120000_calendar_events.sql` y `20260228120000_media_share_tokens.sql`

**Timestamp para la nueva migración:** `20260302120000_project_modules.sql` (hoy, 2026-03-02)

**Sin conflictos.** El timestamp es posterior a todas las migraciones existentes.

---

### Resumen del audit

| Item                                   | Estado                      | Pre-trabajo requerido                    |
| -------------------------------------- | --------------------------- | ---------------------------------------- |
| `ContextTabBar` — array estático       | Requiere cambio             | No — cambio directo en la etapa correcta |
| `ContextShell` — spacer + props        | Requiere cambio             | No — cambio cirúrgico                    |
| `ContextLayoutWrapper` — sin módulos   | Requiere cambio             | No — patrón claro a seguir               |
| `ContextLayoutClient` — bridge props   | Requiere cambio             | No — mecánico                            |
| `layout.tsx` (server)                  | Sin cambios                 | —                                        |
| `ContextDataCache` — CacheKey          | Añadir un tipo              | No                                       |
| 9 page.tsx — sin route guards          | Requieren cambio            | No — patrón repetible                    |
| `@radix-ui/react-switch` no instalado  | **BLOQUEANTE**              | **Sí — instalar antes de Etapa 6**       |
| `@radix-ui/react-tooltip` no instalado | Resuelto con `title` nativo | No                                       |
| Sistema de toasts                      | Listo, no requiere cambios  | —                                        |
| `lib/modules/` no existe               | Crear en Etapa 2            | No                                       |
| Timestamp de migración                 | `20260302120000`            | —                                        |

**Conclusión del audit:** La base del código es sólida. No hay deuda técnica ni restructuración previa necesaria. El único pre-trabajo real es instalar `@radix-ui/react-switch`. Todo lo demás son cambios directos durante la implementación.

---

## Parte 2 — Plan de implementación

Las etapas están ordenadas por dependencia. Cada etapa puede completarse y commitearse de forma independiente.

---

### Etapa 0 — Pre-trabajo: instalar Switch

**Por qué primero:** `ProjectModulesSettingsView` (Etapa 5) no puede construirse sin el componente de toggle.

**Archivos:**

- `package.json` — añadir dependencia
- `components/ui/switch.tsx` — nuevo primitivo

**Pasos:**

```bash
npm install @radix-ui/react-switch
```

Crear `components/ui/switch.tsx`:

```tsx
'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0',
          'transition-transform duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </SwitchPrimitive.Root>
  );
}
```

**Test manual:** Verificar que `npm run build` pasa sin errores. El switch no está en uso aún, pero confirma que la instalación es correcta.

**Commit sugerido:** `feat: add Switch primitive (pre-work for module toggles)`

---

### Etapa 1 — Migración SQL

**Archivo nuevo:** `supabase/migrations/20260302120000_project_modules.sql`

```sql
-- Project modules: per-project module activation state.
-- Design: lazy defaults. Only explicit overrides are stored.
-- Source of truth for module definitions: lib/modules/registry.ts
-- See docs/plans/plan-project-module-toggle.md

-- 1. Table
CREATE TABLE public.project_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Unique constraint: one row per module per project
CREATE UNIQUE INDEX idx_project_modules_project_key
  ON public.project_modules (project_id, module_key);

-- 3. Index for "give me all modules for project X"
CREATE INDEX idx_project_modules_project_id
  ON public.project_modules (project_id);

-- 4. updated_at trigger
CREATE TRIGGER update_project_modules_updated_at
  BEFORE UPDATE ON public.project_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.project_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select project modules"
  ON public.project_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can insert project modules"
  ON public.project_modules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update project modules"
  ON public.project_modules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.owner_id = auth.uid()
    )
  );

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

**Verificación local:** Aplicar con `supabase db push` o el método habitual del proyecto. Confirmar que la tabla existe y las policies están activas.

**Commit sugerido:** `feat(db): add project_modules table with RLS`

---

### Etapa 2 — Registry y helpers

**Archivos nuevos:**

- `lib/modules/registry.ts`
- `lib/modules/registry.test.ts`

**`lib/modules/registry.ts`** — contenido completo:

```ts
import type { LucideIcon } from 'lucide-react';
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

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

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
  /** i18n key for tab label and settings list */
  labelKey: string;
  /** i18n key for description in the modules settings view */
  descriptionKey: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Used when no DB row exists for this project+module */
  defaultEnabled: boolean;
  /**
   * If true: toggle is disabled. Module is always active.
   * Cannot be turned off by users.
   */
  lock: boolean;
  nav: {
    /** If true, appears in the project tab bar */
    showInProjectTabs: boolean;
    /**
     * Route slug under /context/[projectId]/
     * 'board' maps to the project root, not a sub-path.
     */
    slug: string;
    /** Display order in tab bar and settings list */
    order: number;
  };
}

export interface ResolvedModule extends ModuleDefinition {
  /** Effective enabled state: DB override or defaultEnabled */
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Registry — single source of truth for all modules
// ─────────────────────────────────────────────────────────────────

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = {
  board: {
    key: 'board',
    labelKey: 'context.stages',
    descriptionKey: 'modules.board_description',
    icon: LayoutGrid,
    defaultEnabled: true,
    lock: true,
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

/** Ordered list for UI rendering (tab bar, settings list) */
export const ORDERED_MODULES: ModuleDefinition[] = Object.values(
  MODULE_REGISTRY
).sort((a, b) => a.nav.order - b.nav.order);

// ─────────────────────────────────────────────────────────────────
// Resolver — combines registry with DB overrides
// ─────────────────────────────────────────────────────────────────

/**
 * Merges registry definitions with DB rows.
 * If no DB row exists for a module_key, uses defaultEnabled from registry.
 * Locked modules are always enabled regardless of DB state.
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

/**
 * Returns a Set of enabled module keys for fast lookup in tab bar rendering.
 */
export function getEnabledModuleKeys(
  resolved: ResolvedModule[]
): Set<ModuleKey> {
  return new Set(resolved.filter((m) => m.enabled).map((m) => m.key));
}
```

**`lib/modules/registry.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import {
  MODULE_REGISTRY,
  ORDERED_MODULES,
  resolveModules,
  getEnabledModuleKeys,
  type ModuleKey,
} from './registry';

describe('MODULE_REGISTRY', () => {
  it('has a definition for every ModuleKey', () => {
    const keys: ModuleKey[] = [
      'board',
      'owner',
      'documents',
      'media',
      'calendar',
      'notes',
      'links',
      'ideas',
      'budgets',
      'billings',
    ];
    for (const key of keys) {
      expect(MODULE_REGISTRY[key]).toBeDefined();
      expect(MODULE_REGISTRY[key].key).toBe(key);
    }
  });

  it('every module has required fields', () => {
    for (const mod of ORDERED_MODULES) {
      expect(mod.labelKey).toBeTruthy();
      expect(mod.descriptionKey).toBeTruthy();
      expect(mod.icon).toBeDefined();
      expect(mod.nav.slug).toBeTruthy();
      expect(mod.nav.order).toBeGreaterThan(0);
    }
  });

  it('ORDERED_MODULES is sorted by nav.order ascending', () => {
    for (let i = 1; i < ORDERED_MODULES.length; i++) {
      expect(ORDERED_MODULES[i].nav.order).toBeGreaterThan(
        ORDERED_MODULES[i - 1].nav.order
      );
    }
  });

  it('board module is locked', () => {
    expect(MODULE_REGISTRY.board.lock).toBe(true);
  });
});

describe('resolveModules', () => {
  it('uses defaultEnabled when no DB row exists', () => {
    const resolved = resolveModules([]);
    for (const mod of resolved) {
      expect(mod.enabled).toBe(
        MODULE_REGISTRY[mod.key].lock
          ? true
          : MODULE_REGISTRY[mod.key].defaultEnabled
      );
    }
  });

  it('applies DB override when row exists', () => {
    const resolved = resolveModules([{ module_key: 'media', enabled: false }]);
    const media = resolved.find((m) => m.key === 'media')!;
    expect(media.enabled).toBe(false);
  });

  it('ignores DB override for locked modules', () => {
    const resolved = resolveModules([{ module_key: 'board', enabled: false }]);
    const board = resolved.find((m) => m.key === 'board')!;
    expect(board.enabled).toBe(true); // lock=true, always enabled
  });

  it('ignores unknown module_key from DB gracefully', () => {
    const resolved = resolveModules([
      { module_key: 'unknown_module', enabled: false },
    ]);
    expect(resolved.length).toBe(ORDERED_MODULES.length); // no extras
  });
});

describe('getEnabledModuleKeys', () => {
  it('returns only enabled keys', () => {
    const resolved = resolveModules([{ module_key: 'notes', enabled: false }]);
    const keys = getEnabledModuleKeys(resolved);
    expect(keys.has('notes')).toBe(false);
    expect(keys.has('board')).toBe(true);
  });
});
```

**Verificación:** `npm run test -- --run lib/modules/registry.test.ts`

**Commit sugerido:** `feat(modules): add MODULE_REGISTRY, resolveModules, and unit tests`

---

### Etapa 3 — Server action `getProjectModules`

**Archivo nuevo:** `app/actions/modules.ts`

```ts
'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { captureWithContext } from '@/lib/sentry';
import { revalidatePath } from 'next/cache';
import {
  resolveModules,
  MODULE_REGISTRY,
  type ModuleKey,
  type ResolvedModule,
} from '@/lib/modules/registry';

// ─────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────

export const getProjectModules = cache(
  async (projectId: string): Promise<ResolvedModule[]> => {
    await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('project_modules')
      .select('module_key, enabled')
      .eq('project_id', projectId);

    if (error) {
      captureWithContext(error, {
        module: 'modules',
        action: 'getProjectModules',
        userIntent: 'Load module settings for a project',
        expected: 'List of project_modules rows from DB',
      });
      // Fallback: return all modules with their defaults.
      // Better to show everything than nothing.
      return resolveModules([]);
    }

    return resolveModules(data ?? []);
  }
);

// ─────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────

export async function setProjectModuleEnabled(
  projectId: string,
  moduleKey: ModuleKey,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();

  // Validate moduleKey is a known key
  if (!(moduleKey in MODULE_REGISTRY)) {
    return { ok: false, error: 'Invalid module key' };
  }

  // Reject attempts to toggle locked modules
  if (MODULE_REGISTRY[moduleKey].lock) {
    return { ok: false, error: 'This module cannot be disabled' };
  }

  const supabase = await createClient();

  const { error } = await supabase.from('project_modules').upsert(
    {
      project_id: projectId,
      module_key: moduleKey,
      enabled,
    },
    { onConflict: 'project_id,module_key' }
  );

  if (error) {
    captureWithContext(error, {
      module: 'modules',
      action: 'setProjectModuleEnabled',
      userIntent: `Set module "${moduleKey}" to ${enabled} for project ${projectId}`,
      expected: 'Upsert row in project_modules',
    });
    return { ok: false, error: 'No se pudo guardar el cambio' };
  }

  revalidatePath(`/context/${projectId}`);

  return { ok: true };
}
```

**Commit sugerido:** `feat(modules): add getProjectModules and setProjectModuleEnabled actions`

---

### Etapa 4 — CacheKey + módulos en ContextLayoutWrapper

**4a. `app/context/ContextDataCache.tsx`** — añadir una línea:

```ts
// Localizar este bloque y añadir la última línea:
export type CacheKey =
  | { type: 'project'; projectId: string }
  // ... existentes ...
  | { type: 'media'; projectId: string }
  | { type: 'modules'; projectId: string }; // ← AÑADIR
```

**4b. `app/context/[projectId]/ContextLayoutWrapper.tsx`** — modificación completa:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjectById } from '@/app/actions/projects';
import { getProjectModules } from '@/app/actions/modules';
import {
  getEnabledModuleKeys,
  type ModuleKey,
  type ResolvedModule,
} from '@/lib/modules/registry';
import type { Database } from '@/lib/supabase/types';
import { useContextDataCache } from '../ContextDataCache';
import ContextLayoutClient from './ContextLayoutClient';

const STORAGE_KEY_PREFIX = 'context_project_name_';

type Project = Database['public']['Tables']['projects']['Row'];

interface ContextLayoutWrapperProps {
  projectId: string;
  children: React.ReactNode;
}

export default function ContextLayoutWrapper({
  projectId,
  children,
}: ContextLayoutWrapperProps) {
  const cache = useContextDataCache();
  const router = useRouter();

  // ── Project state (unchanged) ──────────────────────────────────
  const cached = cache.get<Project>({ type: 'project', projectId });
  const [project, setProject] = useState<Project | null>(cached ?? null);
  const [checked, setChecked] = useState(!!cached);
  const [displayName, setDisplayName] = useState<string>(() => {
    if (cached?.name) return cached.name;
    if (typeof window === 'undefined') return '…';
    try {
      return sessionStorage.getItem(STORAGE_KEY_PREFIX + projectId) ?? '…';
    } catch {
      return '…';
    }
  });

  // ── Module state (new) ─────────────────────────────────────────
  const cachedModules = cache.get<ResolvedModule[]>({
    type: 'modules',
    projectId,
  });
  const [modules, setModules] = useState<ResolvedModule[]>(cachedModules ?? []);
  const [modulesLoaded, setModulesLoaded] = useState(!!cachedModules);

  // ── Drawer state (new) ─────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Project load effect (unchanged logic) ──────────────────────
  useEffect(() => {
    if (cached) {
      setProject(cached);
      setDisplayName(cached.name);
      setChecked(true);
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        const name = sessionStorage.getItem(STORAGE_KEY_PREFIX + projectId);
        if (name) setDisplayName(name);
      } catch {
        /* ignore */
      }
    }
    let cancelled = false;
    getProjectById(projectId).then((p) => {
      if (cancelled) return;
      setChecked(true);
      if (!p) {
        router.replace('/');
        return;
      }
      cache.set({ type: 'project', projectId }, p);
      setProject(p);
      setDisplayName(p.name);
      try {
        sessionStorage.removeItem(STORAGE_KEY_PREFIX + projectId);
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache, router]);

  // ── Module load effect (new) ───────────────────────────────────
  useEffect(() => {
    if (cachedModules) {
      setModules(cachedModules);
      setModulesLoaded(true);
      return;
    }
    let cancelled = false;
    getProjectModules(projectId).then((resolved) => {
      if (cancelled) return;
      cache.set({ type: 'modules', projectId }, resolved);
      setModules(resolved);
      setModulesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, cachedModules, cache]);

  // ── Module update handler (called after toggle in drawer) ──────
  const handleModulesChange = useCallback(
    (updated: ResolvedModule[]) => {
      cache.set({ type: 'modules', projectId }, updated);
      setModules(updated);
    },
    [projectId, cache]
  );

  if (checked && !project) {
    return null;
  }

  const enabledModuleKeys = getEnabledModuleKeys(modules);

  return (
    <ContextLayoutClient
      projectId={projectId}
      projectName={displayName}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      modulesLoaded={modulesLoaded}
      drawerOpen={drawerOpen}
      onOpenSettings={() => setDrawerOpen(true)}
      onCloseSettings={() => setDrawerOpen(false)}
      onModulesChange={handleModulesChange}
    >
      {children}
    </ContextLayoutClient>
  );
}
```

**4c. `app/context/[projectId]/ContextLayoutClient.tsx`** — pasar nuevas props:

```tsx
'use client';

import { useEffect } from 'react';
import { ContextShell } from '@/components/context/ContextShell';
import { recordProjectAccess } from '@/app/actions/projects';
import type { ModuleKey, ResolvedModule } from '@/lib/modules/registry';

interface ContextLayoutClientProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
  enabledModuleKeys: Set<ModuleKey>;
  modules: ResolvedModule[];
  modulesLoaded: boolean;
  drawerOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onModulesChange: (updated: ResolvedModule[]) => void;
}

export default function ContextLayoutClient({
  projectId,
  projectName,
  children,
  enabledModuleKeys,
  modules,
  modulesLoaded,
  drawerOpen,
  onOpenSettings,
  onCloseSettings,
  onModulesChange,
}: ContextLayoutClientProps) {
  useEffect(() => {
    void recordProjectAccess(projectId);
  }, [projectId]);

  return (
    <ContextShell
      projectId={projectId}
      projectName={projectName}
      enabledModuleKeys={enabledModuleKeys}
      modules={modules}
      modulesLoaded={modulesLoaded}
      drawerOpen={drawerOpen}
      onOpenSettings={onOpenSettings}
      onCloseSettings={onCloseSettings}
      onModulesChange={onModulesChange}
    >
      {children}
    </ContextShell>
  );
}
```

**Commit sugerido:** `feat(modules): wire module state and drawer state through layout wrapper`

---

### Etapa 5 — Tab bar dinámico

**`components/context/ContextTabBar.tsx`** — reescritura:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/components/shared/I18nProvider';
import { cn } from '@/lib/utils';
import { ORDERED_MODULES, type ModuleKey } from '@/lib/modules/registry';

export interface ContextTabBarProps {
  projectId: string;
  enabledModuleKeys: Set<ModuleKey>;
}

export function ContextTabBar({
  projectId,
  enabledModuleKeys,
}: ContextTabBarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const base = `/context/${projectId}`;

  const tabLinkClass =
    'flex items-center gap-2 px-3 py-3 min-h-[44px] flex-shrink-0 text-sm font-medium whitespace-nowrap border-b-2 transition-colors rounded-t-md';
  const activeClass = 'border-primary text-primary';
  const inactiveClass =
    'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30';

  const visibleTabs = ORDERED_MODULES.filter(
    (m) => m.nav.showInProjectTabs && enabledModuleKeys.has(m.key)
  );

  return (
    <nav
      className="flex w-full flex-shrink-0 border-b border-border bg-card px-4 md:px-6"
      aria-label={t('context.title')}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-1 w-full">
        {visibleTabs.map(({ key, nav, labelKey, icon: Icon }) => {
          const href = key === 'board' ? base : `${base}/${nav.slug}`;
          const isActive =
            pathname === href ||
            (key !== 'board' && pathname?.startsWith(`${base}/${nav.slug}`));
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                tabLinkClass,
                isActive ? activeClass : inactiveClass
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

**Commit sugerido:** `feat(modules): make ContextTabBar dynamic from MODULE_REGISTRY`

---

### Etapa 6 — Drawer + botón Ajustes en ContextShell

**6a. Crear `components/context/ProjectSettingsDrawer.tsx`:**

```tsx
'use client';

import { X, Puzzle } from 'lucide-react';
import { useI18n } from '@/components/shared/I18nProvider';
import type { ResolvedModule } from '@/lib/modules/registry';
import { ProjectModulesSettingsView } from './ProjectModulesSettingsView';

interface ProjectSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  modules: ResolvedModule[];
  onModulesChange: (updated: ResolvedModule[]) => void;
}

export function ProjectSettingsDrawer({
  open,
  onClose,
  projectId,
  modules,
  onModulesChange,
}: ProjectSettingsDrawerProps) {
  const { t } = useI18n();

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Drawer panel */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-80 flex-col bg-background shadow-xl',
          'transition-transform duration-[280ms] ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        role="dialog"
        aria-modal
        aria-label={t('project_settings.drawer_title')}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
          <span className="text-base font-semibold">
            {t('project_settings.drawer_title')}
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Cerrar ajustes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer nav + content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Side nav */}
          <nav className="flex flex-col gap-1 border-r border-border p-2 w-36 flex-shrink-0">
            {/* Módulos — active */}
            <button className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-muted text-foreground text-left">
              <Puzzle className="w-4 h-4 flex-shrink-0" aria-hidden />
              {t('project_settings.nav_modules')}
            </button>
            {/* Future items — disabled placeholder */}
            <button
              disabled
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/50 text-left cursor-not-allowed"
            >
              {t('project_settings.nav_general')}
            </button>
          </nav>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-4">
            <ProjectModulesSettingsView
              projectId={projectId}
              modules={modules}
              onModulesChange={onModulesChange}
            />
          </div>
        </div>
      </div>
    </>
  );
}
```

**6b. Crear `components/context/ProjectModulesSettingsView.tsx`:**

```tsx
'use client';

import { useState } from 'react';
import { useI18n } from '@/components/shared/I18nProvider';
import { Switch } from '@/components/ui/switch';
import { toastSuccess, toastError } from '@/lib/ui/toast';
import { setProjectModuleEnabled } from '@/app/actions/modules';
import type { ModuleKey, ResolvedModule } from '@/lib/modules/registry';

interface ProjectModulesSettingsViewProps {
  projectId: string;
  modules: ResolvedModule[];
  onModulesChange: (updated: ResolvedModule[]) => void;
}

export function ProjectModulesSettingsView({
  projectId,
  modules,
  onModulesChange,
}: ProjectModulesSettingsViewProps) {
  const { t } = useI18n();
  const [loadingKey, setLoadingKey] = useState<ModuleKey | null>(null);

  const handleToggle = async (moduleKey: ModuleKey, newEnabled: boolean) => {
    setLoadingKey(moduleKey);

    // Optimistic update
    const optimistic = modules.map((m) =>
      m.key === moduleKey ? { ...m, enabled: newEnabled } : m
    );
    onModulesChange(optimistic);

    const result = await setProjectModuleEnabled(
      projectId,
      moduleKey,
      newEnabled
    );

    setLoadingKey(null);

    if (result.ok) {
      toastSuccess(
        newEnabled
          ? t('modules.toggle_enabled_toast')
          : t('modules.toggle_disabled_toast')
      );
    } else {
      // Revert optimistic update
      const reverted = modules.map((m) =>
        m.key === moduleKey ? { ...m, enabled: !newEnabled } : m
      );
      onModulesChange(reverted);
      toastError(result.error);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {t('modules.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('modules.subtitle')}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {modules
          .filter((m) => m.nav.showInProjectTabs)
          .map((mod) => {
            const Icon = mod.icon;
            const isLoading = loadingKey === mod.key;

            return (
              <li
                key={mod.key}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <Icon
                  className="w-4 h-4 text-muted-foreground flex-shrink-0"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">
                    {t(mod.labelKey)}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                    {t(mod.descriptionKey)}
                  </p>
                </div>
                <div
                  title={mod.lock ? t('modules.essential_tooltip') : undefined}
                >
                  <Switch
                    checked={mod.enabled}
                    onCheckedChange={(checked) =>
                      !isLoading && handleToggle(mod.key, checked)
                    }
                    disabled={mod.lock || isLoading}
                    aria-label={`${mod.lock ? t('modules.essential_tooltip') : ''} ${t(mod.labelKey)}`}
                  />
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
```

**6c. `components/context/ContextShell.tsx`** — modificar header y añadir drawer:

```tsx
// Cambios en ContextShellProps:
export interface ContextShellProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
  enabledModuleKeys: Set<ModuleKey>; // ← nuevo
  modules: ResolvedModule[]; // ← nuevo
  modulesLoaded: boolean; // ← nuevo
  drawerOpen: boolean; // ← nuevo
  onOpenSettings: () => void; // ← nuevo
  onCloseSettings: () => void; // ← nuevo
  onModulesChange: (updated: ResolvedModule[]) => void; // ← nuevo
}
```

En el JSX, reemplazar el spacer izquierdo y añadir drawer:

```tsx
// ANTES (header left):
<div className="flex-1 min-w-0" aria-hidden />

// DESPUÉS (header left):
<button
  onClick={onOpenSettings}
  className="flex items-center gap-2 py-2 px-3 rounded-md text-primary-foreground hover:bg-primary-foreground/10 transition-colors min-h-[44px]"
>
  <Settings className="w-5 h-5 flex-shrink-0" aria-hidden />
  <span className="hidden sm:inline font-medium">{t('context.settings')}</span>
</button>
```

```tsx
// Pasar enabledModuleKeys a ContextTabBar:
<ContextTabBar projectId={projectId} enabledModuleKeys={enabledModuleKeys} />
```

```tsx
// Montar el drawer (antes del cierre del div principal):
<ProjectSettingsDrawer
  open={drawerOpen}
  onClose={onCloseSettings}
  projectId={projectId}
  modules={modules}
  onModulesChange={onModulesChange}
/>
```

Añadir al import de lucide-react: `Settings`.
Añadir imports de `ProjectSettingsDrawer`, `ResolvedModule`, `ModuleKey`.

**Commit sugerido:** `feat(modules): add ProjectSettingsDrawer, ModulesSettingsView, and Settings button in header`

---

### Etapa 7 — ModuleDisabledView + i18n

**7a. Crear `components/context/ModuleDisabledView.tsx`:**

```tsx
import { MODULE_REGISTRY, type ModuleKey } from '@/lib/modules/registry';

interface ModuleDisabledViewProps {
  moduleKey: ModuleKey;
  projectId: string;
}

export function ModuleDisabledView({
  moduleKey,
  projectId,
}: ModuleDisabledViewProps) {
  const mod = MODULE_REGISTRY[moduleKey];
  const Icon = mod.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <Icon className="w-12 h-12 text-muted-foreground/30" aria-hidden />
      <div className="max-w-xs">
        <p className="text-sm font-medium text-foreground">
          {/* i18n: modules.module_disabled_title */}
          Este módulo está desactivado para este proyecto
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {/* i18n: modules.module_disabled_description */}
          Puedes activarlo desde los ajustes del proyecto.
        </p>
      </div>
      {/* Link to open settings — uses query param to auto-open drawer */}
      <a
        href={`/context/${projectId}?settings=modules`}
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        {/* i18n: modules.module_disabled_cta */}
        Abrir ajustes
      </a>
    </div>
  );
}
```

> **Nota:** Este componente se crea sin hooks de i18n porque es un Server Component (se usa en `page.tsx` server). Si se necesita i18n aquí, convertir a client component con `useI18n()`. Para MVP, texto hardcodeado es aceptable.

**7b. i18n — añadir claves en `locales/en.json` y `locales/es.json`**

Las claves a añadir están documentadas en el documento de diseño (sección 9). Añadir en los grupos correspondientes sin reemplazar nada existente.

**Commit sugerido:** `feat(modules): add ModuleDisabledView and i18n keys`

---

### Etapa 8 — Route guards en los 9 page.tsx

El patrón es idéntico para todos. Ejemplo con `media/page.tsx`:

```tsx
// ANTES:
export default async function ContextMediaPage({ params }) {
  await requireAuth();
  const { projectId } = params;
  return <ContextMediaFromCache projectId={projectId} />;
}

// DESPUÉS:
import { getProjectModules } from '@/app/actions/modules';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';

export default async function ContextMediaPage({ params }) {
  await requireAuth();
  const { projectId } = params;

  const modules = await getProjectModules(projectId);
  const mod = modules.find((m) => m.key === 'media');
  if (!mod?.enabled) {
    return <ModuleDisabledView moduleKey="media" projectId={projectId} />;
  }

  return <ContextMediaFromCache projectId={projectId} />;
}
```

**Archivos a modificar** (misma operación en cada uno):

| Archivo              | moduleKey a verificar |
| -------------------- | --------------------- |
| `owner/page.tsx`     | `'owner'`             |
| `documents/page.tsx` | `'documents'`         |
| `media/page.tsx`     | `'media'`             |
| `calendar/page.tsx`  | `'calendar'`          |
| `notes/page.tsx`     | `'notes'`             |
| `links/page.tsx`     | `'links'`             |
| `ideas/page.tsx`     | `'ideas'`             |
| `budgets/page.tsx`   | `'budgets'`           |
| `billings/page.tsx`  | `'billings'`          |

**`board/page.tsx` NO se modifica** — módulo locked.

**Nota de rendimiento:** `getProjectModules` está envuelto con `cache()`. Cuando Next.js ejecuta el server layout y luego el server page en el mismo request, si `getProjectModules(projectId)` ya fue llamado en cualquier otro lugar del mismo request, la segunda llamada es gratuita (deduplicación de React cache). No hay double fetch.

**Commit sugerido:** `feat(modules): add route guards to all module pages`

---

### Etapa 9 — Tests E2E

**Archivo nuevo:** `tests/project-modules.spec.ts`

```ts
import { test, expect } from '@playwright/test';

// Asume que el test tiene una sesión autenticada y un proyecto de prueba.
// Adaptar según las helpers de auth que use el repo.

test.describe('Project module toggles', () => {
  test('open settings drawer and see module list', async ({ page }) => {
    await page.goto('/context/TEST_PROJECT_ID');
    await page.click('button:has-text("Ajustes")');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Módulos del proyecto')).toBeVisible();
    await expect(page.getByText('Media')).toBeVisible();
  });

  test('disable a module removes it from tab bar', async ({ page }) => {
    await page.goto('/context/TEST_PROJECT_ID');
    // Confirm tab exists
    await expect(page.getByRole('link', { name: /media/i })).toBeVisible();
    // Open settings
    await page.click('button:has-text("Ajustes")');
    // Toggle off
    const mediaRow = page.locator('li').filter({ hasText: 'Media' });
    await mediaRow.getByRole('switch').click();
    // Close drawer
    await page.keyboard.press('Escape');
    // Tab should be gone
    await expect(page.getByRole('link', { name: /media/i })).not.toBeVisible();
  });

  test('direct URL to disabled module shows fallback', async ({ page }) => {
    // Pre-condition: media is disabled for this project
    await page.goto('/context/TEST_PROJECT_ID/media');
    await expect(page.getByText('Este módulo está desactivado')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /abrir ajustes/i })
    ).toBeVisible();
  });

  test('board module toggle is disabled (locked)', async ({ page }) => {
    await page.goto('/context/TEST_PROJECT_ID');
    await page.click('button:has-text("Ajustes")');
    const boardRow = page.locator('li').filter({ hasText: 'Etapas' });
    const switchEl = boardRow.getByRole('switch');
    await expect(switchEl).toBeDisabled();
  });

  test('refresh page preserves module state', async ({ page }) => {
    // Disable media
    await page.goto('/context/TEST_PROJECT_ID');
    await page.click('button:has-text("Ajustes")');
    const mediaRow = page.locator('li').filter({ hasText: 'Media' });
    await mediaRow.getByRole('switch').click();
    // Reload
    await page.reload();
    // Media tab still absent
    await expect(page.getByRole('link', { name: /media/i })).not.toBeVisible();
  });
});
```

**Commit sugerido:** `test(modules): add Playwright happy-path tests for module toggles`

---

## Parte 3 — Checklist final antes de merge

### Correctitud del código

- [ ] `npm run lint` pasa sin warnings nuevos
- [ ] `npm run build` pasa sin errores de TypeScript
- [ ] `npm run test -- --run` pasa (incluyendo `registry.test.ts`)
- [ ] `npx playwright test tests/project-modules.spec.ts` pasa

### Reglas de AGENTS.md

- [ ] Ningún `createClient()` de `@/lib/supabase/client` en componentes nuevos
- [ ] Ningún `.select('*')` en los queries nuevos
- [ ] `requireAuth()` es la primera llamada en `getProjectModules` y `setProjectModuleEnabled`
- [ ] `captureWithContext` con los 4 campos en cada path de error
- [ ] `revalidatePath` llamado después de `setProjectModuleEnabled`
- [ ] `getProjectModules` está envuelto con `cache()` — es lectura pura
- [ ] `setProjectModuleEnabled` NO está envuelto con `cache()` — es escritura
- [ ] No hay `router.refresh()` para actualizar los tabs — se usa `onModulesChange` con estado local

### Integridad de módulos

- [ ] `MODULE_REGISTRY` tiene los 10 módulos actuales
- [ ] `ORDERED_MODULES` ordena correctamente por `nav.order`
- [ ] `board` tiene `lock: true` y su toggle está deshabilitado en la UI
- [ ] Al desactivar un módulo, el tab desaparece inmediatamente (sin reload)
- [ ] Al navegar directamente a un módulo desactivado, aparece `ModuleDisabledView`
- [ ] `board/page.tsx` no tiene route guard (correcto — locked)
- [ ] Las 9 páginas restantes tienen route guard

### UX

- [ ] El drawer se abre y cierra con animación suave (280ms)
- [ ] Click en el overlay cierra el drawer
- [ ] Toast aparece tras toggle exitoso
- [ ] Toast de error aparece y el toggle se revierte si el server action falla
- [ ] En mobile, el label "Ajustes" se oculta y solo aparece el icono (igual que "Salir")

---

## Parte 4 — Orden de commits recomendado

```
1. feat: add Switch primitive (pre-work for module toggles)
2. feat(db): add project_modules table with RLS
3. feat(modules): add MODULE_REGISTRY, resolveModules, and unit tests
4. feat(modules): add getProjectModules and setProjectModuleEnabled actions
5. feat(modules): wire module state and drawer state through layout wrapper
6. feat(modules): make ContextTabBar dynamic from MODULE_REGISTRY
7. feat(modules): add ProjectSettingsDrawer, ModulesSettingsView, Settings button
8. feat(modules): add ModuleDisabledView and i18n keys
9. feat(modules): add route guards to all module pages
10. test(modules): add Playwright happy-path tests
```

Cada commit es funcional e independiente. Si algo falla en el build o lint, el commit inmediatamente anterior es el punto de rollback limpio.
