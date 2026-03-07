import { describe, it, expect } from 'vitest';
import { isValidTaskProposal, isValidNoteProposal } from './copilot';

describe('isValidTaskProposal', () => {
  it('returns false for null or non-object', () => {
    expect(isValidTaskProposal(null)).toBe(false);
    expect(isValidTaskProposal(undefined)).toBe(false);
    expect(isValidTaskProposal('task')).toBe(false);
    expect(isValidTaskProposal(42)).toBe(false);
    expect(isValidTaskProposal([])).toBe(false);
  });

  it('returns false when type is not "task"', () => {
    expect(
      isValidTaskProposal({ type: 'note', title: 'x', content: 'y' })
    ).toBe(false);
    expect(isValidTaskProposal({ type: 'other', title: 'x' })).toBe(false);
    expect(isValidTaskProposal({ title: 'x' })).toBe(false);
  });

  it('returns false when title is missing, not string, or empty', () => {
    expect(isValidTaskProposal({ type: 'task' })).toBe(false);
    expect(isValidTaskProposal({ type: 'task', title: 123 })).toBe(false);
    expect(isValidTaskProposal({ type: 'task', title: '' })).toBe(false);
    expect(isValidTaskProposal({ type: 'task', title: '   ' })).toBe(false);
  });

  it('returns true for minimal valid task', () => {
    expect(isValidTaskProposal({ type: 'task', title: 'Do something' })).toBe(
      true
    );
  });

  it('returns true for task with valid status', () => {
    const statuses = ['backlog', 'next', 'in_progress', 'blocked', 'done'];
    for (const status of statuses) {
      expect(isValidTaskProposal({ type: 'task', title: 'Task', status })).toBe(
        true
      );
    }
  });

  it('returns false for invalid status', () => {
    expect(
      isValidTaskProposal({ type: 'task', title: 'Task', status: 'invalid' })
    ).toBe(false);
    expect(
      isValidTaskProposal({ type: 'task', title: 'Task', status: 'pending' })
    ).toBe(false);
  });

  it('returns true for task with valid priority 1-5', () => {
    for (let p = 1; p <= 5; p++) {
      expect(
        isValidTaskProposal({ type: 'task', title: 'Task', priority: p })
      ).toBe(true);
    }
  });

  it('returns false for invalid priority', () => {
    expect(
      isValidTaskProposal({ type: 'task', title: 'Task', priority: 0 })
    ).toBe(false);
    expect(
      isValidTaskProposal({ type: 'task', title: 'Task', priority: 6 })
    ).toBe(false);
    expect(
      isValidTaskProposal({ type: 'task', title: 'Task', priority: 3.5 })
    ).toBe(false);
    expect(
      isValidTaskProposal({ type: 'task', title: 'Task', priority: '3' })
    ).toBe(false);
  });
});

describe('isValidNoteProposal', () => {
  it('returns false for null or non-object', () => {
    expect(isValidNoteProposal(null)).toBe(false);
    expect(isValidNoteProposal(undefined)).toBe(false);
    expect(isValidNoteProposal('note')).toBe(false);
    expect(isValidNoteProposal([])).toBe(false);
  });

  it('returns false when type is not "note"', () => {
    expect(isValidNoteProposal({ type: 'task', title: 'x' })).toBe(false);
    expect(
      isValidNoteProposal({ type: 'other', title: 'x', content: 'y' })
    ).toBe(false);
    expect(isValidNoteProposal({ title: 'x', content: 'y' })).toBe(false);
  });

  it('returns false when title is missing, not string, or empty', () => {
    expect(isValidNoteProposal({ type: 'note', content: 'body' })).toBe(false);
    expect(
      isValidNoteProposal({ type: 'note', title: 1, content: 'body' })
    ).toBe(false);
    expect(
      isValidNoteProposal({ type: 'note', title: '', content: 'body' })
    ).toBe(false);
    expect(
      isValidNoteProposal({ type: 'note', title: '  ', content: 'body' })
    ).toBe(false);
  });

  it('returns false when content is missing, not string, or empty', () => {
    expect(isValidNoteProposal({ type: 'note', title: 'Title' })).toBe(false);
    expect(
      isValidNoteProposal({ type: 'note', title: 'Title', content: 1 })
    ).toBe(false);
    expect(
      isValidNoteProposal({ type: 'note', title: 'Title', content: '' })
    ).toBe(false);
    expect(
      isValidNoteProposal({ type: 'note', title: 'Title', content: '   ' })
    ).toBe(false);
  });

  it('returns true for minimal valid note', () => {
    expect(
      isValidNoteProposal({
        type: 'note',
        title: 'My note',
        content: 'Some content.',
      })
    ).toBe(true);
  });

  it('returns true for note with markdown content', () => {
    expect(
      isValidNoteProposal({
        type: 'note',
        title: 'Scope',
        content: '## Heading\n\nParagraph.',
      })
    ).toBe(true);
  });
});
