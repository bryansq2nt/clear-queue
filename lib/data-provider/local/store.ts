import fs from 'fs';
import path from 'path';
import { LOCAL_DATA_DIR, LOCAL_STORE_FILE } from './constants';
import { createSeedStore, type LocalStore } from './seed';

let memoryStore: LocalStore | null = null;

function ensureDataDir(): void {
  const dir = path.join(process.cwd(), LOCAL_DATA_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStoreFromDisk(): LocalStore {
  ensureDataDir();
  const filePath = path.join(process.cwd(), LOCAL_STORE_FILE);
  if (!fs.existsSync(filePath)) {
    const seed = createSeedStore();
    fs.writeFileSync(filePath, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as LocalStore;
}

export function getLocalStore(): LocalStore {
  if (!memoryStore) {
    memoryStore = readStoreFromDisk();
  }
  return memoryStore;
}

export function persistLocalStore(): void {
  if (!memoryStore) return;
  ensureDataDir();
  const filePath = path.join(process.cwd(), LOCAL_STORE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(memoryStore, null, 2), 'utf-8');
}

export function getTableRows(table: string): Record<string, unknown>[] {
  const store = getLocalStore();
  if (!store.tables[table]) {
    store.tables[table] = [];
  }
  return store.tables[table];
}

export function setTableRows(
  table: string,
  rows: Record<string, unknown>[]
): void {
  const store = getLocalStore();
  store.tables[table] = rows;
  persistLocalStore();
}

export function resetLocalStore(): LocalStore {
  memoryStore = createSeedStore();
  persistLocalStore();
  return memoryStore;
}
