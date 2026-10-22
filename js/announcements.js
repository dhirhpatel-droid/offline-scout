// Announcements on the phone: download with sync, a copy saved for offline
// reading, and (Leads, with signal) post and remove.
// Saved as announcements:<groupId> (newest first) and announcementsSeen:<groupId>
// (when this phone last opened the list, for "unread").

import { sb } from './supabase.js';
import { getSetting, setSetting } from './db.js';
import { cachedProfile } from './account.js';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function downloadAnnouncements(groupId) {
  const rows = must(await sb.from('announcements')
    .select('id, body, created_by, author_name, created_at')
    .eq('group_id', groupId).order('created_at', { ascending: false }).limit(50));
  const before = await getSetting(`announcements:${groupId}`);
  await setSetting(`announcements:${groupId}`, rows);
  rows.changed = JSON.stringify(before ?? []) !== JSON.stringify(rows); // so screens know to redraw
  return rows;
}

export const cachedAnnouncements = async (groupId) => (groupId && (await getSetting(`announcements:${groupId}`))) || [];

// When this phone last looked at the list.
export const lastSeen = (groupId) => getSetting(`announcementsSeen:${groupId}`);
export const markSeen = (groupId, at) => setSetting(`announcementsSeen:${groupId}`, at);

// Leads only (the database checks).
export async function postAnnouncement(group, body) {
  const [{ data: { user } }, profile] = await Promise.all([sb.auth.getUser(), cachedProfile()]);
  must(await sb.from('announcements').insert({
    group_id: group.id, body: body.trim(), created_by: user.id, author_name: profile?.display_name ?? '',
  }));
  return downloadAnnouncements(group.id);
}

export async function removeAnnouncement(group, id) {
  must(await sb.from('announcements').delete().eq('id', id));
  return downloadAnnouncements(group.id);
}
