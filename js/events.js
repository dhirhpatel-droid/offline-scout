// Events from FIRST on the phone: search, choose the Current event (Leads),
// and keep a copy of its teams and schedule for offline use.
//
// Copy kept in IndexedDB settings: event:<eventId> = { event, teams, matches, savedAt }

import { sb, isOnline } from './supabase.js';
import { getSetting, setSetting } from './db.js';
import { refreshAccount, currentGroup } from './account.js';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Calls the event-data server function, with its own error message if it sent one.
async function eventFunction(body) {
  const { data, error } = await sb.functions.invoke('event-data', { body });
  if (error) {
    const msg = await error.context?.json?.().then((b) => b?.error).catch(() => null);
    throw new Error(msg ?? error.message);
  }
  return data;
}

export async function searchEvents({ program, season, text }) {
  const { events } = await eventFunction({ action: 'search', program, season, text });
  return events;
}

// A Lead picks an event: the server fetches it from FIRST data, then it
// becomes the group's Current event and its schedule is saved on this phone.
export async function chooseEvent(group, { program, season, code }) {
  const { eventId } = await eventFunction({ action: 'import', program, season, code });
  must(await sb.rpc('set_current_event', { p_group: group.id, p_event: eventId }));
  await refreshAccount();
  await downloadEvent(eventId);
  await downloadPlan(group.id, eventId);
  return eventId;
}

// Download an event's teams and schedule into the phone's copy.
export async function downloadEvent(eventId) {
  const [event, teams, matches] = await Promise.all([
    sb.from('events').select('*').eq('id', eventId).single().then(must),
    sb.from('event_teams').select('team_number, team_name').eq('event_id', eventId).order('team_number').then(must),
    sb.from('event_matches').select('level, number, game, scheduled_at, red, blue, red_score, blue_score, played')
      .eq('event_id', eventId).order('level').order('number').order('game').then(must),
  ]);
  const data = { event, teams, matches, savedAt: new Date().toISOString() };
  await setSetting(`event:${eventId}`, data);
  return data;
}

// The phone's copy of an event (works offline), or null.
export const cachedEvent = (eventId) => (eventId ? getSetting(`event:${eventId}`) : null);

// The current group's event data, from the phone's copy.
export async function currentEventData() {
  const group = await currentGroup();
  return group?.currentEvent ? cachedEvent(group.currentEvent.id) : null;
}

// Keep the Current event fresh (called by sync): ask the server to re-fetch
// from FIRST data (it does so at most every 5 minutes), then download.
export async function refreshCurrentEvent() {
  const group = await currentGroup();
  const ev = group?.currentEvent;
  if (!ev || !isOnline()) return null;
  await eventFunction({ action: 'import', program: ev.program, season: ev.season, code: ev.code }).catch(() => null);
  await downloadPlan(group.id, ev.id).catch((err) => console.warn('Plan download failed:', err));
  return downloadEvent(ev.id);
}

// ---------- the plan (Milestone 5) ----------
// The group's Position shifts and Team watches for an event, saved on the
// phone as plan:<groupId>:<eventId> = { shifts, watches, savedAt }.

export async function downloadPlan(groupId, eventId) {
  const [shifts, watches] = await Promise.all([
    sb.from('position_shifts').select('id, scout_id, position, from_match, to_match')
      .eq('group_id', groupId).eq('event_id', eventId).order('from_match').then(must),
    sb.from('team_watches').select('id, scout_id, team_number')
      .eq('group_id', groupId).eq('event_id', eventId).order('team_number').then(must),
  ]);
  const plan = { shifts, watches, savedAt: new Date().toISOString() };
  await setSetting(`plan:${groupId}:${eventId}`, plan);
  return plan;
}

export async function cachedPlan(groupId, eventId) {
  return (groupId && eventId && (await getSetting(`plan:${groupId}:${eventId}`))) || { shifts: [], watches: [] };
}

// Leads only (the database checks): add or remove a shift or a watch.
export async function addShift(group, { scoutId, position, from, to }) {
  const { data: { user } } = await sb.auth.getUser();
  must(await sb.from('position_shifts').insert({
    group_id: group.id, event_id: group.currentEvent.id, scout_id: scoutId,
    position, from_match: from, to_match: to, created_by: user.id,
  }));
  return downloadPlan(group.id, group.currentEvent.id);
}

export async function addWatch(group, { scoutId, team }) {
  const { data: { user } } = await sb.auth.getUser();
  must(await sb.from('team_watches').insert({
    group_id: group.id, event_id: group.currentEvent.id, scout_id: scoutId, team_number: team, created_by: user.id,
  }));
  return downloadPlan(group.id, group.currentEvent.id);
}

export async function removeAssignment(group, kind, id) {
  must(await sb.from(kind === 'shift' ? 'position_shifts' : 'team_watches').delete().eq('id', id));
  return downloadPlan(group.id, group.currentEvent.id);
}
