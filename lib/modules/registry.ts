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
  Bot,
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
  | 'billings'
  | 'copilot';

export interface ModuleDefinition {
  key: ModuleKey;
  /** i18n key for tab label and settings list */
  labelKey: string;
  /** i18n key for description in the modules settings view */
  descriptionKey: string;
  /** Lucide icon component — NOT serializable, never pass through server boundary */
  icon: LucideIcon;
  /** Used when no DB row exists for this project+module */
  defaultEnabled: boolean;
  /**
   * If true: toggle is disabled and module is always active.
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

/**
 * Serializable version of a resolved module — safe to return from server
 * actions, store in React state, and pass through the server/client boundary.
 * The `icon` field is intentionally excluded; client components must look it
 * up from MODULE_REGISTRY[key].icon.
 */
export interface SerializableResolvedModule {
  key: ModuleKey;
  labelKey: string;
  descriptionKey: string;
  defaultEnabled: boolean;
  lock: boolean;
  enabled: boolean;
  nav: {
    showInProjectTabs: boolean;
    slug: string;
    order: number;
  };
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
    defaultEnabled: false,
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
    defaultEnabled: false,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'media', order: 4 },
  },
  calendar: {
    key: 'calendar',
    labelKey: 'context.calendar',
    descriptionKey: 'modules.calendar_description',
    icon: Calendar,
    defaultEnabled: false,
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
    defaultEnabled: false,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'links', order: 7 },
  },
  ideas: {
    key: 'ideas',
    labelKey: 'context.ideas',
    descriptionKey: 'modules.ideas_description',
    icon: Lightbulb,
    defaultEnabled: false,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'ideas', order: 8 },
  },
  budgets: {
    key: 'budgets',
    labelKey: 'context.budgets',
    descriptionKey: 'modules.budgets_description',
    icon: DollarSign,
    defaultEnabled: false,
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
  copilot: {
    key: 'copilot',
    labelKey: 'context.copilot',
    descriptionKey: 'modules.copilot_description',
    icon: Bot,
    defaultEnabled: false,
    lock: false,
    nav: { showInProjectTabs: true, slug: 'copilot', order: 11 },
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
 * Returns SerializableResolvedModule[] — safe to use across the server/client
 * boundary and to store in React state.
 * Client components that need the icon must read it from MODULE_REGISTRY[key].icon.
 */
export function resolveModules(
  dbRows: Array<{ module_key: string; enabled: boolean }>
): SerializableResolvedModule[] {
  const overrideMap = new Map(dbRows.map((r) => [r.module_key, r.enabled]));

  return ORDERED_MODULES.map((def) => ({
    key: def.key,
    labelKey: def.labelKey,
    descriptionKey: def.descriptionKey,
    defaultEnabled: def.defaultEnabled,
    lock: def.lock,
    nav: def.nav,
    enabled: def.lock ? true : (overrideMap.get(def.key) ?? def.defaultEnabled),
  }));
}

/**
 * Returns a Set of enabled module keys for fast lookup in tab bar rendering.
 */
export function getEnabledModuleKeys(
  resolved: SerializableResolvedModule[]
): Set<ModuleKey> {
  return new Set(resolved.filter((m) => m.enabled).map((m) => m.key));
}

/**
 * Default module state based on registry — used as initial UI state
 * before the DB load completes, so tabs are always visible immediately.
 */
export const DEFAULT_MODULES: SerializableResolvedModule[] = resolveModules([]);
