/**
 * Minimal IndexedDB key/value store for large save files (falls back to
 * localStorage when IndexedDB is unavailable, e.g. some private modes).
 */
const DB = 'bioforge';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

const hasIDB = () => typeof indexedDB !== 'undefined';

export async function kvSet(key: string, value: string): Promise<void> {
  if (hasIDB()) {
    try {
      await tx('readwrite', (s) => s.put(value, key));
      return;
    } catch {
      /* fall through */
    }
  }
  localStorage.setItem(key, value);
}

export async function kvGet(key: string): Promise<string | null> {
  if (hasIDB()) {
    try {
      const v = await tx<string | undefined>('readonly', (s) => s.get(key) as IDBRequest<string | undefined>);
      if (typeof v === 'string') return v;
    } catch {
      /* fall through */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function kvDel(key: string): Promise<void> {
  if (hasIDB()) {
    try {
      await tx('readwrite', (s) => s.delete(key));
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
