// On-device storage with IndexedDB (no library).
//
// Why IndexedDB and not localStorage? localStorage is small (about 5 MB), stores
// only strings, and the browser may clear it more readily. IndexedDB stores real
// objects, holds far more, and is what installed web apps are expected to use.
//
// Three "object stores" (like tables):
//   entries  – submitted matches, keyed by entry.id
//   drafts   – the match being scouted right now, autosaved on every tap
//   settings – small key/value things: scout name, event name, theme, game config

const DB_NAME = 'offline-scout';
const DB_VERSION = 1;

let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Runs the first time, or when DB_VERSION goes up: create the stores.
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// Runs one request inside a transaction and waits until the data is really
// written (transaction "complete"), not just queued.
async function run(storeName, mode, makeRequest) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = makeRequest(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Saved matches
export const putEntry = (entry) => run('entries', 'readwrite', (s) => s.put(entry));
export const getEntry = (id) => run('entries', 'readonly', (s) => s.get(id));
export const deleteEntry = (id) => run('entries', 'readwrite', (s) => s.delete(id));
export const countEntries = () => run('entries', 'readonly', (s) => s.count());
export async function listEntries() {
  const all = await run('entries', 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
}

// The in-progress match (one at a time)
export const getDraft = () => run('drafts', 'readonly', (s) => s.get('current'));
export const putDraft = (entry) => run('drafts', 'readwrite', (s) => s.put(entry, 'current'));
export const clearDraft = () => run('drafts', 'readwrite', (s) => s.delete('current'));

// Settings
export const getSetting = (key) => run('settings', 'readonly', (s) => s.get(key));
export const setSetting = (key, value) => run('settings', 'readwrite', (s) => s.put(value, key));

// Ask the browser not to clear our data when the phone is low on space.
// Browsers may say no; the data is still saved either way.
export async function requestPersistentStorage() {
  if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
    return navigator.storage.persist();
  }
  return navigator.storage?.persisted?.() ?? false;
}
