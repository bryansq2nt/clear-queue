import { captureWithContext } from '@/lib/sentry';
import { COPILOT_REGISTRY } from '@/lib/copilot/registry';
import type { ParsedProposal } from './schema';

// Re-export for backward compatibility — existing imports of ParsedProposal from parser.ts still work
export type { ParsedProposal };

// ─── Proposals parser ─────────────────────────────────────────────────────────

/**
 * Extracts and validates structured proposals from an assistant message.
 * Returns an empty array on any parse failure — never throws.
 * The <<PROPOSALS>> block must be at the end of the message content.
 *
 * Dispatches to the module registry — unknown types are silently skipped.
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
      const capability = COPILOT_REGISTRY.get(String(obj.type));
      if (!capability) continue; // unknown type — skip
      const validated = capability.validate(item);
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
): { tasks?: boolean; notes?: boolean; full?: boolean } | null {
  const match = content.match(
    /<<REQUEST_CONTEXT>>([\s\S]*?)<<\/REQUEST_CONTEXT>>/
  );
  if (!match) return null;

  const raw = match[1].trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const result: { tasks?: boolean; notes?: boolean; full?: boolean } = {};
    if (parsed.tasks === true) result.tasks = true;
    if (parsed.notes === true) result.notes = true;
    if (parsed.full === true) result.full = true;
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
