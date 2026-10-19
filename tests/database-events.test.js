// Database rules for Events (supabase/migrations/*_events.sql).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, person } from './helpers/database.js';

const lead = person(1, 'Dhir');
const scout = person(2, 'Maya');
const stranger = person(3, 'Zoe');
let as;
let groupId;
let eventA;
let eventB;

before(async () => {
  const d = await freshDatabase();
  as = d.as;
  for (const p of [lead, scout, stranger]) await d.signUp(p);
  [{ create_group: groupId }] = await as(lead, `select public.create_group('FTC', 16415, 'Lo-Ellen EDIT', 'ftc-2026-biobuzz')`);
  await as(lead, 'insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)', [groupId, scout.email, lead.id]);
  const [{ id }] = await as(scout, 'select id from public.invites where email = $1', [scout.email]);
  await as(scout, 'select public.accept_invite($1)', [id]);
  // The server function (database owner here) stores two events and a schedule.
  [{ id: eventA }] = await as(null, `insert into public.events (program, season, code, name) values ('FTC', 2026, 'CAONBOQ', 'Bolton Qualifier') returning id`);
  [{ id: eventB }] = await as(null, `insert into public.events (program, season, code, name) values ('FTC', 2026, 'CAONCMP', 'Ontario Championship') returning id`);
  await as(null, `insert into public.event_matches (event_id, level, number, red, blue) values ($1, 'qual', 1, '{22309,24436}', '{30420,25049}')`, [eventA]);
});

test('anyone signed in can read events and schedules (public FIRST data)', async () => {
  const rows = await as(stranger, 'select red, blue from public.event_matches where event_id = $1', [eventA]);
  assert.deepEqual(rows, [{ red: [22309, 24436], blue: [30420, 25049] }]);
});

test('nobody can write event data from a phone; only the server function can', async () => {
  await assert.rejects(as(lead, `insert into public.events (program, season, code, name) values ('FTC', 2026, 'X', 'Fake')`), /permission denied/);
  await assert.rejects(as(lead, `update public.event_matches set red = '{1,2}' where event_id = $1`, [eventA]), /permission denied/);
});

test('a Lead sets the Current event; Scouts in the group see it', async () => {
  await as(lead, 'select public.set_current_event($1, $2)', [groupId, eventA]);
  const rows = await as(scout, 'select event_id, is_current from public.group_events where group_id = $1', [groupId]);
  assert.deepEqual(rows, [{ event_id: eventA, is_current: true }]);
});

test('switching events keeps exactly one Current event', async () => {
  await as(lead, 'select public.set_current_event($1, $2)', [groupId, eventB]);
  const rows = await as(lead, 'select event_id from public.group_events where group_id = $1 and is_current', [groupId]);
  assert.deepEqual(rows, [{ event_id: eventB }]);
  const all = await as(lead, 'select count(*)::int as n from public.group_events where group_id = $1', [groupId]);
  assert.equal(all[0].n, 2, 'the earlier event stays in the list');
});

test('only a Lead can choose the event', async () => {
  await assert.rejects(as(scout, 'select public.set_current_event($1, $2)', [groupId, eventA]), /Only a Lead/);
  await assert.rejects(as(stranger, 'select public.set_current_event($1, $2)', [groupId, eventA]), /Only a Lead/);
});

test('other groups can\'t see which events a group attends', async () => {
  assert.equal((await as(stranger, 'select * from public.group_events')).length, 0);
});

test('Submissions keep the Event they were scouted at', async () => {
  const s = {
    id: crypto.randomUUID(), group_id: groupId, scout_name: 'Maya', event: 'Bolton Qualifier', event_id: eventA,
    config_id: 'ftc-2026-biobuzz', config_version: 3, match_level: 'qual', match_number: 1, team_number: 22309,
    alliance_position: 'red1', values: {}, estimated_points: 0,
    created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z', submitted_at: '2026-10-20T10:00:00Z',
  };
  assert.equal((await as(scout, 'select public.save_submission($1) as r', [JSON.stringify(s)]))[0].r, 'saved');
  const [row] = await as(lead, 'select event_id from public.submissions where id = $1', [s.id]);
  assert.equal(row.event_id, eventA);
});
