import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { createLocalAuth, getUserIdFromCookies } from './auth';
import { LocalQueryBuilder } from './query-builder';
import { executeLocalRpc } from './rpc-handlers';
import { createLocalStorage } from './storage';
import { getLocalStore } from './store';

type CookieStore = Pick<ReadonlyRequestCookies, 'get' | 'set' | 'delete'>;

export function createLocalSupabaseClient(cookieStore: CookieStore) {
  getLocalStore();
  const auth = createLocalAuth(cookieStore);
  const storage = createLocalStorage();

  return {
    auth,
    storage,
    from(table: string) {
      return new LocalQueryBuilder(table);
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      const userId = getUserIdFromCookies(cookieStore);
      return Promise.resolve(executeLocalRpc(name, args, userId));
    },
  };
}

export type LocalSupabaseClient = ReturnType<typeof createLocalSupabaseClient>;
