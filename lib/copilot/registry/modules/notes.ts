import { captureWithContext } from '@/lib/sentry';
import type {
  NoteProposalPayload,
  DeleteNotePayload,
  UpdateNotePayload,
  NoteFolderProposalPayload,
  UpdateNoteFolderPayload,
  DeleteNoteFolderPayload,
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
  if (obj.folder_id === null || obj.folder_id === '') result.folder_id = null;
  else if (isValidUuid(obj.folder_id))
    result.folder_id = (obj.folder_id as string).trim();
  return result;
}

export function validateNoteFolderShape(
  item: unknown
): NoteFolderProposalPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  return {
    type: 'note_folder',
    name: obj.name.trim(),
  };
}

export function validateUpdateNoteFolderShape(
  item: unknown
): UpdateNoteFolderPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
  return {
    type: 'update_note_folder',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
    name: obj.name.trim(),
  };
}

export function validateDeleteNoteFolderShape(
  item: unknown
): DeleteNoteFolderPayload | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  if (!isValidUuid(obj.entity_id)) return null;
  return {
    type: 'delete_note_folder',
    entity_id: (obj.entity_id as string).trim(),
    entity_title:
      typeof obj.entity_title === 'string'
        ? obj.entity_title.trim()
        : undefined,
  };
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
  if (p.folder_id !== undefined)
    updates.folder_id =
      p.folder_id === null || p.folder_id === ''
        ? null
        : String(p.folder_id).trim();

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

async function approveNoteFolder(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as NoteFolderProposalPayload;
  const supabase = ctx.supabase as any;
  const { data: maxRow } = await supabase
    .from('project_note_folders')
    .select('sort_order')
    .eq('project_id', ctx.projectId)
    .eq('owner_id', ctx.userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;
  const { data, error } = await supabase
    .from('project_note_folders')
    .insert({
      project_id: ctx.projectId,
      owner_id: ctx.userId,
      name: p.name,
      sort_order: nextOrder,
    })
    .select('id')
    .single();
  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveNoteFolder',
      userIntent: 'Create note folder via copilot proposal',
      expected: 'Folder created',
      extra: { projectId: ctx.projectId },
    });
    return { error: error.message };
  }
  return { entityId: (data as { id: string }).id };
}

async function approveUpdateNoteFolder(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as UpdateNoteFolderPayload;
  const { error } = await (ctx.supabase as any)
    .from('project_note_folders')
    .update({ name: p.name })
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);
  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveUpdateNoteFolder',
      userIntent: 'Rename note folder via copilot proposal',
      expected: 'Folder updated',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
  }
  return { entityId: p.entity_id };
}

async function approveDeleteNoteFolder(
  payload: unknown,
  ctx: ApproveContext
): Promise<ApproveResult> {
  const p = payload as DeleteNoteFolderPayload;
  const { error } = await (ctx.supabase as any)
    .from('project_note_folders')
    .delete()
    .eq('id', p.entity_id)
    .eq('owner_id', ctx.userId);
  if (error) {
    captureWithContext(error, {
      module: 'copilot',
      action: 'approveDeleteNoteFolder',
      userIntent: 'Delete note folder via copilot proposal',
      expected: 'Folder deleted (notes unassigned)',
      extra: { entityId: p.entity_id },
    });
    return { error: error.message };
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
  {
    type: 'note_folder',
    module: 'notes',
    label: 'copilot.proposal_note_folder',
    icon: 'FolderPlus',
    cardVariant: 'create',
    promptDescription: 'Create a new note folder in the project',
    examplePayload: {
      type: 'note_folder',
      name: 'Meeting notes',
    },
    validate: validateNoteFolderShape,
    approve: approveNoteFolder,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/notes`,
    ],
  },
  {
    type: 'update_note_folder',
    module: 'notes',
    label: 'copilot.proposal_update_note_folder',
    icon: 'Pencil',
    cardVariant: 'update',
    promptDescription:
      'Rename an existing note folder by its entity_id (folder id)',
    examplePayload: {
      type: 'update_note_folder',
      entity_id: '<folder-uuid>',
      entity_title: 'Folder name',
      name: 'New folder name',
    },
    validate: validateUpdateNoteFolderShape,
    approve: approveUpdateNoteFolder,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/notes`,
    ],
  },
  {
    type: 'delete_note_folder',
    module: 'notes',
    label: 'copilot.proposal_delete_note_folder',
    icon: 'Trash2',
    cardVariant: 'delete',
    promptDescription:
      'Delete a note folder by its entity_id; notes inside become unassigned',
    examplePayload: {
      type: 'delete_note_folder',
      entity_id: '<folder-uuid>',
      entity_title: 'Folder name',
    },
    validate: validateDeleteNoteFolderShape,
    approve: approveDeleteNoteFolder,
    revalidatePaths: (projectId) => [
      '/dashboard',
      '/context',
      `/context/${projectId}/notes`,
    ],
  },
];
