const DB_NAME = 'f1-telemetry-pro';
const DB_VERSION = 1;
const STORE = 'responses';

interface Entry<V> {
  key: string;
  storedAt: number;
  value: V;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      console.warn('IndexedDB unavailable, persistent cache disabled', request.error);
      resolve(null);
    };
  });
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

/**
 * Returns the stored value, or undefined when missing or older than `maxAgeMs`.
 */
export async function idbGet<V>(key: string, maxAgeMs = Infinity): Promise<V | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  try {
    const entry = (await promisify(db.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as
      | Entry<V>
      | undefined;
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt > maxAgeMs) return undefined;
    return entry.value;
  } catch (error) {
    console.warn(`IndexedDB read failed for ${key}`, error);
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const entry: Entry<unknown> = { key, storedAt: Date.now(), value };
  try {
    await promisify(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));
  } catch (error) {
    console.warn(`IndexedDB write failed for ${key}`, error);
  }
}

export async function idbClear(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await promisify(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
}

export async function idbCount(): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  return promisify(db.transaction(STORE, 'readonly').objectStore(STORE).count());
}

/** Test hook: drop the cached connection so a fresh fake database can be used. */
export function resetIdbConnection(): void {
  dbPromise = null;
}
