import type { Snapshot } from './snapshot';

export interface SavedWork { revision: string; savedAt: number; snapshot: Snapshot | null }
export class RecoveryConflict extends Error {}
const databaseName = 'qh-pdf-recovery';
const storeName = 'workspaces';

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser storage is busy.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readSavedWork(): Promise<SavedWork | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get('current');
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

// Compare and write in ONE transaction: stale tabs cannot overwrite a newer or cleared copy.
export async function writeSavedWork(snapshot: Snapshot | null, expectedRevision: string | null): Promise<SavedWork> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get('current');
      let result: SavedWork;
      let failure: unknown;
      request.onsuccess = () => {
        if ((request.result?.revision ?? null) !== expectedRevision) {
          failure = new RecoveryConflict('Saved work changed in another tab. Download your current PDF before reloading to choose which work to keep.');
          transaction.abort();
          return;
        }
        try {
          // Clearing replaces all content with a new revision, never the original
          // null revision. Otherwise an old initially-empty tab could recreate it.
          result = { revision: crypto.randomUUID(), savedAt: Date.now(), snapshot };
          store.put(result, 'current');
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error);
      transaction.onerror = () => reject(failure ?? transaction.error);
    });
  } finally { db.close(); }
}
