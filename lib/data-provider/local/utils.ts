import { randomUUID } from 'crypto';

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function pickColumns(
  row: Record<string, unknown>,
  select: string
): Record<string, unknown> {
  const trimmed = select.trim();
  if (trimmed === '*') return { ...row };

  const parts = parseSelectParts(trimmed);
  const result: Record<string, unknown> = {};

  for (const part of parts) {
    if (part.nested) continue;
    if (part.name in row) {
      result[part.name] = row[part.name];
    }
  }

  return result;
}

export type SelectPart = {
  name: string;
  nested?: string;
  inner?: boolean;
};

export function parseSelectParts(select: string): SelectPart[] {
  const parts: SelectPart[] = [];
  let current = '';
  let depth = 0;

  for (const char of select) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(parseSelectPart(current.trim()));
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(parseSelectPart(current.trim()));
  }

  return parts;
}

function parseSelectPart(part: string): SelectPart {
  const innerMatch = part.match(/^(.+?)!inner\((.+)\)$/);
  if (innerMatch) {
    return {
      name: innerMatch[1],
      nested: innerMatch[2],
      inner: true,
    };
  }

  const nestedMatch = part.match(/^(.+?)\((.+)\)$/);
  if (nestedMatch) {
    return {
      name: nestedMatch[1],
      nested: nestedMatch[2],
    };
  }

  return { name: part };
}

export function matchesFilter(
  row: Record<string, unknown>,
  column: string,
  op: string,
  value: unknown
): boolean {
  const cell = getNestedValue(row, column);

  switch (op) {
    case 'eq':
      return cell === value;
    case 'neq':
      return cell !== value;
    case 'in':
      return Array.isArray(value) && value.includes(cell);
    case 'is':
      return cell === value;
    case 'gte':
      return compareValues(cell, value) >= 0;
    case 'lte':
      return compareValues(cell, value) <= 0;
    case 'gt':
      return compareValues(cell, value) > 0;
    case 'lt':
      return compareValues(cell, value) < 0;
    case 'ilike':
      return (
        typeof cell === 'string' &&
        typeof value === 'string' &&
        cell.toLowerCase().includes(value.replace(/%/g, '').toLowerCase())
      );
    case 'not.is':
      return cell !== value;
    default:
      return true;
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null || b == null) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function getNestedValue(
  row: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = row;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function parseOrFilter(filter: string): Array<{
  column: string;
  op: string;
  value: unknown;
}> {
  return filter.split(',').map((clause) => {
    const match = clause.trim().match(/^(\w+)\.(eq|neq|is)\.(.+)$/);
    if (!match) return { column: '', op: 'eq', value: null };
    let value: unknown = match[3];
    if (value === 'null') value = null;
    if (value === 'true') value = true;
    if (value === 'false') value = false;
    return { column: match[1], op: match[2], value };
  });
}
