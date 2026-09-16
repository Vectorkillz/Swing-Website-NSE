// Tiny IndexedDB key/value store for cached data files. No dependency; every call is guarded so a
// browser that blocks storage (private mode, thumbnails) degrades to "no cache" instead of throwing.

const DB = "nse-swing-cache";
const STORE = "files";

export interface CacheEntry<T = unknown> { value: T; savedAt: number }

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<CacheEntry<T> | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CacheEntry<T>) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ value, savedAt: Date.now() } satisfies CacheEntry<T>, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function idbClear(): Promise<void> {
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}
