import { captureWithContext } from '@/lib/sentry';
import type { TaskProposalPayload, NoteProposalPayload } from './schema';

export type ParsedProposal = TaskProposalPayload | NoteProposalPayload;

const VALID_TASK_STATUSES = new Set([
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
]);

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
  return {
    type: 'task',
    title: obj.title.trim(),
    status,
    priority,
    notes: typeof obj.notes === 'string' ? obj.notes : null,
    tags: typeof obj.tags === 'string' ? obj.tags : null,
    due_date: typeof obj.due_date === 'string' ? obj.due_date : null,
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
      if (obj.type === 'task') {
        const validated = validateTaskShape(item);
        if (validated) result.push(validated);
      } else if (obj.type === 'note') {
        const validated = validateNoteShape(item);
        if (validated) result.push(validated);
      }
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
