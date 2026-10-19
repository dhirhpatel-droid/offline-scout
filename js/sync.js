// Sync: sends this phone's Submissions to the group and downloads the
// group's changes, whenever there's signal. The rules are in sync-rules.js.
//
// When it runs: when the app opens, when signal comes back, right after a
// match is saved, and every minute while the app is on screen. Only one sync
// runs at a time. Without signal it simply does nothing; nothing is lost.
//
// What the phone remembers (IndexedDB settings):
//   pull:<groupId> – the server time of the last change downloaded for a group
//   lastSyncAt     – when a sync last finished

import { sb, isOnline } from './supabase.js';
import { currentUser, cachedGroups, currentGroup, refreshAccount } from './account.js';
import {
  listAllSubmissions, getSubmission, putSubmission, removeSubmission, getSetting, setSetting,
} from './db.js';
import { toServer, decide, fromServer, hasUnsentChanges, claim } from './sync-rules.js';
import { refreshCurrentEvent } from './events.js';

let running = null;
// The last sync's result, so screens drawn later can show it too.
export let lastResult = null;

// Start a sync (or join the one already running). Resolves to a summary:
// { ok, sent, received, waiting, error? }
export function syncNow() {
  running ??= doSync().finally(() => { running = null; });
  return running;
}

export async function unsentCount() {
  return (await listAllSubmissions()).filter(hasUnsentChanges).length;
}

async function doSync() {
  const result = { ok: false, sent: 0, received: 0, waiting: 0 };
  const user = await currentUser();
  if (!user || !isOnline()) {
    result.waiting = await unsentCount();
    return finish(result, isOnline() ? 'signed-out' : 'offline');
  }
  try {
    await refreshAccount();
    const groups = await cachedGroups();
    const myGroupIds = new Set(groups.map((g) => g.id));
    const current = await currentGroup();

    // 1. Send: everything with changes the server hasn't got.
    for (let sub of await listAllSubmissions()) {
      if (!hasUnsentChanges(sub)) continue;
      sub = claim(sub, { userId: user.id, groupId: current?.id });
      if (!myGroupIds.has(sub.groupId)) continue; // not in that group any more: keep it on the phone
      const { data, error } = await sb.rpc('save_submission', { s: toServer(sub) });
      if (error) throw error;
      if (data === 'saved') {
        await putSubmission({ ...sub, syncedAt: sub.updatedAt });
        result.sent += 1;
      }
      // 'older': someone made a newer edit; the download below brings it in.
    }

    // 2. Download: what changed in each of my groups since last time.
    for (const g of groups) {
      const cursorKey = `pull:${g.id}`;
      let cursor = (await getSetting(cursorKey)) ?? '1970-01-01T00:00:00Z';
      for (;;) {
        const { data: rows, error } = await sb.from('submissions').select('*')
          .eq('group_id', g.id).gt('server_updated_at', cursor)
          .order('server_updated_at').limit(500);
        if (error) throw error;
        for (const row of rows) {
          const local = await getSubmission(row.id);
          const action = decide(local, row);
          if (action === 'add' || action === 'replace') {
            await putSubmission(fromServer(row));
            result.received += 1;
          } else if (action === 'remove') {
            await removeSubmission(row.id);
            result.received += 1;
          }
          cursor = row.server_updated_at;
        }
        await setSetting(cursorKey, cursor);
        if (rows.length < 500) break;
      }
    }

    // 3. Keep the Current event's schedule and scores fresh on this phone.
    await refreshCurrentEvent().catch((err) => console.warn('Event refresh failed:', err));

    result.ok = true;
    result.waiting = await unsentCount();
    await setSetting('lastSyncAt', new Date().toISOString());
    return finish(result);
  } catch (err) {
    console.warn('Sync failed (will try again):', err);
    result.waiting = await unsentCount();
    return finish(result, err.message ?? String(err));
  }
}

// Tell the screens (they listen for "scout-sync" and refresh their status).
function finish(result, error) {
  if (error) result.error = error;
  lastResult = result;
  window.dispatchEvent(new CustomEvent('scout-sync', { detail: result }));
  return result;
}

// Runs sync at the right moments. Called once from app.js.
export function startAutoSync() {
  syncNow();
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 60_000);
}

// The phrase for "where are my matches?" in the Home and My matches footers.
//   { text, state: 'waiting' | 'failed' | 'sent' | 'none' }
export function sendStatus({ unsent, lastSyncAt, result }) {
  if (unsent && result?.error && result.error !== 'offline' && result.error !== 'signed-out') {
    return { state: 'failed', text: 'Couldn’t reach your group. Your matches are safe on this phone.' };
  }
  if (unsent) return { state: 'waiting', text: `${unsent} waiting · sends when you have signal` };
  if (lastSyncAt) return { state: 'sent', text: `All sent · ${timeAgo(lastSyncAt)}` };
  return { state: 'none', text: 'Works with no signal' };
}

export function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
