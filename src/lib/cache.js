// Caches for card data (spec 5.1–5.2). Scryfall asks clients to cache for at
// least 24 hours; TCGdex set details change even less often.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/**
 * An in-memory cache of promises with a time-to-live. A failed load is
 * forgotten, so the next call tries again.
 */
export function memoryCache(ttlMs) {
  const entries = new Map();
  return {
    /**
     * @template T
     * @param {string} key
     * @param {() => Promise<T>} load
     * @returns {Promise<T>}
     */
    get(key, load) {
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
      const promise = load();
      entries.set(key, { at: Date.now(), promise });
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
      });
      return promise;
    },
  };
}

/**
 * Read a localStorage entry written by writeStored.
 * @returns {{ value: any, fresh: boolean } | null}  null if missing or corrupt
 */
export function readStored(key, maxAgeMs) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (!raw || !('value' in raw)) return null;
    return { value: raw.value, fresh: Date.now() - (raw.at || 0) < maxAgeMs };
  } catch {
    return null;
  }
}

/** Write a localStorage entry stamped with the time. Quota errors are ignored. */
export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Over quota or blocked: the data still works for this page load.
  }
}

/**
 * Load something that lives in localStorage for maxAgeMs: the stored copy if
 * fresh, otherwise a fresh download, falling back to a stale copy if the
 * download fails.
 * @template T
 * @param {string} key
 * @param {number} maxAgeMs
 * @param {() => Promise<T>} download
 * @returns {Promise<T>}
 */
export async function storedOrDownload(key, maxAgeMs, download) {
  const stored = readStored(key, maxAgeMs);
  if (stored?.fresh) return stored.value;
  try {
    const value = await download();
    writeStored(key, value);
    return value;
  } catch (e) {
    if (stored) return stored.value;
    throw e;
  }
}
