// Database rules for QR backup (supabase/migrations/*_qr_backup.sql): a Lead
// uploads a scanned Submission, and it stays the Scout's.
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

test('a Lead uploads a scanned Submission for a Scout: it stays the Scout\'s', async () => {
  const s = sub({ scout_id: scout.id });
  assert.equal(await save(lead, s), 'saved');
  const [row] = await as(lead, 'select scout_id, added_by from public.submissions where id = $1', [s.id]);
  assert.equal(row.scout_id, scout.id);
  assert.equal(row.added_by, lead.id, 'it says the Lead added it');
  // The Scout's own phone sends the same Submission later: it's theirs to update.
  assert.equal(await save(scout, { ...s, updated_at: '2026-10-19T11:00:00Z', estimated_points: 44 }), 'saved');
  const [after] = await as(scout, 'select estimated_points from public.submissions where id = $1', [s.id]);
  assert.equal(after.estimated_points, 44);
});

test('a Scout can\'t upload as someone else', async () => {
  await assert.rejects(save(scout, sub({ scout_id: scout2.id })), /row-level security/);
});

test('a Lead can\'t upload for someone outside the group', async () => {
  await assert.rejects(save(lead, sub({ scout_id: stranger.id })), /row-level security/);
});

test('without scout_id it\'s the uploader\'s, as before', async () => {
  const s = sub();
  assert.equal(await save(scout2, s), 'saved');
  const [row] = await as(scout2, 'select scout_id, added_by from public.submissions where id = $1', [s.id]);
  assert.equal(row.scout_id, scout2.id);
  assert.equal(row.added_by, scout2.id);
});

test('added_by can\'t be faked', async () => {
  const id = crypto.randomUUID();
  await as(lead, `insert into public.submissions (id, group_id, scout_id, scout_name, config_id, config_version, "values",
    created_at, updated_at, added_by) values ($1, $2, $3, 'Maya', 'ftc-2026-biobuzz', 3, '{}', now(), now(), $3)`, [id, groupId, scout.id]);
  const [row] = await as(lead, 'select added_by from public.submissions where id = $1', [id]);
  assert.equal(row.added_by, lead.id);
});

test('a scanned edit the Lead may not make says denied (the phone stops retrying)', async () => {
  // The group doesn't let Leads edit Scouts' matches.
  await as(lead, `update public.groups set settings = '{"leadsCanEdit": false}' where id = $1`, [groupId]);
  const s = sub();
  assert.equal(await save(scout, s), 'saved');
  assert.equal(await save(lead, { ...s, scout_id: scout.id, updated_at: '2026-10-19T12:00:00Z' }), 'denied');
  // An older copy is still 'older'.
  assert.equal(await save(lead, { ...s, scout_id: scout.id, updated_at: '2026-10-19T09:00:00Z' }), 'older');
  await as(lead, `update public.groups set settings = '{}' where id = $1`, [groupId]);
});
