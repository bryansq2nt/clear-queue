import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid identifier');
export const optionalNullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  });

export function formatValidationError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  payload: unknown
): {
  data?: T;
  error?: string;
} {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { error: formatValidationError(parsed.error) };
  }
  return { data: parsed.data };
}
