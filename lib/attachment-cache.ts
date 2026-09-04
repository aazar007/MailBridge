import type { EmailAttachment } from '@/lib/send-types';

const DB_NAME = 'mailbridge-files';
const DB_VERSION = 1;
const STORE = 'attachments';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open file cache'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function cacheAttachment(file: EmailAttachment): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to cache file'));
    tx.objectStore(STORE).put(file);
  });
  db.close();
}

export async function loadCachedAttachment(id: string): Promise<EmailAttachment | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  const file = await new Promise<EmailAttachment | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    tx.onerror = () => reject(tx.error ?? new Error('Failed to read cached file'));
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as EmailAttachment | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to read cached file'));
  });
  db.close();
  return file;
}

export async function removeCachedAttachment(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to remove cached file'));
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}

export async function removeCachedAttachments(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => removeCachedAttachment(id)));
}

export async function clearAllAttachmentCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear file cache'));
    tx.objectStore(STORE).clear();
  });
  db.close();
}
