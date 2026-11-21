import { collection, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const IDB_NAME = 'nps_local_db';
const IDB_STORE = 'kv';
const IDB_VERSION = 1;

export const CHUNK_MANIFEST_PREFIX = '__NPS_CHUNKED_V1__:';
export const CHUNK_SUFFIX = '__chunk_';
// Keep each Firestore document safely under 1 MiB even for multi-byte Arabic text
const FIRESTORE_CHUNK_CHARS = 180_000;
// Keep localStorage for small/fast metadata keys only so 5MB quota is never exceeded
export const LOCAL_STORAGE_MAX_CHARS = 200_000;

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openLocalDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbPromise) return idbPromise;

  idbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return idbPromise;
}

export async function idbLoadAll(): Promise<Record<string, string>> {
  const database = await openLocalDb();
  if (!database) return {};

  return new Promise<Record<string, string>>((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const result: Record<string, string> = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && typeof cursor.value === 'string') {
            result[cursor.key] = cursor.value;
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => resolve(result);
    } catch {
      resolve({});
    }
  });
}

export async function idbPut(key: string, value: string): Promise<void> {
  const database = await openLocalDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbPutMany(entries: Array<[string, string]>): Promise<void> {
  if (entries.length === 0) return;
  const database = await openLocalDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      for (const [k, v] of entries) {
        store.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Track per-key sequential Firestore write queues to prevent out-of-order chunk commits
const writeQueues = new Map<string, Promise<void>>();

export function writeKeyToFirestoreChunked(
  key: string,
  serialized: string,
  onError?: (err: unknown, path: string) => void
): Promise<void> {
  const prev = writeQueues.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const updatedAt = new Date().toISOString();
      const storeCol = collection(db, 'nps_store');

      if (serialized.length <= FIRESTORE_CHUNK_CHARS) {
        try {
          await setDoc(doc(storeCol, key), {
            value: serialized,
            updatedAt
          });
        } catch (err) {
          onError?.(err, `nps_store/${key}`);
        }
        return;
      }

      // Split large payload (e.g. 10,000+ students/users/parents) into <600KB Firestore chunk docs
      const chunks: string[] = [];
      for (let i = 0; i < serialized.length; i += FIRESTORE_CHUNK_CHARS) {
        chunks.push(serialized.slice(i, i + FIRESTORE_CHUNK_CHARS));
      }

      const manifestValue = `${CHUNK_MANIFEST_PREFIX}${chunks.length}`;
      const ops: Array<{ docId: string; value: string }> = chunks.map((chunk, idx) => ({
        docId: `${key}${CHUNK_SUFFIX}${idx}`,
        value: chunk
      }));
      ops.push({ docId: key, value: manifestValue });

      // Firestore WriteBatch allows max 500 ops; use 400 per batch, committing chunks before manifest
      const BATCH_SIZE = 400;
      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        const slice = ops.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const op of slice) {
          batch.set(doc(storeCol, op.docId), {
            value: op.value,
            updatedAt
          });
        }
        try {
          await batch.commit();
        } catch (err) {
          onError?.(err, `nps_store/${key}`);
          break;
        }
      }
    });

  writeQueues.set(key, next);
  return next;
}

export function reassembleCloudStoreDocs(
  docs: Array<{ id: string; value: string }>
): Array<{ key: string; value: string }> {
  const rawMap = new Map<string, string>();
  for (const d of docs) {
    rawMap.set(d.id, d.value);
  }

  const result: Array<{ key: string; value: string }> = [];
  for (const [id, val] of rawMap.entries()) {
    if (id.includes(CHUNK_SUFFIX)) continue;

    if (val.startsWith(CHUNK_MANIFEST_PREFIX)) {
      const countStr = val.slice(CHUNK_MANIFEST_PREFIX.length);
      const chunkCount = parseInt(countStr, 10);
      if (!isNaN(chunkCount) && chunkCount > 0) {
        const parts: string[] = [];
        let complete = true;
        for (let i = 0; i < chunkCount; i++) {
          const part = rawMap.get(`${id}${CHUNK_SUFFIX}${i}`);
          if (typeof part !== 'string') {
            complete = false;
            break;
          }
          parts.push(part);
        }
        if (complete) {
          result.push({ key: id, value: parts.join('') });
        }
      }
    } else {
      result.push({ key: id, value: val });
    }
  }

  return result;
}
