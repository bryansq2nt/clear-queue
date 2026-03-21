import { describe, expect, it } from 'vitest';
import { isNonGuestContributorRole } from './member-module-use';

describe('isNonGuestContributorRole', () => {
  it('returns false for empty or guest-only', () => {
    expect(isNonGuestContributorRole([])).toBe(false);
    expect(isNonGuestContributorRole(['guest'])).toBe(false);
  });

  it('returns true for team_member and other contributors', () => {
    expect(isNonGuestContributorRole(['team_member'])).toBe(true);
    expect(isNonGuestContributorRole(['team_manager'])).toBe(true);
    expect(isNonGuestContributorRole(['project_manager'])).toBe(true);
    expect(isNonGuestContributorRole(['owner'])).toBe(true);
  });

  it('returns true when guest is mixed with a contributor role', () => {
    expect(isNonGuestContributorRole(['guest', 'team_member'])).toBe(true);
  });

  // Regression: pre-existing project_members had their user_role_assignments
  // TRUNCATEd by migration 20260324200000 and were never backfilled with a role.
  // getRoleIdsForUserInProject returns [] → roleNames is [] → must return false
  // (not canCreate). The fix is the 20260324200012 backfill migration, not
  // changing this function — [] correctly means "no role assigned".
  it('returns false for empty roleNames (no URA row — data gap caught by backfill migration)', () => {
    expect(isNonGuestContributorRole([])).toBe(false);
  });

  it('returns false for unknown/unrecognised role names', () => {
    // Defense: if a role name is not in CONTRIBUTOR_ROLES and not 'guest',
    // it should not grant write UX (fail-closed for unknown roles).
    expect(isNonGuestContributorRole(['viewer'])).toBe(false);
    expect(isNonGuestContributorRole(['reader'])).toBe(false);
  });
});
