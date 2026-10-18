// Database rules for Submissions sync (supabase/migrations/*_submissions_sync.sql).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, person } from './helpers/database.js';

const lead = person(1, 'Dhir');
const scout = person(2, 'Maya');
const scout2 = person(3, 'Sam');
const stranger = person(4, 'Zoe');
let as;
let groupId;

// A Submission as a phone sends it.
const sub = (over = {}) => ({
  id: crypto.randomUUID(), group_id: groupId, scout_name: 'Maya', event: 'Sudbury',
  config_id: 'ftc-2026-biobuzz', config_version: 3, match_level: 'qual', match_number: 14,
  team_number: 23810, alliance_position: 'red1', values: { 'auto.hiveTips': 2 }, estimated_points: 40,
  created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:05:00Z', submitted_at: '2026-10-19T10:05:00Z',
  ...over,
});
const save = (who, s) => as(who, 'select public.save_submission($1) as r', [JSON.stringify(s)]).then((r) => r[0].r);

before(async () => {
  const d = await freshDatabase();
  as = d.as;
  for (const p of [lead, scout, scout2, stranger]) await d.signUp(p);
  [{ create_group: groupId }] = await as(lead, `select public.create_group('FTC', 4069, 'Lo-Ellen', 'ftc-2026-biobuzz')`);
  for (const p of [scout, scout2]) {
    await as(lead, 'insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)', [groupId, p.email, lead.id]);
    const [{ id }] = await as(p, 'select id from public.invites where email = $1', [p.email]);
    await as(p, 'select public.accept_invite($1)', [id]);
  }
});

test('a Scout sends a Submission; it belongs to them and the group', async () => {
  const s = sub();
  assert.equal(await save(scout, s), 'saved');
  const [row] = await as(scout, 'select scout_id, scout_name, estimated_points from public.submissions where id = $1', [s.id]);
  assert.deepEqual(row, { scout_id: scout.id, scout_name: 'Maya', estimated_points: 40 });
});

test('Leads see every Submission; Scouts only their own by default', async () => {
  await save(scout2, sub({ scout_name: 'Sam' }));
  const leadSees = await as(lead, 'select scout_name from public.submissions order by scout_name');
  assert.ok(leadSees.length >= 2);
  const mayaSees = await as(scout, 'select distinct scout_name from public.submissions');
  assert.deepEqual(mayaSees, [{ scout_name: 'Maya' }]);
});

test('with the Group setting on, Scouts see everyone\'s', async () => {
  await as(lead, `update public.groups set settings = '{"scoutsSeeAll": true}' where id = $1`, [groupId]);
  const mayaSees = await as(scout, 'select distinct scout_name from public.submissions order by 1');
  assert.deepEqual(mayaSees.map((r) => r.scout_name), ['Maya', 'Sam']);
  await as(lead, `update public.groups set settings = '{}' where id = $1`, [groupId]);
});

test('people outside the group can neither see nor send', async () => {
  assert.equal((await as(stranger, 'select * from public.submissions')).length, 0);
  await assert.rejects(save(stranger, sub()), /row-level security/);
});

test('the newer edit wins, whichever arrives first', async () => {
  const s = sub();
  await save(scout, s);
  // The Lead edits at 10:10 (newer) …
  assert.equal(await save(lead, { ...s, values: { 'auto.hiveTips': 3 }, updated_at: '2026-10-19T10:10:00Z' }), 'saved');
  // … then Maya's offline edit from 10:07 (older) finally syncs: it does not overwrite.
  assert.equal(await save(scout, { ...s, values: { 'auto.hiveTips': 9 }, updated_at: '2026-10-19T10:07:00Z' }), 'older');
  const [row] = await as(lead, 'select "values" from public.submissions where id = $1', [s.id]);
  assert.deepEqual(row.values, { 'auto.hiveTips': 3 });
});

test('every replaced version is kept in the history, for Leads to see', async () => {
  const s = sub();
  await save(scout, s);
  await save(scout, { ...s, values: { 'auto.hiveTips': 5 }, updated_at: '2026-10-19T11:00:00Z' });
  const history = await as(lead, 'select values_before, edited_by from public.submission_edits where submission_id = $1', [s.id]);
  assert.deepEqual(history, [{ values_before: { 'auto.hiveTips': 2 }, edited_by: scout.id }]);
  assert.equal((await as(scout, 'select * from public.submission_edits where submission_id = $1', [s.id])).length, 0);
});

test('a Scout cannot change someone else\'s Submission', async () => {
  const s = sub({ scout_name: 'Sam' });
  await save(scout2, s);
  await as(lead, `update public.groups set settings = '{"scoutsSeeAll": true}' where id = $1`, [groupId]);
  await save(scout, { ...s, values: { hacked: true }, updated_at: '2026-10-19T12:00:00Z' }).catch(() => null);
  const [row] = await as(lead, 'select "values" from public.submissions where id = $1', [s.id]);
  assert.deepEqual(row.values, { 'auto.hiveTips': 2 });
  await as(lead, `update public.groups set settings = '{}' where id = $1`, [groupId]);
});

test('with "Leads can edit" turned off, Leads cannot change Scouts\' Submissions', async () => {
  const s = sub();
  await save(scout, s);
  await as(lead, `update public.groups set settings = '{"leadsCanEdit": false}' where id = $1`, [groupId]);
  await save(lead, { ...s, values: {}, updated_at: '2026-10-19T13:00:00Z' }).catch(() => null);
  const [row] = await as(lead, 'select "values" from public.submissions where id = $1', [s.id]);
  assert.deepEqual(row.values, { 'auto.hiveTips': 2 });
  await as(lead, `update public.groups set settings = '{}' where id = $1`, [groupId]);
});

test('deleting marks the Submission deleted so other phones can remove it', async () => {
  const s = sub();
  await save(scout, s);
  await save(scout, { ...s, deleted_at: '2026-10-19T14:00:00Z', updated_at: '2026-10-19T14:00:00Z' });
  const [row] = await as(lead, 'select deleted_at is not null as gone from public.submissions where id = $1', [s.id]);
  assert.equal(row.gone, true);
});

test('phones cannot move a Submission to another group or fake who scouted it', async () => {
  const s = sub();
  await save(scout, s);
  await assert.rejects(as(scout, 'update public.submissions set scout_id = $1 where id = $2', [lead.id, s.id]), /permission denied/);
  await assert.rejects(as(scout, 'update public.submissions set group_id = gen_random_uuid() where id = $1', [s.id]), /permission denied/);
});

test('each change gets a server time, so phones can ask "what changed since…"', async () => {
  const s = sub();
  await save(scout, s);
  const [a] = await as(scout, 'select server_updated_at from public.submissions where id = $1', [s.id]);
  await save(scout, { ...s, values: { x: 1 }, updated_at: '2026-10-19T15:00:00Z' });
  const [b] = await as(scout, 'select server_updated_at from public.submissions where id = $1', [s.id]);
  assert.ok(new Date(b.server_updated_at) >= new Date(a.server_updated_at));
});
