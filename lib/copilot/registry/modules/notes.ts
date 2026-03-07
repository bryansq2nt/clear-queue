import { captureWithContext } from '@/lib/sentry';
import type {
  NoteProposalPayload,
  DeleteNotePayload,
  UpdateNotePayload,
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

export function validateNoteShape(item: unknown): NoteProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
  if (typeof obj.content !== 'string' || !obj.content.trim()) return null;
  return {
    type: 'note',
    title: obj.title.trim(),
    content: obj.content.trim(),
  };
}

export function validateDeleteNoteShape(
  item: unknown
): DeleteNotePayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_note',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
}

export function validateUpdateNoteShape(
  item: unknown
): UpdateNotePayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;

  const result: UpdateNotePayload = {
    type: 'update_note',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
  if (typeof obj.title === 'string' && obj.title.trim())
    result.title = obj.title.trim();
  if (typeof obj.content === 'string' && obj.content.trim())
    result.content = obj.content.trim();
  return result;
}

// ─── Approve functions ────────────────────────────────────────────────────────

async function approveNote(
  _payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const { data, error } = await (ctx.supabase as any).rpc(
    'approve_copilot_proposal_atomic',
    { in_proposal_id: ctx.proposalId }
  );
  if (error) return { error: error.message ?? 'Failed to create note' };
  const result = data as { created_entity_id: string } | null;
  return { entityId: result?.created_entity_id };
}

async function approveDeleteNote(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteNotePayload;
  const { error } = await (ctx.supabase as any)
    .from('notes')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);
  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteNote',
      userIntent: 'Delete note via copilot proposal',
      expected: 'Note row deleted',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveUpdateNote(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateNotePayload;
  const updates: Record<string, unknown> = {};
  if (typeof p.title === 'string' && p.title.trim())
    updates.title = p.title.trim();
  if (typeof p.content === 'string' && p.content.trim())
    updates.content = p.content.trim();

  if (Object.keys(updates).length > 0) {
    const { error } = await (ctx.supabase as any)
      .from('notes')
      .update(updates)
      .eq('id', p.entity_id)
      .eq('owner_id', ctx.userId);
    if (error) {
      captureWithContext(error, {
        module: 'copilot',
        action: 'approveUpdateNote',
        userIntent: 'Apply update_note proposal to existing note',
        expected: 'Note fields updated',
        extra: { entityId: p.entity_id },
      });
      return { error: error.message };
    }
  }
  return { entityId: p.entity_id };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export const notesCapabilities: CopilotModuleCapability[] = [
  {
    type: 'note',
    module: 'notes',
    label: 'copilot.proposal_note',
    icon: 'FileText',
    cardVariant: 'create',
    promptDescription: 'Create a new note in the project',
    examplePayload: {
      type: 'note',
      title: 'API Integration Notes',
      content: 'Key endpoints to integrate: /auth, /users, /payments.',
    },
    validate: validateNoteShape,
    approve: approveNote,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/notes`,
    ],
  },
  {
    type: 'delete_note',
    module: 'notes',
    label: 'copilot.proposal_delete_note',
    icon: 'Trash2',
    cardVariant: 'delete',
    promptDescription: 'Delete an existing note by its entity_id',
    examplePayload: {
      type: 'delete_note',
      entity_id: '<uuid>',
      entity_title: 'Note title',
    },
    validate: validateDeleteNoteShape,
    approve: approveDeleteNote,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/notes`,
    ],
  },
  {
    type: 'update_note',
    module: 'notes',
    label: 'copilot.proposal_update_note',
    icon: 'Pencil',
    cardVariant: 'update',
    promptDescription:
      'Update title or content of an existing note by its entity_id',
    examplePayload: {
      type: 'update_note',
      entity_id: '<uuid>',
      entity_title: 'Note title',
      content: 'Updated content here.',
    },
    validate: validateUpdateNoteShape,
    approve: approveUpdateNote,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/notes`,
    ],
  },
];
