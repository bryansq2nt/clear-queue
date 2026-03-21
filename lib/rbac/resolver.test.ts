import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock setup — vi.mock is hoisted before variable declarations,
// so we use vi.hoisted() to create the mockFrom reference first.
// ---------------------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => {
  return { mockFrom: vi.fn() };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ from: mockFrom }),
}));

// Also mock React's cache() so it becomes a passthrough in tests —
// request-scoped caching is not meaningful in unit tests.
vi.mock('react', () => ({
  cache: (fn: unknown) => fn,
}));

// Import AFTER mocking
import { can, requireCan } from './resolver';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const PROJECT_ID = 'project-xyz';
const ORG_ID = 'org-123';
const ROLE_ID_EDITOR = 'role-editor';
/** Non-owner project owner_id — must differ from USER_ID in membership tests */
const OWNER_ID = 'owner-other';

// ---------------------------------------------------------------------------
// Helper — builds a chainable Supabase query stub that resolves to `data`
// via .maybeSingle() and to `data` via .in()
// ---------------------------------------------------------------------------

function buildChain(data: unknown) {
  const result = { data, error: null };
  const chain: any = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // Make the chain itself thenable so `await chain` works for queries
    // that end with .eq() (Supabase query builder pattern)
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Helper — wires mockFrom for the full project-scope resolution path.
//
// Tables queried in order across can() for a project-scope resource:
//  1. project_members        → membership check (maybeSingle)
//  2. user_role_assignments  → project role_ids (eq chain → resolved array)
//  3. projects               → org_id + owner_id (maybeSingle); may be queried twice
//  4. user_role_assignments  → org role_ids (eq chain → resolved array)
//  5. rbac_role_module_actions → expand roles to action keys (.in → resolved)
// ---------------------------------------------------------------------------

function setupProjectScope(opts: {
  isMember?: boolean;
  projectRoleIds?: string[];
  orgRoleIds?: string[];
  actionKeys?: string[];
  orgId?: string;
}) {
  const {
    isMember = true,
    projectRoleIds = [ROLE_ID_EDITOR],
    orgRoleIds = [],
    actionKeys = [],
    orgId = ORG_ID,
  } = opts;

  // Track how many times user_role_assignments is queried
  let uraCallCount = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'project_members') {
      return buildChain(isMember ? { id: 'member-row' } : null);
    }
    if (table === 'user_role_assignments') {
      uraCallCount++;
      if (uraCallCount === 1) {
        return buildChain(projectRoleIds.map((r) => ({ role_id: r })));
      }
      return buildChain(orgRoleIds.map((r) => ({ role_id: r })));
    }
    if (table === 'projects') {
      return buildChain({ org_id: orgId, owner_id: OWNER_ID });
    }
    if (table === 'rbac_role_module_actions') {
      return buildChain(
        actionKeys.map((k) => ({ rbac_module_actions: { action_key: k } }))
      );
    }
    return buildChain(null);
  });
}

function setupOrgScope(opts: {
  isMember?: boolean;
  orgRoleIds?: string[];
  actionKeys?: string[];
}) {
  const {
    isMember = true,
    orgRoleIds = [ROLE_ID_EDITOR],
    actionKeys = [],
  } = opts;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'organization_members') {
      return buildChain(isMember ? { id: 'member-row' } : null);
    }
    if (table === 'user_role_assignments') {
      return buildChain(orgRoleIds.map((r) => ({ role_id: r })));
    }
    if (table === 'rbac_role_module_actions') {
      return buildChain(
        actionKeys.map((k) => ({ rbac_module_actions: { action_key: k } }))
      );
    }
    return buildChain(null);
  });
}

// ---------------------------------------------------------------------------
// Tests — own scope
// ---------------------------------------------------------------------------

describe("can() — 'own' scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('returns true without any DB queries', async () => {
    const result = await can(USER_ID, 'profile.update_display_name', {
      type: 'own',
    });
    expect(result).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — membership gate
// ---------------------------------------------------------------------------

describe('can() — membership gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('returns false immediately when user is not a project member', async () => {
    setupProjectScope({ isMember: false });
    const result = await can(USER_ID, 'tasks.create', {
      type: 'task',
      projectId: PROJECT_ID,
    });
    expect(result).toBe(false);
  });

  it('returns false immediately when user is not an org member', async () => {
    setupOrgScope({ isMember: false });
    const result = await can(USER_ID, 'clients.create', {
      type: 'client',
      orgId: ORG_ID,
    });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — granted path
// ---------------------------------------------------------------------------

describe('can() — granted path (project scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('returns true when action is in the granted set', async () => {
    setupProjectScope({
      actionKeys: ['tasks.create', 'tasks.delete', 'notes.read'],
    });
    expect(
      await can(USER_ID, 'tasks.create', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).toBe(true);
  });

  it('returns false when action is not in the granted set', async () => {
    setupProjectScope({ actionKeys: ['tasks.read', 'notes.read'] });
    expect(
      await can(USER_ID, 'tasks.delete', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).toBe(false);
  });

  it('returns false when granted set is empty (no roles)', async () => {
    setupProjectScope({ projectRoleIds: [], orgRoleIds: [], actionKeys: [] });
    expect(
      await can(USER_ID, 'tasks.create', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).toBe(false);
  });

  it('returns true when URA has no rows but user is project member (team_member fallback)', async () => {
    const TM_ROLE_ID = 'role-team-member';
    let uraCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'project_members') {
        return buildChain({ id: 'member-row' });
      }
      if (table === 'projects') {
        return buildChain({ org_id: ORG_ID, owner_id: OWNER_ID });
      }
      if (table === 'user_role_assignments') {
        uraCallCount++;
        if (uraCallCount === 1) {
          return buildChain([]);
        }
        return buildChain([]);
      }
      if (table === 'rbac_roles') {
        return buildChain({ id: TM_ROLE_ID });
      }
      if (table === 'rbac_role_module_actions') {
        return buildChain([
          { rbac_module_actions: { action_key: 'tasks.create' } },
        ]);
      }
      return buildChain(null);
    });

    expect(
      await can(USER_ID, 'tasks.create', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).toBe(true);
  });

  it('returns false when role IDs exist but expand to no action keys', async () => {
    setupProjectScope({
      projectRoleIds: [ROLE_ID_EDITOR],
      actionKeys: [], // RPC returns nothing for this role
    });
    expect(
      await can(USER_ID, 'tasks.create', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — multi-role union
// ---------------------------------------------------------------------------

describe('can() — multi-role union semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('grants access when action is only in org-level role, not project role', async () => {
    // project role grants tasks.read only; org role grants tasks.bulk_delete
    setupProjectScope({
      projectRoleIds: ['role-viewer'],
      orgRoleIds: ['role-owner'],
      actionKeys: ['tasks.read', 'tasks.bulk_delete'],
    });
    expect(
      await can(USER_ID, 'tasks.bulk_delete', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — org scope
// ---------------------------------------------------------------------------

describe('can() — org scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('returns true for org-scoped action when permission is granted', async () => {
    setupOrgScope({ actionKeys: ['clients.create', 'clients.read'] });
    expect(
      await can(USER_ID, 'clients.create', { type: 'client', orgId: ORG_ID })
    ).toBe(true);
  });

  it('returns false for org-scoped action when permission not granted', async () => {
    setupOrgScope({ actionKeys: ['clients.read'] });
    expect(
      await can(USER_ID, 'clients.delete', { type: 'client', orgId: ORG_ID })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — requireCan()
// ---------------------------------------------------------------------------

describe('requireCan()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it('resolves without throwing when permission is granted', async () => {
    setupProjectScope({ actionKeys: ['tasks.create'] });
    await expect(
      requireCan(USER_ID, 'tasks.create', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).resolves.toBeUndefined();
  });

  it('throws Forbidden error with the action key when permission is denied', async () => {
    setupProjectScope({ actionKeys: ['tasks.read'] }); // missing tasks.delete
    await expect(
      requireCan(USER_ID, 'tasks.delete', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).rejects.toThrow("Forbidden: missing permission 'tasks.delete'");
  });

  it('throws when user is not a project member', async () => {
    setupProjectScope({ isMember: false });
    await expect(
      requireCan(USER_ID, 'tasks.create', {
        type: 'task',
        projectId: PROJECT_ID,
      })
    ).rejects.toThrow('Forbidden');
  });

  it('resolves for own-scope without DB queries', async () => {
    await expect(
      requireCan(USER_ID, 'profile.update_display_name', { type: 'own' })
    ).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — all project-scoped resource types route to project_members check
// ---------------------------------------------------------------------------

describe('can() — project-scoped resource type routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  const projectTypes = [
    'task',
    'note',
    'milestone',
    'document',
    'media',
    'link',
    'idea',
    'budget',
    'billing',
    'todo',
    'calendar_event',
  ] as const;

  for (const type of projectTypes) {
    it(`queries project_members for resource type '${type}'`, async () => {
      setupProjectScope({ actionKeys: ['tasks.read'] });
      await can(USER_ID, 'tasks.read', { type, projectId: PROJECT_ID });
      const projectMembersCalls = mockFrom.mock.calls.filter(
        (c) => c[0] === 'project_members'
      );
      expect(projectMembersCalls.length).toBeGreaterThan(0);
    });
  }
});
