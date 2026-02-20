import { describe, expect, test } from 'vitest';
import {
  billingSchema,
  businessSchema,
  clientSchema,
  createProjectSchema,
  createTaskSchema,
  updateTaskSchema,
} from '@/lib/server/action-schemas';

describe('server action schemas', () => {
  test('task payload rejects missing title', () => {
    const result = createTaskSchema.safeParse({
      project_id: crypto.randomUUID(),
      title: '',
    });
    expect(result.success).toBe(false);
  });

  test('task update rejects invalid id', () => {
    const result = updateTaskSchema.safeParse({ id: 'bad-id' });
    expect(result.success).toBe(false);
  });

  test('project payload requires name', () => {
    const result = createProjectSchema.safeParse({
      name: ' ',
      category: 'business',
    });
    expect(result.success).toBe(false);
  });

  test('client payload requires full_name', () => {
    const result = clientSchema.safeParse({ full_name: '' });
    expect(result.success).toBe(false);
  });

  test('business payload requires name', () => {
    const result = businessSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  test('billing payload rejects non-positive amount', () => {
    const result = billingSchema.safeParse({ title: 'Invoice', amount: 0 });
    expect(result.success).toBe(false);
  });
});
