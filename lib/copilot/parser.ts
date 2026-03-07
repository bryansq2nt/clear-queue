import { captureWithContext } from '@/lib/sentry';
import type {
  TaskProposalPayload,
  NoteProposalPayload,
  MilestoneProposalPayload,
  DeleteMilestonePayload,
  UpdateMilestonePayload,
  DeleteTaskPayload,
  UpdateTaskPayload,
  DeleteNotePayload,
  UpdateNotePayload,
} from './schema';

export type ParsedProposal =
  | TaskProposalPayload
  | NoteProposalPayload
  | MilestoneProposalPayload
  | DeleteMilestonePayload
  | UpdateMilestonePayload
  | DeleteTaskPayload
  | UpdateTaskPayload
  | DeleteNotePayload
  | UpdateNotePayload;

const VALID_TASK_STATUSES = new Set([
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
]);

// Basic UUID v4 shape check (8-4-4-4-12 hex groups)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

// ─── Create validators ────────────────────────────────────────────────────────

function validateTaskShape(item: unknown): TaskProposalPayload | null {
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

function validateNoteShape(item: unknown): NoteProposalPayload | null {
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

function validateMilestoneShape(
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

// ─── Mutation validators ──────────────────────────────────────────────────────

function validateDeleteMilestoneShape(
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

function validateUpdateMilestoneShape(
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

function validateDeleteTaskShape(item: unknown): DeleteTaskPayload | null {
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

function validateUpdateTaskShape(item: unknown): UpdateTaskPayload | null {
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

function validateDeleteNoteShape(item: unknown): DeleteNotePayload | null {
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

function validateUpdateNoteShape(item: unknown): UpdateNotePayload | null {
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

// ─── Proposals parser ─────────────────────────────────────────────────────────

/**
 * Extracts and validates structured proposals from an assistant message.
 * Returns an empty array on any parse failure — never throws.
 * The <<PROPOSALS>> block must be at the end of the message content.
 */
export function parseProposals(content: string): ParsedProposal[] {
  const match = content.match(/<<PROPOSALS>>([\s\S]*?)<<\/PROPOSALS>>/);
  if (!match) return [];

  const raw = match[1].trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const result: ParsedProposal[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      let validated: ParsedProposal | null = null;

      switch (obj.type) {
        case 'task':
          validated = validateTaskShape(item);
          break;
        case 'note':
          validated = validateNoteShape(item);
          break;
        case 'milestone':
          validated = validateMilestoneShape(item);
          break;
        case 'delete_milestone':
          validated = validateDeleteMilestoneShape(item);
          break;
        case 'update_milestone':
          validated = validateUpdateMilestoneShape(item);
          break;
        case 'delete_task':
          validated = validateDeleteTaskShape(item);
          break;
        case 'update_task':
          validated = validateUpdateTaskShape(item);
          break;
        case 'delete_note':
          validated = validateDeleteNoteShape(item);
          break;
        case 'update_note':
          validated = validateUpdateNoteShape(item);
          break;
      }
      if (validated) result.push(validated);
    }
    return result;
  } catch (err) {
    captureWithContext(err, {
      module: 'copilot',
      action: 'parseProposals',
      userIntent: 'Parse structured proposals from assistant response',
      expected: 'Valid JSON array between <<PROPOSALS>> delimiters',
    });
    return [];
  }
}

// ─── Context request parser ───────────────────────────────────────────────────

/**
 * Parses a <<REQUEST_CONTEXT>>...</REQUEST_CONTEXT>> block from an assistant message.
 * Returns the payload object or null if not present / invalid.
 */
export function parseContextRequest(
  content: string
): { tasks?: boolean; notes?: boolean } | null {
  const match = content.match(
    /<<REQUEST_CONTEXT>>([\s\S]*?)<<\/REQUEST_CONTEXT>>/
  );
  if (!match) return null;

  const raw = match[1].trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const result: { tasks?: boolean; notes?: boolean } = {};
    if (parsed.tasks === true) result.tasks = true;
    if (parsed.notes === true) result.notes = true;
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Removes <<REQUEST_CONTEXT>>...</REQUEST_CONTEXT>> blocks from content for display.
 */
export function stripContextRequestFromContent(content: string): string {
  return content
    .replace(/<<REQUEST_CONTEXT>>[\s\S]*?<<\/REQUEST_CONTEXT>>/g, '')
    .trim();
}
