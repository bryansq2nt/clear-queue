import { captureWithContext } from '@/lib/sentry';
import type {
  TodoItemProposalPayload,
  ToggleTodoPayload,
  DeleteTodoItemPayload,
} from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateTodoItemShape(
  item: unknown
): TodoItemProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.list_id)) return null;
  if (typeof obj.content !== 'string' || !obj.content.trim()) return null;
  return {
    type: 'todo_item',
    list_id: (obj.list_id as string).trim(),
    list_title:
      typeof obj.list_title === 'string' && obj.list_title.trim()
        ? obj.list_title.trim()
        : undefined,
    content: obj.content.trim().slice(0, 500),
    due_date:
      typeof obj.due_date === 'string' && obj.due_date.trim()
        ? obj.due_date.trim()
        : null,
  };
}

export function validateToggleTodoShape(
  item: unknown
): ToggleTodoPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'toggle_todo',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
    is_done: typeof obj.is_done === 'boolean' ? obj.is_done : undefined,
  };
}

export function validateDeleteTodoItemShape(
  item: unknown
): DeleteTodoItemPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_todo_item',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveTodoItem(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as TodoItemProposalPayload;

  const { data, error } = await (ctx.supabase as any).rpc(
    'create_todo_item_atomic',
    {
      in_list_id: p.list_id,
      in_content: p.content,
      in_due_date: p.due_date ?? null,
    }
  );

  if (error || !data) {
    captureWithContext(error ?? new Error('No data returned'), {
      module: 'copilot',
      action: 'approveTodoItem',
      userIntent: 'Create todo item via copilot proposal',
      expected: 'Todo item inserted via create_todo_item_atomic RPC',
      extra: { projectId: ctx.projectId, listId: p.list_id },
    });
    return { error: error?.message ?? 'Failed to create todo item' };
  }

  return { entityId: (data as { id: string }).id };
}

async function approveToggleTodo(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as ToggleTodoPayload;

  const { error } = await (ctx.supabase as any).rpc('toggle_todo_item_atomic', {
    in_item_id: p.entity_id,
  });

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveToggleTodo',
      userIntent: 'Toggle todo item via copilot proposal',
      expected: 'Todo item is_done toggled via toggle_todo_item_atomic RPC',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }

  return { entityId: p.entity_id };
}

async function approveDeleteTodoItem(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteTodoItemPayload;

  const { error } = await (ctx.supabase as any)
    .from('todo_items')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);

  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteTodoItem',
      userIntent: 'Delete todo item via copilot proposal',
      expected: 'Todo item row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }

  return { entityId: p.entity_id };
}

// ─── Context fetcher ──────────────────────────────────────────────────────────

export async function fetchTodosContext(
  projectId: string,
  scope: 'standard' | 'full',
  supabase: any,
  _ownerFilter: string[] | null
): Promise<string> {
  const { data: lists } = await supabase
    .from('todo_lists')
    .select('id, title')
    .eq('project_id', projectId)
    .eq('is_archived', false)
    .order('position', { ascending: true });

  const listRows = (lists ?? []) as { id: string; title: string }[];

  if (listRows.length === 0) return '## Todos\n- No todo lists yet.';

  const listIds = listRows.map((l) => l.id);

  const { data: items } = await supabase
    .from('todo_items')
    .select('id, list_id, content, is_done')
    .in('list_id', listIds)
    .order('position', { ascending: true });

  const itemRows = (items ?? []) as {
    id: string;
    list_id: string;
    content: string;
    is_done: boolean;
  }[];

  if (scope === 'full') {
    const itemsByList = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      if (!itemsByList.has(item.list_id)) itemsByList.set(item.list_id, []);
      itemsByList.get(item.list_id)!.push(item);
    }

    const sections = listRows.map((list) => {
      const listItems = itemsByList.get(list.id) ?? [];
      const lines = listItems.map(
        (i) => `  - [${i.id}] ${i.is_done ? '☑' : '☐'} ${i.content}`
      );
      const header = `### [${list.id}] ${list.title} (${listItems.length} items)`;
      return lines.length > 0
        ? `${header}\n${lines.join('\n')}`
        : `${header}\n  - (empty)`;
    });

    return `## Todos (${listRows.length} list${listRows.length !== 1 ? 's' : ''}, ${itemRows.length} items — with ids for toggle/delete)\n\nList format: [list_id] List Title\nItem format: [item_id] ☐/☑ content\n\n${sections.join('\n\n')}`;
  }

  // Standard: show list ids (needed for todo_item proposals) + summary
  const totalDone = itemRows.filter((i) => i.is_done).length;
  const listSummaries = listRows.map((l) => {
    const count = itemRows.filter((i) => i.list_id === l.id).length;
    return `[${l.id}] ${l.title} (${count} items)`;
  });

  return `## Todos\n${itemRows.length} items total (${totalDone} done).\n\nLists (use list_id for todo_item proposals):\n${listSummaries.map((s) => `- ${s}`).join('\n')}`;
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const todosCapabilities: CopilotModuleCapability[] = [
  {
    type: 'todo_item',
    module: 'todos',
    label: 'copilot.proposal_todo_item',
    icon: 'ListTodo',
    cardVariant: 'create',
    requiredAction: 'todos.create_item',
    promptDescription: 'Add a todo item to a project todo list',
    examplePayload: {
      type: 'todo_item',
      list_id: '<uuid-of-list>',
      list_title: 'Tasks',
      content: 'Review API documentation',
      due_date: null,
    },
    validate: validateTodoItemShape,
    approve: approveTodoItem,
    revalidatePaths: (projectId) => [
      '/todo',
      `/todo/project/${projectId}`,
      '/context',
    ],
  },
  {
    type: 'toggle_todo',
    module: 'todos',
    label: 'copilot.proposal_toggle_todo',
    icon: 'SquareCheck',
    cardVariant: 'update',
    requiredAction: 'todos.toggle_item',
    promptDescription:
      'Toggle a todo item done/not-done by its entity_id — only available in full context mode',
    examplePayload: {
      type: 'toggle_todo',
      entity_id: '<uuid>',
      entity_title: 'Review API documentation',
      is_done: false,
    },
    validate: validateToggleTodoShape,
    approve: approveToggleTodo,
    revalidatePaths: (projectId) => [
      '/todo',
      `/todo/project/${projectId}`,
      '/context',
    ],
  },
  {
    type: 'delete_todo_item',
    module: 'todos',
    label: 'copilot.proposal_delete_todo_item',
    icon: 'Trash2',
    cardVariant: 'delete',
    requiredAction: 'todos.delete_item',
    promptDescription:
      'Delete a todo item by its entity_id — only available in full context mode',
    examplePayload: {
      type: 'delete_todo_item',
      entity_id: '<uuid>',
      entity_title: 'Item content preview',
    },
    validate: validateDeleteTodoItemShape,
    approve: approveDeleteTodoItem,
    revalidatePaths: (projectId) => [
      '/todo',
      `/todo/project/${projectId}`,
      '/context',
    ],
  },
];
