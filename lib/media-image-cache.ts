/**
 * In-memory cache of image object URLs by file id.
 * Used so grid and canvas reuse the same loaded image and we don't re-download.
 * Evicts oldest entries when full; revokes object URLs on eviction.
 */

const MAX_ENTRIES = 50;

type Entry = { url: string; at: number };

const cache = new Map<string, Entry>();
const order: string[] = [];

function evictOne(): void {
  if (order.length === 0) return;
  const id = order.shift()!;
  const entry = cache.get(id);
  if (entry) {
    cache.delete(id);
    try {
      URL.revokeObjectURL(entry.url);
    } catch {
      // ignore
    }
  }
}

export function getMediaImageUrl(fileId: string): string | null {
  const entry = cache.get(fileId);
  return entry?.url ?? null;
}

export function setMediaImageUrl(fileId: string, objectUrl: string): void {
  const existing = cache.get(fileId);
  if (existing) {
    try {
      URL.revokeObjectURL(existing.url);
    } catch {
      // ignore
    }
    const idx = order.indexOf(fileId);
    if (idx !== -1) order.splice(idx, 1);
  } else if (cache.size >= MAX_ENTRIES) {
    evictOne();
  }
  cache.set(fileId, { url: objectUrl, at: Date.now() });
  order.push(fileId);
}
