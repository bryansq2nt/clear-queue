import { DEFAULT_USER_ID, OWNER_ROLE_ID } from './constants';
import { getLocalStore, getTableRows, persistLocalStore } from './store';
import { newId, nowIso } from './utils';

type RpcResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

function ok(data: unknown): RpcResult {
  return { data, error: null };
}

function fail(message: string, code?: string): RpcResult {
  return { data: null, error: { message, code } };
}

function getCurrentUserId(sessionUserId?: string | null): string {
  return sessionUserId ?? DEFAULT_USER_ID;
}

function minOrderIndex(projectId: string, status: string): number {
  const tasks = getTableRows('tasks').filter(
    (t) => t.project_id === projectId && t.status === status
  );
  if (tasks.length === 0) return 0;
  const min = Math.min(...tasks.map((t) => Number(t.order_index ?? 0)));
  return min - 1;
}

export function executeLocalRpc(
  name: string,
  args: Record<string, unknown>,
  sessionUserId?: string | null
): RpcResult {
  switch (name) {
    case 'create_project_atomic':
      return createProjectAtomic(args, sessionUserId);
    case 'create_task_atomic':
      return createTaskAtomic(args, sessionUserId);
    case 'move_task_atomic':
      return moveTaskAtomic(args);
    case 'create_todo_item_atomic':
      return createTodoItemAtomic(args);
    case 'toggle_todo_item_atomic':
      return toggleTodoItemAtomic(args);
    case 'duplicate_budget_atomic':
      return duplicateBudgetAtomic(args);
    case 'reorder_links_atomic':
      return reorderLinksAtomic(args);
    case 'check_project_member_quota':
    case 'check_org_project_quota':
      return ok(true);
    case 'get_project_todo_summary':
      return getProjectTodoSummary(args);
    case 'get_project_calendar_feed':
      return getProjectCalendarFeed(args);
    case 'get_project_members_with_profile':
      return getProjectMembersWithProfile(args);
    case 'sync_invite_pending_notifications_for_current_user':
      return ok(null);
    case 'is_project_member':
      return ok(isProjectMember(args.p_project_id as string));
    case 'project_has_member_with_email':
      return ok(false);
    default:
      return fail(`RPC "${name}" is not implemented in local mode`);
  }
}

function createProjectAtomic(
  args: Record<string, unknown>,
  sessionUserId?: string | null
): RpcResult {
  const userId = getCurrentUserId(sessionUserId);
  const name = String(args.in_name ?? '').trim();
  if (!name) return fail('Project name is required');

  const timestamp = nowIso();
  const project = {
    id: newId(),
    name,
    color: (args.in_color as string | null) ?? null,
    category: (args.in_category as string) ?? 'business',
    notes: null,
    owner_id: userId,
    org_id: (args.in_org_id as string | null) ?? null,
    client_id: (args.in_client_id as string | null) ?? null,
    business_id: (args.in_business_id as string | null) ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  getTableRows('projects').push(project);
  getTableRows('project_members').push({
    id: newId(),
    project_id: project.id,
    user_id: userId,
    invited_by: userId,
    joined_at: timestamp,
    created_at: timestamp,
  });
  getTableRows('user_role_assignments').push({
    id: newId(),
    user_id: userId,
    role_id: OWNER_ROLE_ID,
    project_id: project.id,
    org_id: null,
    assigned_by: userId,
    created_at: timestamp,
  });

  persistLocalStore();
  return ok(project);
}

function createTaskAtomic(
  args: Record<string, unknown>,
  sessionUserId?: string | null
): RpcResult {
  const userId = getCurrentUserId(sessionUserId);
  const projectId = args.in_project_id as string;
  const title = String(args.in_title ?? '').trim();
  const status = (args.in_status as string) ?? 'next';

  if (!projectId) return fail('project_id is required');
  if (!title) return fail('title is required');
  if (!isProjectMember(projectId, userId)) {
    return fail('Access denied: not a project owner or member');
  }

  const timestamp = nowIso();
  const task = {
    id: newId(),
    project_id: projectId,
    title,
    status,
    priority: Number(args.in_priority ?? 3),
    due_date: (args.in_due_date as string | null) ?? null,
    notes: (args.in_notes as string | null) ?? null,
    tags: (args.in_tags as string | null) ?? null,
    milestone_id: (args.in_milestone_id as string | null) ?? null,
    assigned_to: (args.in_assigned_to as string | null) ?? userId,
    created_by: userId,
    order_index: minOrderIndex(projectId, status),
    created_at: timestamp,
    updated_at: timestamp,
  };

  getTableRows('tasks').push(task);
  persistLocalStore();
  return ok(task);
}

function moveTaskAtomic(args: Record<string, unknown>): RpcResult {
  const taskId = args.in_task_id as string;
  const newStatus = args.in_new_status as string;
  const newOrderIndex = Number(args.in_new_order_index);

  const tasks = getTableRows('tasks');
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return fail('Task not found');

  tasks[idx] = {
    ...tasks[idx],
    status: newStatus,
    order_index: newOrderIndex,
    updated_at: nowIso(),
  };
  persistLocalStore();
  return ok(tasks[idx]);
}

function createTodoItemAtomic(args: Record<string, unknown>): RpcResult {
  const listId = args.in_list_id as string;
  const content = String(args.in_content ?? '').trim();
  if (!content) return fail('Item content is required');

  const lists = getTableRows('todo_lists');
  const list = lists.find((l) => l.id === listId);
  if (!list) return fail('Todo list not found');

  const items = getTableRows('todo_items').filter((i) => i.list_id === listId);
  const maxPos = items.reduce(
    (max, i) => Math.max(max, Number(i.position ?? 0)),
    -1
  );

  const timestamp = nowIso();
  const item = {
    id: newId(),
    owner_id: getCurrentUserId(),
    list_id: listId,
    content,
    is_done: false,
    due_date: (args.in_due_date as string | null) ?? null,
    position: maxPos + 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  getTableRows('todo_items').push(item);
  persistLocalStore();
  return ok(item);
}

function toggleTodoItemAtomic(args: Record<string, unknown>): RpcResult {
  const itemId = args.in_item_id as string;
  const items = getTableRows('todo_items');
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return fail('Todo item not found');

  items[idx] = {
    ...items[idx],
    is_done: !items[idx].is_done,
    updated_at: nowIso(),
  };
  persistLocalStore();
  return ok(items[idx]);
}

function duplicateBudgetAtomic(args: Record<string, unknown>): RpcResult {
  const sourceId = (args.source_id ?? args.in_source_budget_id) as string;
  const budgets = getTableRows('budgets');
  const source = budgets.find((b) => b.id === sourceId);
  if (!source) return fail('Budget not found');

  const timestamp = nowIso();
  const newBudgetId = newId();
  const newBudget = {
    ...source,
    id: newBudgetId,
    title: `${source.title} (copy)`,
    created_at: timestamp,
    updated_at: timestamp,
  };
  budgets.push(newBudget);

  const categories = getTableRows('budget_categories').filter(
    (c) => c.budget_id === sourceId
  );
  const catIdMap = new Map<string, string>();
  for (const cat of categories) {
    const newCatId = newId();
    catIdMap.set(cat.id as string, newCatId);
    getTableRows('budget_categories').push({
      ...cat,
      id: newCatId,
      budget_id: newBudgetId,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  const items = getTableRows('budget_items').filter(
    (i) => i.budget_id === sourceId
  );
  for (const item of items) {
    getTableRows('budget_items').push({
      ...item,
      id: newId(),
      budget_id: newBudgetId,
      category_id: catIdMap.get(item.category_id as string) ?? item.category_id,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  persistLocalStore();
  return ok(newBudgetId);
}

function reorderLinksAtomic(args: Record<string, unknown>): RpcResult {
  const linkIds = (args.in_link_ids as string[]) ?? [];
  const links = getTableRows('project_links');
  linkIds.forEach((id, index) => {
    const row = links.find((l) => l.id === id);
    if (row) {
      row.sort_order = index;
      row.updated_at = nowIso();
    }
  });
  persistLocalStore();
  return ok(null);
}

function getProjectTodoSummary(args: Record<string, unknown>): RpcResult {
  const projectId = args.p_project_id as string;
  const lists = getTableRows('todo_lists').filter(
    (l) => l.project_id === projectId && !l.is_archived
  );
  const items = getTableRows('todo_items');
  const summary = lists.map((list) => {
    const listItems = items.filter((i) => i.list_id === list.id);
    return {
      list_id: list.id,
      title: list.title,
      total: listItems.length,
      done: listItems.filter((i) => i.is_done).length,
    };
  });
  return ok(summary);
}

function getProjectCalendarFeed(args: Record<string, unknown>): RpcResult {
  const projectId = args.p_project_id as string;
  const events = getTableRows('calendar_events').filter(
    (e) => e.project_id === projectId
  );
  return ok(events);
}

function getMemberRoles(
  userId: string,
  projectId: string
): Array<{ id: string; name: string }> {
  const roleIds = getTableRows('user_role_assignments')
    .filter(
      (ura) =>
        ura.user_id === userId && ura.project_id === projectId && ura.role_id
    )
    .map((ura) => ura.role_id as string);

  const roles = getTableRows('rbac_roles')
    .filter((r) => roleIds.includes(r.id as string))
    .map((r) => ({ id: r.id as string, name: r.name as string }));

  if (roles.length > 0) return roles;

  const project = getTableRows('projects').find((p) => p.id === projectId);
  if (project?.owner_id === userId) {
    const ownerRole = getTableRows('rbac_roles').find(
      (r) => r.name === 'owner' && r.is_system_role === true
    );
    if (ownerRole) {
      return [{ id: ownerRole.id as string, name: ownerRole.name as string }];
    }
  }

  return [];
}

function getProjectMembersWithProfile(
  args: Record<string, unknown>
): RpcResult {
  const projectId = args.p_project_id as string;
  const members = getTableRows('project_members').filter(
    (m) => m.project_id === projectId
  );
  const profiles = getTableRows('profiles');
  const users = getLocalStore().auth.users;

  const result = members.map((m) => {
    const userId = m.user_id as string;
    const profile = profiles.find((p) => p.user_id === userId);
    const email =
      users.find((u) => u.id === userId)?.email ?? 'unknown@local.dev';
    const displayName =
      (typeof profile?.display_name === 'string' &&
        profile.display_name.trim()) ||
      email.split('@')[0];

    return {
      user_id: userId,
      email,
      display_name: displayName,
      joined_at:
        (m.joined_at as string) ?? (m.created_at as string) ?? nowIso(),
      roles: getMemberRoles(userId, projectId),
    };
  });

  return ok(result);
}

function isProjectMember(projectId: string, userId?: string): boolean {
  const uid = userId ?? DEFAULT_USER_ID;
  const project = getTableRows('projects').find((p) => p.id === projectId);
  if (project?.owner_id === uid) return true;
  return getTableRows('project_members').some(
    (m) => m.project_id === projectId && m.user_id === uid
  );
}
