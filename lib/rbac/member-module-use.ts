/**
 * Roles that should get full "own content" UX for any context module tab they can see.
 * Guests stay read-only (module visibility alone does not grant write UI).
 */
const CONTRIBUTOR_ROLES = new Set([
  'team_member',
  'team_manager',
  'project_manager',
  'owner',
]);

export function isNonGuestContributorRole(roleNames: string[]): boolean {
  if (roleNames.length === 0) return false;
  if (roleNames.every((n) => n === 'guest')) return false;
  return roleNames.some((n) => CONTRIBUTOR_ROLES.has(n));
}
