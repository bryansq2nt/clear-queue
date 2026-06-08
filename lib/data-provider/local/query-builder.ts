import { getTableRows, persistLocalStore } from './store';
import {
  getNestedValue,
  matchesFilter,
  newId,
  nowIso,
  parseOrFilter,
  parseSelectParts,
  pickColumns,
  type SelectPart,
} from './utils';

type Filter = { column: string; op: string; value: unknown };
type Order = { column: string; ascending: boolean };

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Mirrors Postgres column defaults for local inserts. */
const INSERT_DEFAULTS: Record<string, Record<string, unknown>> = {
  user_preferences: {
    theme_mode: 'system',
    primary_color: '#05668D',
    secondary_color: '#0B132B',
    third_color: '#F4F7FB',
    currency: 'USD',
    company_logo_asset_id: null,
    cover_image_asset_id: null,
  },
};

const FK_JOINS: Record<
  string,
  { table: string; localKey: string; foreignKey: string }
> = {
  rbac_roles: {
    table: 'rbac_roles',
    localKey: 'role_id',
    foreignKey: 'id',
  },
  rbac_module_actions: {
    table: 'rbac_module_actions',
    localKey: 'action_id',
    foreignKey: 'id',
  },
  clients: {
    table: 'clients',
    localKey: 'client_id',
    foreignKey: 'id',
  },
  project_teams: {
    table: 'project_teams',
    localKey: 'team_id',
    foreignKey: 'id',
  },
};

export class LocalQueryBuilder {
  private table: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' =
    'select';
  private filters: Filter[] = [];
  private orFilters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private selectStr = '*';
  private selectOptions: { count?: string; head?: boolean } | undefined;
  private insertPayload:
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null = null;
  private updatePayload: Record<string, unknown> | null = null;
  private upsertOptions: { onConflict?: string } | undefined;
  private singleMode = false;
  private maybeSingleMode = false;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: { count?: string; head?: boolean }): this {
    this.selectStr = columns ?? '*';
    this.selectOptions = options;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = 'insert';
    this.insertPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.operation = 'update';
    this.updatePayload = payload;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string }
  ): this {
    this.operation = 'upsert';
    this.insertPayload = payload;
    this.upsertOptions = options;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ column, op: 'in', value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: 'is', value });
    return this;
  }

  not(column: string, op: string, value: unknown): this {
    this.filters.push({ column, op: `not.${op}`, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gte', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lte', value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gt', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lt', value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.filters.push({ column, op: 'ilike', value });
    return this;
  }

  or(filter: string): this {
    this.orFilters = parseOrFilter(filter);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.singleMode = true;
    return this;
  }

  maybeSingle(): this {
    this.maybeSingleMode = true;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): QueryResult {
    try {
      switch (this.operation) {
        case 'insert':
          return this.runInsert();
        case 'update':
          return this.runUpdate();
        case 'delete':
          return this.runDelete();
        case 'upsert':
          return this.runUpsert();
        default:
          return this.runSelect();
      }
    } catch (err) {
      return {
        data: null,
        error: {
          message: err instanceof Error ? err.message : 'Query failed',
        },
      };
    }
  }

  private runSelect(): QueryResult {
    let rows = [...getTableRows(this.table)];
    rows = this.applyFilters(rows);

    if (this.selectOptions?.head && this.selectOptions?.count === 'exact') {
      return { data: null, error: null, count: rows.length };
    }

    rows = this.applyOrder(rows);
    if (this.rangeFrom != null && this.rangeTo != null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitN != null) {
      rows = rows.slice(0, this.limitN);
    }

    const parts = parseSelectParts(this.selectStr);
    const projected = rows.map((row) => this.projectRow(row, parts));

    if (this.singleMode) {
      if (projected.length !== 1) {
        return {
          data: null,
          error: {
            message:
              projected.length === 0
                ? 'Row not found'
                : 'Multiple rows returned',
            code: projected.length === 0 ? 'PGRST116' : 'PGRST116',
          },
        };
      }
      return { data: projected[0], error: null };
    }

    if (this.maybeSingleMode) {
      if (projected.length > 1) {
        return {
          data: null,
          error: { message: 'Multiple rows returned', code: 'PGRST116' },
        };
      }
      return { data: projected[0] ?? null, error: null };
    }

    return { data: projected, error: null };
  }

  private runInsert(): QueryResult {
    const payloads = Array.isArray(this.insertPayload)
      ? this.insertPayload
      : [this.insertPayload ?? {}];
    const timestamp = nowIso();
    const inserted: Record<string, unknown>[] = [];

    for (const payload of payloads) {
      const tableDefaults = INSERT_DEFAULTS[this.table] ?? {};
      const row: Record<string, unknown> = {
        ...tableDefaults,
        id: payload.id ?? newId(),
        created_at: payload.created_at ?? timestamp,
        updated_at: payload.updated_at ?? timestamp,
        ...payload,
      };
      getTableRows(this.table).push(row);
      inserted.push(row);
    }

    persistLocalStore();
    const parts = parseSelectParts(this.selectStr);
    const projected = inserted.map((row) => this.projectRow(row, parts));

    if (this.singleMode) {
      return { data: projected[0] ?? null, error: null };
    }
    return { data: projected, error: null };
  }

  private runUpdate(): QueryResult {
    const rows = getTableRows(this.table);
    const timestamp = nowIso();
    const updated: Record<string, unknown>[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      if (!this.rowMatches(rows[i])) continue;
      rows[i] = {
        ...rows[i],
        ...this.updatePayload,
        updated_at: timestamp,
      };
      updated.push(rows[i]);
    }

    persistLocalStore();
    const parts = parseSelectParts(this.selectStr);
    const projected = updated.map((row) => this.projectRow(row, parts));

    if (this.singleMode) {
      if (projected.length !== 1) {
        return {
          data: null,
          error: {
            message: projected.length === 0 ? 'Row not found' : 'Multiple rows',
            code: 'PGRST116',
          },
        };
      }
      return { data: projected[0], error: null };
    }
    return { data: projected, error: null };
  }

  private runDelete(): QueryResult {
    const rows = getTableRows(this.table);
    const kept = rows.filter((row) => !this.rowMatches(row));
    const deletedCount = rows.length - kept.length;
    if (deletedCount > 0) {
      getTableRows(this.table).length = 0;
      getTableRows(this.table).push(...kept);
      persistLocalStore();
    }
    return { data: null, error: null };
  }

  private runUpsert(): QueryResult {
    const conflict = this.upsertOptions?.onConflict?.split(',') ?? ['id'];
    const payloads = Array.isArray(this.insertPayload)
      ? this.insertPayload
      : [this.insertPayload ?? {}];
    const rows = getTableRows(this.table);
    const timestamp = nowIso();
    const result: Record<string, unknown>[] = [];

    for (const payload of payloads) {
      const existingIdx = rows.findIndex((row) =>
        conflict.every((key) => row[key.trim()] === payload[key.trim()])
      );

      if (existingIdx >= 0) {
        rows[existingIdx] = {
          ...rows[existingIdx],
          ...payload,
          updated_at: timestamp,
        };
        result.push(rows[existingIdx]);
      } else {
        const row: Record<string, unknown> = {
          id: payload.id ?? newId(),
          created_at: payload.created_at ?? timestamp,
          updated_at: timestamp,
          ...payload,
        };
        rows.push(row);
        result.push(row);
      }
    }

    persistLocalStore();
    const parts = parseSelectParts(this.selectStr);
    const projected = result.map((row) => this.projectRow(row, parts));
    return { data: projected, error: null };
  }

  private applyFilters(
    rows: Record<string, unknown>[]
  ): Record<string, unknown>[] {
    const parts = parseSelectParts(this.selectStr);

    return rows.filter((row) => {
      if (!this.rowMatches(row)) return false;

      for (const part of parts) {
        if (!part.nested || !part.inner) continue;
        const joined = this.resolveJoin(row, part);
        if (!joined) return false;
      }

      return true;
    });
  }

  private rowMatches(row: Record<string, unknown>): boolean {
    if (this.orFilters.length > 0) {
      const orMatch = this.orFilters.some((f) =>
        matchesFilter(row, f.column, f.op, f.value)
      );
      if (!orMatch) return false;
    }

    return this.filters.every((f) => {
      if (f.column.includes('.')) {
        return matchesFilter(
          this.resolveJoinRow(row, f.column.split('.')[0]) ?? {},
          f.column.split('.').slice(1).join('.'),
          f.op,
          f.value
        );
      }
      return matchesFilter(row, f.column, f.op, f.value);
    });
  }

  private applyOrder(
    rows: Record<string, unknown>[]
  ): Record<string, unknown>[] {
    if (this.orders.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const order of this.orders) {
        const av = getNestedValue(a, order.column);
        const bv = getNestedValue(b, order.column);
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        if (cmp !== 0) return order.ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  private projectRow(
    row: Record<string, unknown>,
    parts: SelectPart[]
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const part of parts) {
      if (part.nested) {
        const joined = this.resolveJoin(row, part);
        if (joined != null) {
          result[part.name] = joined;
        } else if (part.inner) {
          return {};
        }
        continue;
      }
      if (part.name in row) {
        result[part.name] = row[part.name];
      }
    }

    return Object.keys(result).length > 0
      ? result
      : pickColumns(row, this.selectStr);
  }

  private resolveJoin(
    row: Record<string, unknown>,
    part: SelectPart
  ): Record<string, unknown> | Record<string, unknown>[] | null {
    const join = FK_JOINS[part.name];
    if (!join) return null;

    const fkValue = row[join.localKey];
    if (fkValue == null) return null;

    const related = getTableRows(join.table).filter(
      (r) => r[join.foreignKey] === fkValue
    );

    if (related.length === 0) return part.inner ? null : null;

    const nestedParts = parseSelectParts(part.nested ?? '*');
    const mapped = related.map((rel) => {
      const out: Record<string, unknown> = {};
      for (const np of nestedParts) {
        if (np.name in rel) out[np.name] = rel[np.name];
      }
      return out;
    });

    if (part.name === 'project_teams') {
      return mapped[0] ?? null;
    }

    if (part.name === 'rbac_roles' || part.name === 'rbac_module_actions') {
      return mapped[0] ?? null;
    }

    if (part.name === 'clients') {
      return mapped[0] ?? null;
    }

    return mapped.length === 1 ? mapped[0] : mapped;
  }

  private resolveJoinRow(
    row: Record<string, unknown>,
    relation: string
  ): Record<string, unknown> | null {
    const join = FK_JOINS[relation];
    if (!join) return null;
    const fkValue = row[join.localKey];
    return (
      getTableRows(join.table).find((r) => r[join.foreignKey] === fkValue) ??
      null
    );
  }
}
