import { z } from 'zod';
import { optionalNullableString, uuidSchema } from '@/lib/server/validation';

export const taskStatusSchema = z.enum([
  'backlog',
  'next',
  'in_progress',
  'blocked',
  'done',
]);

export const createTaskSchema = z.object({
  project_id: uuidSchema,
  title: z.string().trim().min(1, 'Task title is required'),
  status: taskStatusSchema.default('next'),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  due_date: optionalNullableString,
  notes: optionalNullableString,
});

export const updateTaskSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).optional(),
  project_id: z.string().uuid().optional(),
  status: taskStatusSchema.optional(),
  priority: z.coerce.number().int().min(1).max(5).optional(),
  due_date: optionalNullableString,
  notes: optionalNullableString,
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required'),
  color: optionalNullableString,
  category: z.string().trim().min(1),
  client_id: optionalNullableString,
  business_id: optionalNullableString,
});

export const billingSchema = z.object({
  title: z.string().trim().min(1, 'Billing title is required'),
  client_id: optionalNullableString,
  client_name: optionalNullableString,
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  currency: z.string().trim().min(3).max(3).default('USD'),
  project_id: optionalNullableString,
  due_date: optionalNullableString,
  notes: optionalNullableString,
});

export const clientSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
});

export const businessSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required'),
});
