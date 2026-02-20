'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type CacheKey =
  | { type: 'project'; projectId: string }
  | { type: 'board'; projectId: string }
  | { type: 'notes'; projectId: string }
  | { type: 'ideas'; projectId: string }
  | { type: 'owner'; projectId: string }
  | { type: 'budgets'; projectId: string }
  | { type: 'todos'; projectId: string };

function cacheKeyToString(k: CacheKey): string {
  return `${k.type}:${k.projectId}`;
}

type CacheState = Record<string, unknown>;

type ContextDataCacheValue = {
  get: <T>(key: CacheKey) => T | undefined;
  set: <T>(key: CacheKey, value: T) => void;
  invalidate: (key: CacheKey) => void;
  invalidateProject: (projectId: string) => void;
};

const ContextDataCacheContext = createContext<ContextDataCacheValue | null>(
  null
);

export function ContextDataCacheProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CacheState>({});

  const get = useCallback(
    <T,>(key: CacheKey): T | undefined => {
      const s = state[cacheKeyToString(key)];
      return s as T | undefined;
    },
    [state]
  );

  const set = useCallback(<T,>(key: CacheKey, value: T) => {
    const k = cacheKeyToString(key);
    setState((prev) => (prev[k] === value ? prev : { ...prev, [k]: value }));
  }, []);

  const invalidate = useCallback((key: CacheKey) => {
    const k = cacheKeyToString(key);
    setState((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, []);

  const invalidateProject = useCallback((projectId: string) => {
    setState((prev) => {
      const toRemove = Object.keys(prev).filter(
        (key) => key.split(':')[1] === projectId
      );
      if (toRemove.length === 0) return prev;
      const next = { ...prev };
      toRemove.forEach((k) => delete next[k]);
      return next;
    });
  }, []);

  const value = useMemo<ContextDataCacheValue>(
    () => ({ get, set, invalidate, invalidateProject }),
    [get, set, invalidate, invalidateProject]
  );

  return (
    <ContextDataCacheContext.Provider value={value}>
      {children}
    </ContextDataCacheContext.Provider>
  );
}

export function useContextDataCache(): ContextDataCacheValue {
  const ctx = useContext(ContextDataCacheContext);
  if (!ctx) {
    throw new Error(
      'useContextDataCache must be used within ContextDataCacheProvider'
    );
  }
  return ctx;
}
