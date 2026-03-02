import { describe, it, expect } from 'vitest';
import {
  MODULE_REGISTRY,
  ORDERED_MODULES,
  DEFAULT_MODULES,
  resolveModules,
  getEnabledModuleKeys,
  type ModuleKey,
  type SerializableResolvedModule,
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

  it('no other module is locked by default', () => {
    const lockedKeys = ORDERED_MODULES.filter((m) => m.lock).map((m) => m.key);
    expect(lockedKeys).toEqual(['board']);
  });

  it('default active modules are board, documents, notes, billings', () => {
    const defaultOn = ORDERED_MODULES.filter((m) => m.defaultEnabled).map(
      (m) => m.key
    );
    expect(defaultOn).toContain('board');
    expect(defaultOn).toContain('documents');
    expect(defaultOn).toContain('notes');
    expect(defaultOn).toContain('billings');
  });

  it('default inactive modules are owner, media, calendar, links, ideas, budgets', () => {
    const defaultOff = ORDERED_MODULES.filter((m) => !m.defaultEnabled).map(
      (m) => m.key
    );
    expect(defaultOff).toContain('owner');
    expect(defaultOff).toContain('media');
    expect(defaultOff).toContain('calendar');
    expect(defaultOff).toContain('links');
    expect(defaultOff).toContain('ideas');
    expect(defaultOff).toContain('budgets');
  });
});

describe('resolveModules', () => {
  it('returns SerializableResolvedModule — no icon field', () => {
    const resolved = resolveModules([]);
    for (const mod of resolved) {
      expect((mod as any).icon).toBeUndefined();
    }
  });

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
    const resolved = resolveModules([{ module_key: 'media', enabled: true }]);
    const media = resolved.find((m) => m.key === 'media')!;
    expect(media.enabled).toBe(true); // overridden from false to true
  });

  it('applies DB disabled override correctly', () => {
    const resolved = resolveModules([{ module_key: 'notes', enabled: false }]);
    const notes = resolved.find((m) => m.key === 'notes')!;
    expect(notes.enabled).toBe(false); // overridden from true to false
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
    expect(resolved.length).toBe(ORDERED_MODULES.length);
  });

  it('returns all modules (not just overridden ones)', () => {
    const resolved = resolveModules([{ module_key: 'media', enabled: true }]);
    expect(resolved.length).toBe(ORDERED_MODULES.length);
  });

  it('preserves registry order', () => {
    const resolved = resolveModules([]);
    for (let i = 0; i < resolved.length; i++) {
      expect(resolved[i].key).toBe(ORDERED_MODULES[i].key);
    }
  });
});

describe('getEnabledModuleKeys', () => {
  it('returns only enabled keys', () => {
    const resolved = resolveModules([]);
    const keys = getEnabledModuleKeys(resolved);
    // board, documents, notes, billings are defaultEnabled=true
    expect(keys.has('board')).toBe(true);
    expect(keys.has('documents')).toBe(true);
    expect(keys.has('notes')).toBe(true);
    expect(keys.has('billings')).toBe(true);
    // others are defaultEnabled=false
    expect(keys.has('media')).toBe(false);
    expect(keys.has('calendar')).toBe(false);
    expect(keys.has('owner')).toBe(false);
  });

  it('returns a Set', () => {
    const resolved = resolveModules([]);
    const keys = getEnabledModuleKeys(resolved);
    expect(keys).toBeInstanceOf(Set);
  });

  it('board is always in the enabled set even if DB says false', () => {
    const resolved = resolveModules([{ module_key: 'board', enabled: false }]);
    const keys = getEnabledModuleKeys(resolved);
    expect(keys.has('board')).toBe(true);
  });
});

describe('DEFAULT_MODULES', () => {
  it('is populated with all modules', () => {
    expect(DEFAULT_MODULES.length).toBe(ORDERED_MODULES.length);
  });

  it('has no icon field (serializable)', () => {
    for (const mod of DEFAULT_MODULES) {
      expect((mod as any).icon).toBeUndefined();
    }
  });

  it('board is enabled in defaults', () => {
    const board = DEFAULT_MODULES.find((m) => m.key === 'board')!;
    expect(board.enabled).toBe(true);
  });
});
