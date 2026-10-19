// Database rules for Assignments (supabase/migrations/*_assignments.sql).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, person } from './helpers/database.js';

const lead = person(1, 'Dhir');
const scout = person(2, 'Maya');
const scout2 = person(3, 'Sam');
const stranger = person(4, 'Zoe');
let as;
let groupId;
let eventId;

before(async () => {
  const d = await freshDatabase();
  as = d.as;
  for (const p of [lead, scout, scout2, stranger]) await d.signUp(p);
  [{ create_group: groupId }] = await as(lead, `select public.create_group('FTC', 16415, 'Lo-Ellen EDIT', 'ftc-2026-biobuzz')`);
  for (const p of [scout, scout2]) {
    await as(lead, 'insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)', [groupId, p.email, lead.id]);
    const [{ id }] = await as(p, 'select id from public.invites where email = $1', [p.email]);
    await as(p, 'select public.accept_invite($1)', [id]);
  }
  [{ id: eventId }] = await as(null, `insert into public.events (program, season, code, name) values ('FTC', 2026, 'CAONSUQ', 'Sudbury') returning id`);
});

const shift = (who, scoutId, position = 'red1', from = 1, to = 20) => as(who,
  `insert into public.position_shifts (group_id, event_id, scout_id, position, from_match, to_match, created_by)
   values ($1, $2, $3, $4, $5, $6, $7) returning id`, [groupId, eventId, scoutId, position, from, to, who.id]);
const watch = (who, scoutId, team) => as(who,
  `insert into public.team_watches (group_id, event_id, scout_id, team_number, created_by) values ($1, $2, $3, $4, $5) returning id`,
  [groupId, eventId, scoutId, team, who.id]);

test('a Lead gives a Scout a Position shift and a Team watch', async () => {
  await shift(lead, scout.id, 'red1', 1, 20);
  await watch(lead, scout.id, 23810);
  assert.equal((await as(scout, 'select * from public.position_shifts')).length, 1);
  assert.equal((await as(scout, 'select * from public.team_watches')).length, 1);
});

test('everyone in the group can see the plan; outsiders can\'t', async () => {
  assert.equal((await as(scout2, 'select * from public.position_shifts')).length, 1);
  assert.equal((await as(stranger, 'select * from public.position_shifts')).length, 0);
});

test('only Leads make or remove assignments', async () => {
  await assert.rejects(shift(scout, scout.id), /row-level security/);
  await assert.rejects(watch(scout, scout2.id, 16012), /row-level security/);
  const [{ id }] = await shift(lead, scout2.id, 'blue2', 1, 10);
  await as(scout2, 'delete from public.position_shifts where id = $1', [id]);
  assert.equal((await as(lead, 'select * from public.position_shifts where id = $1', [id])).length, 1, 'a Scout can\'t delete it');
  await as(lead, 'delete from public.position_shifts where id = $1', [id]);
  assert.equal((await as(lead, 'select * from public.position_shifts where id = $1', [id])).length, 0);
});

test('Leads can only assign people who are in the group', async () => {
  await assert.rejects(shift(lead, stranger.id), /row-level security/);
});

test('shifts must make sense (real position, from ≤ to)', async () => {
  await assert.rejects(shift(lead, scout.id, 'green1'), /check constraint/);
  await assert.rejects(shift(lead, scout.id, 'red1', 20, 5), /check constraint/);
});
