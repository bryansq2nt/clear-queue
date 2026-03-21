export type TaskAssignmentRoleName =
  | 'owner'
  | 'project_manager'
  | 'team_manager'
  | 'team_member'
  | 'guest'
  | null;

export function canAssignTasksToOtherMembers(
  roleName: TaskAssignmentRoleName
): boolean {
  return (
    roleName === 'owner' ||
    roleName === 'project_manager' ||
    roleName === 'team_manager'
  );
}

export function isTeamManagerTaskAssignmentRole(
  roleName: TaskAssignmentRoleName
): boolean {
  return roleName === 'team_manager';
}
