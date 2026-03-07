import { captureWithContext } from '@/lib/sentry';
import type {
  TaskProposalPayload,
  DeleteTaskPayload,
  UpdateTaskPayload,
} from '@/lib/copilot/schema';
import type {
  CopilotModuleCapability,
  ApproveContext,
  ApproveResult,
} from '@/lib/copilot/registry/types';

const VALID_TASK_STATUSES = new Set([
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateTaskShape(item: unknown): TaskProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
  const status =
    typeof obj.status === 'string' && VALID_TASK_STATUSES.has(obj.status)
      ? obj.status
      : 'backlog';
  const priority =
    typeof obj.priority === 'number' &&
    Number.isInteger(obj.priority) &&
    obj.priority >= 1 &&
    obj.priority <= 5
      ? obj.priority
      : undefined;

  const rawMilestoneId =
    typeof obj.milestone_id === 'string' ? obj.milestone_id.trim() : null;
  const milestoneId =
    rawMilestoneId && UUID_RE.test(rawMilestoneId) ? rawMilestoneId : null;

  const milestoneTitle =
    typeof obj.milestone_title === 'string' && obj.milestone_title.trim()
      ? obj.milestone_title.trim()
      : null;

  return {
    type: 'task',
    title: obj.title.trim(),
    status,
    priority,
    notes: typeof obj.notes === 'string' ? obj.notes : null,
    tags: typeof obj.tags === 'string' ? obj.tags : null,
    due_date: typeof obj.due_date === 'string' ? obj.due_date : null,
    milestone_id: milestoneId,
    milestone_title: milestoneTitle,
  };
}

export function validateDeleteTaskShape(
  item: unknown
): DeleteTaskPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_task',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateUpdateTaskShape(
  item: unknown
): UpdateTaskPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;

  const result: UpdateTaskPayload = {
    type: 'update_task',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.title === 'string' && obj.title.trim())
    result.title = obj.title.trim();
  if (typeof obj.status === 'string' && VALID_TASK_STATUSES.has(obj.status))
    result.status = obj.status;
  if (
    typeof obj.priority === 'number' &&
    Number.isInteger(obj.priority) &&
    obj.priority >= 1 &&
    obj.priority <= 5
  )
    result.priority = obj.priority;
  if (obj.notes !== undefined)
    result.notes = typeof obj.notes === 'string' ? obj.notes : null;
  if (obj.tags !== undefined)
    result.tags = typeof obj.tags === 'string' ? obj.tags : null;
  if (obj.due_date !== undefined)
    result.due_date = typeof obj.due_date === 'string' ? obj.due_date : null;
  if (obj.milestone_id !== undefined) {
    const mid =
      typeof obj.milestone_id === 'string' ? obj.milestone_id.trim() : null;
    result.milestone_id = mid && UUID_RE.test(mid) ? mid : null;
  }
  return result;
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveTask(
  _payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const { data, error } = await (ctx.supabase as any).rpc(
    'approve_copilot_proposal_atomic',
    { in_proposal_id: ctx.proposalId }
  );
  if (error) return { error: error.message ?? 'Failed to create task' };
  const result = data as { created_entity_id: string } | null;
  return { entityId: result?.created_entity_id };
}

async function approveDeleteTask(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteTaskPayload;
  const { error } = await (ctx.supabase as any)
    .from('tasks')
    .delete()
    .eq('id', p.entity_id);
  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteTask',
      userIntent: 'Delete task via copilot proposal',
      expected: 'Task row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveUpdateTask(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateTaskPayload;
  const updates: Record<string, unknown> = {};
  if (typeof p.title === 'string' && p.title.trim())
    updates.title = p.title.trim();
  if (typeof p.status === 'string') updates.status = p.status;
  if (typeof p.priority === 'number') updates.priority = Math.floor(p.priority);
  if (p.notes !== undefined)
    updates.notes = p.notes === null ? null : String(p.notes);
  if (p.tags !== undefined)
    updates.tags = p.tags === null ? null : String(p.tags);
  if (p.due_date !== undefined)
    updates.due_date = p.due_date === null ? null : String(p.due_date);
  if (p.milestone_id !== undefined)
    updates.milestone_id =
      typeof p.milestone_id === 'string' && UUID_RE.test(p.milestone_id.trim())
        ? p.milestone_id.trim()
        : null;

  if (Object.keys(updates).length > 0) {
    const { error } = await (ctx.supabase as any)
      .from('tasks')
      .update(updates)
      .eq('id', p.entity_id);
    if (error) {
      captureWithContext(error, {
        module: 'copilot',
        action: 'approveUpdateTask',
        userIntent: 'Apply update_task proposal to existing task',
        expected: 'Task fields updated',
        extra: { entityId: p.entity_id },
      });
      return { error: error.message };
    }
  }
  return { entityId: p.entity_id };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const tasksCapabilities: CopilotModuleCapability[] = [
  {
    type: 'task',
    module: 'tasks',
    label: 'copilot.proposal_task',
    icon: 'CheckSquare',
    cardVariant: 'create',
    promptDescription: 'Create a new task in the project board',
    examplePayload: {
      type: 'task',
      title: 'Set up CI/CD pipeline',
      status: 'next',
      priority: 3,
    },
    validate: validateTaskShape,
    approve: approveTask,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/board`,
      `/context/${projectId}/milestones`,
    ],
  },
  {
    type: 'delete_task',
    module: 'tasks',
    label: 'copilot.proposal_delete_task',
    icon: 'Trash2',
    cardVariant: 'delete',
    promptDescription: 'Delete an existing task by its entity_id',
    examplePayload: {
      type: 'delete_task',
      entity_id: '<uuid>',
      entity_title: 'Task title',
    },
    validate: validateDeleteTaskShape,
    approve: approveDeleteTask,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/board`,
    ],
  },
  {
    type: 'update_task',
    module: 'tasks',
    label: 'copilot.proposal_update_task',
    icon: 'Pencil',
    cardVariant: 'update',
    promptDescription: 'Update fields of an existing task by its entity_id',
    examplePayload: {
      type: 'update_task',
      entity_id: '<uuid>',
      entity_title: 'Task title',
      status: 'done',
    },
    validate: validateUpdateTaskShape,
    approve: approveUpdateTask,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/board`,
    ],
  },
];
