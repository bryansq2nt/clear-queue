import { captureWithContext } from '@/lib/sentry';
import type {
  MilestoneProposalPayload,
  DeleteMilestonePayload,
  UpdateMilestonePayload,
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

export function validateMilestoneShape(
  item: unknown
): MilestoneProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
  const description =
    typeof obj.description === 'string' && obj.description.trim()
      ? obj.description.trim().slice(0, 2000)
      : null;
  return {
    type: 'milestone',
    title: obj.title.trim().slice(0, 200),
    description,
  };
}

export function validateDeleteMilestoneShape(
  item: unknown
): DeleteMilestonePayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_milestone',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateUpdateMilestoneShape(
  item: unknown
): UpdateMilestonePayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;

  const result: UpdateMilestonePayload = {
    type: 'update_milestone',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.title === 'string' && obj.title.trim())
    result.title = obj.title.trim().slice(0, 200);
  if (obj.description !== undefined)
    result.description =
      typeof obj.description === 'string'
        ? obj.description.trim() || null
        : null;
  return result;
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveMilestone(
  _payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const { data, error } = await (ctx.supabase as any).rpc(
    'approve_copilot_proposal_atomic',
    { in_proposal_id: ctx.proposalId }
  );
  if (error) return { error: error.message ?? 'Failed to create milestone' };
  const result = data as { created_entity_id: string } | null;
  return { entityId: result?.created_entity_id };
}

async function approveDeleteMilestone(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteMilestonePayload;
  const { error } = await (ctx.supabase as any)
    .from('milestones')
    .delete()
    .eq('id', p.entity_id);
  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteMilestone',
      userIntent: 'Delete milestone via copilot proposal',
      expected: 'Milestone row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveUpdateMilestone(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateMilestonePayload;
  const updates: Record<string, unknown> = {};
  if (typeof p.title === 'string' && p.title.trim())
    updates.title = p.title.trim().slice(0, 200);
  if (p.description !== undefined)
    updates.description =
      typeof p.description === 'string' ? p.description.trim() || null : null;

  if (Object.keys(updates).length > 0) {
    const { error } = await (ctx.supabase as any)
      .from('milestones')
      .update(updates)
      .eq('id', p.entity_id);
    if (error) {
      captureWithContext(error, {
        module: 'copilot',
        action: 'approveUpdateMilestone',
        userIntent: 'Apply update_milestone proposal to existing milestone',
        expected: 'Milestone fields updated',
        extra: { entityId: p.entity_id },
      });
      return { error: error.message };
    }
  }
  return { entityId: p.entity_id };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const milestonesCapabilities: CopilotModuleCapability[] = [
  {
    type: 'milestone',
    module: 'milestones',
    label: 'copilot.proposal_milestone',
    icon: 'Flag',
    cardVariant: 'create',
    requiredAction: 'milestones.create',
    promptDescription: 'Create a new project milestone',
    examplePayload: {
      type: 'milestone',
      title: 'Beta Launch',
      description: 'All core features complete and tested.',
    },
    validate: validateMilestoneShape,
    approve: approveMilestone,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/milestones`,
    ],
  },
  {
    type: 'delete_milestone',
    module: 'milestones',
    label: 'copilot.proposal_delete_milestone',
    icon: 'Trash2',
    cardVariant: 'delete',
    requiredAction: 'milestones.delete',
    promptDescription: 'Delete an existing milestone by its entity_id',
    examplePayload: {
      type: 'delete_milestone',
      entity_id: '<uuid>',
      entity_title: 'Milestone title',
    },
    validate: validateDeleteMilestoneShape,
    approve: approveDeleteMilestone,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/milestones`,
      `/context/${projectId}/board`,
    ],
  },
  {
    type: 'update_milestone',
    module: 'milestones',
    label: 'copilot.proposal_update_milestone',
    icon: 'Pencil',
    cardVariant: 'update',
    requiredAction: 'milestones.update',
    promptDescription:
      'Update title or description of an existing milestone by its entity_id',
    examplePayload: {
      type: 'update_milestone',
      entity_id: '<uuid>',
      entity_title: 'Milestone title',
      description: 'Updated scope.',
    },
    validate: validateUpdateMilestoneShape,
    approve: approveUpdateMilestone,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/milestones`,
    ],
  },
];
