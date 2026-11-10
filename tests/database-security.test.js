// Database rules from the security review (supabase/migrations/*_security_fixes.sql).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, person } from './helpers/database.js';

const lead = person(1, 'Dhir');
const scout = person(2, 'Maya');
const stranger = person(3, 'Zoe');
let as;
let groupId;
let eventId;

before(async () => {
  const d = await freshDatabase();
  as = d.as;
  for (const p of [lead, scout, stranger]) await d.signUp(p);
  [{ create_group: groupId }] = await as(lead, `select public.create_group('FTC', 16415, 'Lo-Ellen EDIT', 'ftc-2026-biobuzz')`);
  await as(lead, 'insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)', [groupId, scout.email, lead.id]);
  const [{ id }] = await as(scout, 'select id from public.invites where email = $1', [scout.email]);
  await as(scout, 'select public.accept_invite($1)', [id]);
  await as(null, `update public.groups set settings = '{"scoutsSeeAll": true, "teamsSort": "avg"}' where id = $1`, [groupId]);
  [{ id: eventId }] = await as(null, `insert into public.events (program, season, code, name) values ('FTC', 2026, 'CAONSUQ', 'Sudbury') returning id`);
});

test('outsiders can\'t read a group\'s settings or who is in it', async () => {
  const setting = (who) => as(who, `select public.group_setting($1, 'scoutsSeeAll', false) as v`, [groupId]).then((r) => r[0].v);
  assert.equal(await setting(scout), true);
  assert.equal(await setting(stranger), false, 'a stranger only gets the fallback');
  const member = (who) => as(who, 'select public.is_member_of($1, $2) as v', [groupId, scout.id]).then((r) => r[0].v);
  assert.equal(await member(lead), true);
  assert.equal(await member(stranger), false);
  // A setting that isn't true/false falls back instead of erroring.
  assert.equal((await as(scout, `select public.group_setting($1, 'teamsSort', true) as v`, [groupId]))[0].v, true);
});

test('the name on a Submission is always the Scout\'s own profile name', async () => {
  const s = {
    id: crypto.randomUUID(), group_id: groupId, scout_name: 'Dhir', event: 'Sudbury',
    config_id: 'ftc-2026-biobuzz', config_version: 5, match_level: 'qual', match_number: 1,
    team_number: 23810, alliance_position: 'red1', values: {}, estimated_points: 0,
    created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z', submitted_at: '2026-11-10T10:00:00Z',
  };
  await as(scout, 'select public.save_submission($1)', [JSON.stringify(s)]);
  const [row] = await as(lead, 'select scout_name from public.submissions where id = $1', [s.id]);
  assert.equal(row.scout_name, 'Maya');
});

test('a Submission can\'t be huge', async () => {
  await assert.rejects(as(null, `insert into public.submissions (id, group_id, scout_id, scout_name, config_id, config_version, "values",
      created_at, updated_at) values ($1, $2, $3, 'Maya', 'ftc-2026-biobuzz', 5, $4, now(), now())`,
  [crypto.randomUUID(), groupId, scout.id, JSON.stringify({ 'post.notes': 'x'.repeat(40000) })]), /submissions_values_size/);
});

test('someone removed from the group stops counting in the plan', async () => {
  await as(lead, `insert into public.position_shifts (group_id, event_id, scout_id, position, from_match, to_match, created_by)
    values ($1, $2, $3, 'red1', 1, 20, $4)`, [groupId, eventId, scout.id, lead.id]);
  await as(lead, `insert into public.team_watches (group_id, event_id, scout_id, team_number, created_by)
    values ($1, $2, $3, 23810, $4)`, [groupId, eventId, scout.id, lead.id]);
  await as(lead, 'delete from public.memberships where group_id = $1 and user_id = $2', [groupId, scout.id]);
  assert.equal((await as(lead, 'select * from public.position_shifts')).length, 0);
  assert.equal((await as(lead, 'select * from public.team_watches')).length, 0);
});
