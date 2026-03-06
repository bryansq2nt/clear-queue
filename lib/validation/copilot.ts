/**
 * Client-side shape validators for Copilot proposal payloads.
 * These are intentionally lenient — they check that the shape is usable,
 * not that the payload is production-ready.
 *
 * Phase 3 will add stricter server-side validators in this file.
 */

const VALID_TASK_STATUSES = new Set([
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
]);

export function isValidTaskProposal(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload as Record<string, unknown>;
  if (obj.type !== 'task') return false;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return false;
  if (
    obj.status !== undefined &&
    !VALID_TASK_STATUSES.has(obj.status as string)
  )
    return false;
  if (obj.priority !== undefined) {
    if (
      typeof obj.priority !== 'number' ||
      !Number.isInteger(obj.priority) ||
      obj.priority < 1 ||
      obj.priority > 5
    )
      return false;
  }
  return true;
}

export function isValidNoteProposal(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload as Record<string, unknown>;
  if (obj.type !== 'note') return false;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return false;
  if (typeof obj.content !== 'string' || !obj.content.trim()) return false;
  return true;
}
