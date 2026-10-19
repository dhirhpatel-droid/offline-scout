// On-device storage with IndexedDB (no library).
//
// Why IndexedDB and not localStorage? localStorage is small (about 5 MB), stores
// only strings, and the browser may clear it more readily. IndexedDB stores real
// objects, holds far more, and is what installed web apps are expected to use.
//
// Three "object stores" (like tables):
//   submissions – saved Submissions, keyed by submission.id
//   drafts      – the Draft being scouted right now, autosaved on every tap
//   settings    – small key/value things: scout name, event name, theme, game config

import { fromMilestone1 } from './submissions.js';

const DB_NAME = 'offline-scout';
// Version history:
//   1 – Milestone 1: "entries" store
//   2 – Milestone 1.5: "entries" became "submissions" (UUIDs, Alliance position)
const DB_VERSION = 2;

let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Runs the first time, or when DB_VERSION goes up. "oldVersion" says what
    // the phone had before (0 = brand new), so each step upgrades from there.
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (event.oldVersion < 1) {
        db.createObjectStore('drafts');
        db.createObjectStore('settings');
      }
      if (event.oldVersion < 2) {
        db.createObjectStore('submissions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        if (event.oldVersion >= 1) upgradeFromMilestone1(db, tx);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Another open tab still has the old version: ask the user to close it.
    request.onblocked = () => console.warn('Close other Offline Scout tabs to finish updating.');
  });
  return dbPromise;
}

// Copies every Milestone 1 entry (and the Draft) into the new format, then
// removes the old store. Runs inside the upgrade, so it's all-or-nothing:
// if anything fails, the phone keeps version 1 and nothing is lost.
function upgradeFromMilestone1(db, tx) {
  const entries = tx.objectStore('entries');
  const submissions = tx.objectStore('submissions');
  entries.openCursor().onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      submissions.put(fromMilestone1(cursor.value));
      cursor.continue();
    } else {
      db.deleteObjectStore('entries');
    }
  };
  const drafts = tx.objectStore('drafts');
  drafts.get('current').onsuccess = (e) => {
    if (e.target.result) drafts.put(fromMilestone1(e.target.result), 'current');
  };
  // "Next match" memory used the old alliance colour; start fresh.
  tx.objectStore('settings').delete('nextCarry');
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

// Saved Submissions. A deleted one is kept (with deletedAt) until the group
// has heard about the delete, but never shown.
export const putSubmission = (sub) => run('submissions', 'readwrite', (s) => s.put(sub));
export const getSubmission = (id) => run('submissions', 'readonly', (s) => s.get(id));
export const removeSubmission = (id) => run('submissions', 'readwrite', (s) => s.delete(id));
export async function listAllSubmissions() {
  const all = await run('submissions', 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
}
export async function listSubmissions() {
  return (await listAllSubmissions()).filter((s) => !s.deletedAt);
}
export const countSubmissions = async () => (await listSubmissions()).length;

// Deleting marks it, so the delete reaches the group on the next sync.
export async function deleteSubmission(id) {
  const sub = await getSubmission(id);
  if (!sub) return;
  const now = new Date().toISOString();
  await putSubmission({ ...sub, deletedAt: now, updatedAt: now });
}

// Drafts. Normally one ('current'). When a Scout watches two Teams in the
// same match, the other Team's Draft waits under 'second'.
export const getDraft = (slot = 'current') => run('drafts', 'readonly', (s) => s.get(slot));
export const putDraft = (sub, slot = 'current') => run('drafts', 'readwrite', (s) => s.put(sub, slot));
export const clearDraft = (slot = 'current') => run('drafts', 'readwrite', (s) => s.delete(slot));

// Swap the two Drafts (the two-Team switch on the match screen).
export async function swapDrafts() {
  const [a, b] = await Promise.all([getDraft('current'), getDraft('second')]);
  if (!b) return;
  await putDraft(b, 'current');
  await putDraft(a, 'second');
}

// The current Draft is done (saved or discarded): the waiting one moves up.
export async function finishDraft() {
  const second = await getDraft('second');
  await clearDraft('second');
  if (second) await putDraft(second, 'current');
  else await clearDraft('current');
  return second ?? null;
}

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
