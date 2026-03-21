import { describe, expect, it } from 'vitest';
import {
  canAssignTasksToOtherMembers,
  isTeamManagerTaskAssignmentRole,
} from './task-assignment';

describe('task assignment RBAC helpers', () => {
  it('only allows owner, project_manager, and team_manager to assign others', () => {
    expect(canAssignTasksToOtherMembers('owner')).toBe(true);
    expect(canAssignTasksToOtherMembers('project_manager')).toBe(true);
    expect(canAssignTasksToOtherMembers('team_manager')).toBe(true);

    expect(canAssignTasksToOtherMembers('team_member')).toBe(false);
    expect(canAssignTasksToOtherMembers('guest')).toBe(false);
    expect(canAssignTasksToOtherMembers(null)).toBe(false);
  });

  it('flags only team_manager for managed-team assignment scope', () => {
    expect(isTeamManagerTaskAssignmentRole('team_manager')).toBe(true);
    expect(isTeamManagerTaskAssignmentRole('owner')).toBe(false);
    expect(isTeamManagerTaskAssignmentRole('project_manager')).toBe(false);
    expect(isTeamManagerTaskAssignmentRole('team_member')).toBe(false);
    expect(isTeamManagerTaskAssignmentRole(null)).toBe(false);
  });
});
