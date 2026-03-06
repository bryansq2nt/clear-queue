import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseProposals } from './parser';

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
});
