import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

import {
  assertOwnedRecord,
  assertTaskOwnedByProject,
} from '@/lib/server/authz';

describe('authz guard helpers', () => {
  test('assertOwnedRecord fails for non-owned row', async () => {
    const result = await assertOwnedRecord(
      'projects',
      crypto.randomUUID(),
      crypto.randomUUID()
    );
    expect(result.ok).toBe(false);
  });

  test('assertTaskOwnedByProject fails for cross-tenant task', async () => {
    const result = await assertTaskOwnedByProject(
      crypto.randomUUID(),
      crypto.randomUUID()
    );
    expect(result.ok).toBe(false);
  });
});
