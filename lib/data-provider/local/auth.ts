import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import {
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_ID,
  DEFAULT_USER_PASSWORD,
  LOCAL_SESSION_COOKIE,
} from './constants';
import { getLocalStore, persistLocalStore } from './store';
import { newId } from './utils';

export type LocalAuthUser = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
  identities?: Array<{ id: string; identity_id: string }>;
};

type CookieStore = Pick<ReadonlyRequestCookies, 'get' | 'set' | 'delete'>;

function toAuthUser(record: { id: string; email: string }): LocalAuthUser {
  return {
    id: record.id,
    email: record.email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    identities: [{ id: record.id, identity_id: record.id }],
  };
}

export function getUserIdFromCookies(cookieStore: CookieStore): string | null {
  return cookieStore.get(LOCAL_SESSION_COOKIE)?.value ?? null;
}

export function setSessionCookie(
  cookieStore: CookieStore,
  userId: string
): void {
  cookieStore.set(LOCAL_SESSION_COOKIE, userId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(cookieStore: CookieStore): void {
  cookieStore.delete(LOCAL_SESSION_COOKIE);
}

export function createLocalAuth(cookieStore: CookieStore) {
  const getSessionUser = (): LocalAuthUser | null => {
    const userId = getUserIdFromCookies(cookieStore);
    if (!userId) return null;
    const record = getLocalStore().auth.users.find((u) => u.id === userId);
    return record ? toAuthUser(record) : null;
  };

  return {
    async getUser(): Promise<{
      data: { user: LocalAuthUser | null };
      error: null;
    }> {
      return { data: { user: getSessionUser() }, error: null };
    },

    async getSession(): Promise<{
      data: { session: { user: LocalAuthUser } | null };
      error: null;
    }> {
      const user = getSessionUser();
      if (!user) return { data: { session: null }, error: null };
      return {
        data: {
          session: {
            user,
            access_token: 'local-token',
            refresh_token: 'local-refresh',
          } as { user: LocalAuthUser },
        },
        error: null,
      };
    },

    async signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{
      data:
        | { user: LocalAuthUser; session: { user: LocalAuthUser } }
        | {
            user: null;
            session: null;
          };
      error: { message: string } | null;
    }> {
      const email = credentials.email.trim().toLowerCase();
      const store = getLocalStore();
      const user = store.auth.users.find(
        (u) =>
          u.email.toLowerCase() === email && u.password === credentials.password
      );

      if (!user) {
        return {
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' },
        };
      }

      setSessionCookie(cookieStore, user.id);
      const authUser = toAuthUser(user);
      return {
        data: {
          user: authUser,
          session: { user: authUser },
        },
        error: null,
      };
    },

    async signUp(credentials: { email: string; password: string }): Promise<{
      data: {
        user: LocalAuthUser;
        session: { user: LocalAuthUser } | null;
      };
      error: { message: string } | null;
    }> {
      const email = credentials.email.trim().toLowerCase();
      const store = getLocalStore();
      const exists = store.auth.users.some(
        (u) => u.email.toLowerCase() === email
      );
      if (exists) {
        return {
          data: { user: null as unknown as LocalAuthUser, session: null },
          error: { message: 'User already registered' },
        };
      }

      const newUser = {
        id: newId(),
        email,
        password: credentials.password,
      };
      store.auth.users.push(newUser);
      persistLocalStore();
      setSessionCookie(cookieStore, newUser.id);

      const authUser = toAuthUser(newUser);
      return {
        data: { user: authUser, session: { user: authUser } },
        error: null,
      };
    },

    async signOut(): Promise<{ error: null }> {
      clearSessionCookie(cookieStore);
      return { error: null };
    },

    async updateUser(_attrs: {
      password?: string;
    }): Promise<{ data: { user: LocalAuthUser }; error: null }> {
      const user = getSessionUser();
      if (!user) throw new Error('Not authenticated');
      return { data: { user }, error: null };
    },

    async resetPasswordForEmail(): Promise<{ data: object; error: null }> {
      return { data: {}, error: null };
    },

    async setSession(): Promise<{ data: { session: null }; error: null }> {
      return { data: { session: null }, error: null };
    },

    async exchangeCodeForSession(): Promise<{
      data: { session: null };
      error: null;
    }> {
      return { data: { session: null }, error: null };
    },
  };
}

export function getDefaultCredentials() {
  return {
    email: DEFAULT_USER_EMAIL,
    password: DEFAULT_USER_PASSWORD,
    userId: DEFAULT_USER_ID,
  };
}
