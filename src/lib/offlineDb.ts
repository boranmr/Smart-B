import type { PendingMutation, UserAccount, WorkspaceState } from '../types/inventory';

const DB_NAME = 'SmartInventoryAIDB';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('workspaces')) {
        db.createObjectStore('workspaces', { keyPath: 'workspaceId' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'mutationId' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWorkspaceLocally(ws: WorkspaceState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readwrite');
    tx.objectStore('workspaces').put(ws);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getWorkspaceLocally(workspaceId: string): Promise<WorkspaceState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readonly');
    const req = tx.objectStore('workspaces').get(workspaceId);
    req.onsuccess = () => resolve((req.result as WorkspaceState) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineMutation(mutation: PendingMutation): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingMutations(workspaceId?: string): Promise<PendingMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const req = tx.objectStore('outbox').getAll();
    req.onsuccess = () => {
      const all = (req.result as PendingMutation[]) || [];
      const filtered = workspaceId ? all.filter((m) => m.workspaceId === workspaceId) : all;
      filtered.sort((a, b) => a.clientTimestamp - b.clientTimestamp);
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removePendingMutations(mutationIds: string[]): Promise<void> {
  if (mutationIds.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    for (const id of mutationIds) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveCachedProfile(user: UserAccount | null, workspaceId: string | null): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    if (user && workspaceId) {
      store.put({ key: 'activeSessionProfile', user, workspaceId });
    } else {
      store.delete('activeSessionProfile');
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedProfile(): Promise<{ user: UserAccount; workspaceId: string } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get('activeSessionProfile');
    req.onsuccess = () => {
      const res = req.result as { key: string; user: UserAccount; workspaceId: string } | undefined;
      resolve(res ? { user: res.user, workspaceId: res.workspaceId } : null);
    };
    req.onerror = () => reject(req.error);
  });
}
