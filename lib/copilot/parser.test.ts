import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseProposals,
  parseContextRequest,
  stripContextRequestFromContent,
} from './parser';

vi.mock('@/lib/sentry', () => ({
  captureWithContext: vi.fn(),
}));

describe('parseProposals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when content has no PROPOSALS block', () => {
    expect(parseProposals('Just some text.')).toEqual([]);
    expect(parseProposals('<<PROPOSALS>> no closing tag')).toEqual([]);
    expect(parseProposals('')).toEqual([]);
  });

  it('returns empty array when closing delimiter is wrong (single angle bracket)', () => {
    const content = `Some intro.

<<PROPOSALS>>
[{"type":"task","title":"A task","status":"next"}]
</PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('extracts and validates a single task proposal', () => {
    const content = `Here are my suggestions.

<<PROPOSALS>>
[{"type":"task","title":"Implement login","status":"next","priority":3}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'task',
      title: 'Implement login',
      status: 'next',
      priority: 3,
      notes: null,
      tags: null,
      due_date: null,
      milestone_id: null,
      milestone_title: null,
    });
  });

  it('extracts and validates a single note proposal', () => {
    const content = `Consider this note.

<<PROPOSALS>>
[{"type":"note","title":"Meeting notes","content":"## Summary\\n\\nDecisions made."}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'note',
      title: 'Meeting notes',
      content: '## Summary\n\nDecisions made.',
    });
  });

  it('extracts multiple task and note proposals', () => {
    const content = `<<PROPOSALS>>
[
  {"type":"task","title":"Task A","status":"backlog"},
  {"type":"note","title":"Note B","content":"Body"},
  {"type":"task","title":"Task C","status":"in_progress","priority":5}
]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      type: 'task',
      title: 'Task A',
      status: 'backlog',
    });
    expect(result[1]).toMatchObject({
      type: 'note',
      title: 'Note B',
      content: 'Body',
    });
    expect(result[2]).toMatchObject({
      type: 'task',
      title: 'Task C',
      status: 'in_progress',
      priority: 5,
    });
  });

  it('returns empty array for empty PROPOSALS block', () => {
    const content = `Intro.

<<PROPOSALS>>

<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('returns empty array for empty array in block', () => {
    const content = `<<PROPOSALS>>
[]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('returns empty array on malformed JSON', () => {
    const content = `<<PROPOSALS>>
[{"type":"task", invalid}]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('returns empty array when content is not a JSON array', () => {
    const content = `<<PROPOSALS>>
{"type":"task","title":"Single object"}
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('skips items without type or with invalid type', () => {
    const content = `<<PROPOSALS>>
[
  {"type":"task","title":"Valid"},
  {"title":"No type"},
  {"type":"other","title":"Wrong type"},
  {"type":"note","title":"N","content":"C"}
]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'task', title: 'Valid' });
    expect(result[1]).toMatchObject({ type: 'note', title: 'N', content: 'C' });
  });

  it('skips task with empty title', () => {
    const content = `<<PROPOSALS>>
[{"type":"task","title":"","status":"next"},{"type":"task","title":"  ","status":"backlog"}]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('skips note with empty content', () => {
    const content = `<<PROPOSALS>>
[{"type":"note","title":"T","content":""}]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('defaults task status to backlog when invalid', () => {
    const content = `<<PROPOSALS>>
[{"type":"task","title":"T","status":"invalid_status"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'task',
      title: 'T',
      status: 'backlog',
    });
  });

  // ─── Milestone proposals ───────────────────────────────────────────────────

  it('extracts a valid milestone proposal', () => {
    const content = `<<PROPOSALS>>
[{"type":"milestone","title":"Phase 1","description":"Initial release scope"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'milestone',
      title: 'Phase 1',
      description: 'Initial release scope',
    });
  });

  it('extracts milestone proposal with no description', () => {
    const content = `<<PROPOSALS>>
[{"type":"milestone","title":"MVP Launch"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'milestone',
      title: 'MVP Launch',
      description: null,
    });
  });

  it('skips milestone with empty title', () => {
    const content = `<<PROPOSALS>>
[{"type":"milestone","title":""},{"type":"milestone","title":"  "}]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('truncates milestone title at 200 chars', () => {
    const longTitle = 'A'.repeat(250);
    const content = `<<PROPOSALS>>
[{"type":"milestone","title":"${longTitle}"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect((result[0] as { title: string }).title).toHaveLength(200);
  });

  it('extracts mixed milestone and task proposals', () => {
    const content = `<<PROPOSALS>>
[
  {"type":"milestone","title":"Phase 1","description":"Foundation"},
  {"type":"task","title":"Set up repo","status":"next","milestone_title":"Phase 1"}
]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'milestone', title: 'Phase 1' });
    expect(result[1]).toMatchObject({
      type: 'task',
      title: 'Set up repo',
      milestone_title: 'Phase 1',
    });
  });

  // ─── Task with milestone fields ────────────────────────────────────────────

  it('extracts task with valid milestone_id', () => {
    const content = `<<PROPOSALS>>
[{"type":"task","title":"Deploy","status":"next","milestone_id":"550e8400-e29b-41d4-a716-446655440000"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'task',
      title: 'Deploy',
      milestone_id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('sets milestone_id to null for non-UUID string', () => {
    const content = `<<PROPOSALS>>
[{"type":"task","title":"Deploy","status":"next","milestone_id":"not-a-uuid"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'task', milestone_id: null });
  });

  it('extracts task with milestone_title', () => {
    const content = `<<PROPOSALS>>
[{"type":"task","title":"Build API","milestone_title":"Backend phase"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'task',
      milestone_title: 'Backend phase',
    });
  });

  it('sets milestone_title to null when missing', () => {
    const content = `<<PROPOSALS>>
[{"type":"task","title":"Task without milestone"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      milestone_id: null,
      milestone_title: null,
    });
  });

  // ─── Mutation proposals ────────────────────────────────────────────────────

  it('parses delete_milestone proposal', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const content = `<<PROPOSALS>>
[{"type":"delete_milestone","entity_id":"${id}","entity_title":"Phase 1"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'delete_milestone',
      entity_id: id,
      entity_title: 'Phase 1',
    });
  });

  it('skips delete_milestone with invalid entity_id', () => {
    const content = `<<PROPOSALS>>
[{"type":"delete_milestone","entity_id":"not-a-uuid"}]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });

  it('parses update_milestone proposal with changed fields', () => {
    const id = '550e8400-e29b-41d4-a716-446655440001';
    const content = `<<PROPOSALS>>
[{"type":"update_milestone","entity_id":"${id}","entity_title":"Old Name","title":"New Name","description":"Updated desc"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'update_milestone',
      entity_id: id,
      title: 'New Name',
      description: 'Updated desc',
    });
  });

  it('parses delete_task proposal', () => {
    const id = '550e8400-e29b-41d4-a716-446655440002';
    const content = `<<PROPOSALS>>
[{"type":"delete_task","entity_id":"${id}","entity_title":"My task"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'delete_task', entity_id: id });
  });

  it('parses update_task proposal with status and priority', () => {
    const id = '550e8400-e29b-41d4-a716-446655440003';
    const content = `<<PROPOSALS>>
[{"type":"update_task","entity_id":"${id}","entity_title":"Fix bug","status":"done","priority":5}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'update_task',
      entity_id: id,
      status: 'done',
      priority: 5,
    });
  });

  it('ignores invalid status in update_task', () => {
    const id = '550e8400-e29b-41d4-a716-446655440004';
    const content = `<<PROPOSALS>>
[{"type":"update_task","entity_id":"${id}","status":"invalid"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    const p = result[0] as { status?: string };
    expect(p.status).toBeUndefined();
  });

  it('parses delete_note proposal', () => {
    const id = '550e8400-e29b-41d4-a716-446655440005';
    const content = `<<PROPOSALS>>
[{"type":"delete_note","entity_id":"${id}","entity_title":"Meeting notes"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'delete_note', entity_id: id });
  });

  it('parses update_note proposal', () => {
    const id = '550e8400-e29b-41d4-a716-446655440006';
    const content = `<<PROPOSALS>>
[{"type":"update_note","entity_id":"${id}","title":"New Title","content":"New body"}]
<<\/PROPOSALS>>`;
    const result = parseProposals(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'update_note',
      entity_id: id,
      title: 'New Title',
      content: 'New body',
    });
  });

  it('skips unknown proposal types', () => {
    const content = `<<PROPOSALS>>
[{"type":"delete_project","entity_id":"550e8400-e29b-41d4-a716-446655440007"}]
<<\/PROPOSALS>>`;
    expect(parseProposals(content)).toEqual([]);
  });
});

// ─── parseContextRequest ────────────────────────────────────────────────────

describe('parseContextRequest', () => {
  it('returns null when no REQUEST_CONTEXT block', () => {
    expect(parseContextRequest('Just some text.')).toBeNull();
    expect(parseContextRequest('')).toBeNull();
  });

  it('parses tasks=true', () => {
    const content = `Here I need more data.
<<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>>`;
    expect(parseContextRequest(content)).toEqual({ tasks: true });
  });

  it('parses tasks=true and notes=true', () => {
    const content = `<<REQUEST_CONTEXT>>{"tasks":true,"notes":true}<</REQUEST_CONTEXT>>`;
    expect(parseContextRequest(content)).toEqual({ tasks: true, notes: true });
  });

  it('returns null for empty JSON object', () => {
    const content = `<<REQUEST_CONTEXT>>{}<</REQUEST_CONTEXT>>`;
    expect(parseContextRequest(content)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const content = `<<REQUEST_CONTEXT>>{invalid}<</REQUEST_CONTEXT>>`;
    expect(parseContextRequest(content)).toBeNull();
  });

  it('ignores extra fields', () => {
    const content = `<<REQUEST_CONTEXT>>{"tasks":true,"other":true}<</REQUEST_CONTEXT>>`;
    expect(parseContextRequest(content)).toEqual({ tasks: true });
  });
});

// ─── stripContextRequestFromContent ────────────────────────────────────────

describe('stripContextRequestFromContent', () => {
  it('removes REQUEST_CONTEXT block', () => {
    const content =
      'I need more data.\n<<REQUEST_CONTEXT>>{"tasks":true}<</REQUEST_CONTEXT>>';
    expect(stripContextRequestFromContent(content)).toBe('I need more data.');
  });

  it('leaves content unchanged when no block', () => {
    expect(stripContextRequestFromContent('Normal text.')).toBe('Normal text.');
  });
});
