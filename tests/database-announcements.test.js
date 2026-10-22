// Database rules for Announcements (supabase/migrations/*_announcements.sql).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase, person } from './helpers/database.js';

const lead = person(1, 'Dhir');
const scout = person(2, 'Maya');
const stranger = person(3, 'Zoe');
let as;
let groupId;

before(async () => {
  const d = await freshDatabase();
  as = d.as;
  for (const p of [lead, scout, stranger]) await d.signUp(p);
  [{ create_group: groupId }] = await as(lead, `select public.create_group('FTC', 16415, 'Lo-Ellen EDIT', 'ftc-2026-biobuzz')`);
  await as(lead, 'insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)', [groupId, scout.email, lead.id]);
  const [{ id }] = await as(scout, 'select id from public.invites where email = $1', [scout.email]);
  await as(scout, 'select public.accept_invite($1)', [id]);
});

const post = (who, body = 'Switch to Red 2 after lunch') => as(who,
  `insert into public.announcements (group_id, body, created_by, author_name) values ($1, $2, $3, 'x') returning id`,
  [groupId, body, who.id]);

test('a Lead posts; the group reads it; outsiders don\'t', async () => {
  await post(lead);
  assert.equal((await as(scout, 'select * from public.announcements')).length, 1);
  assert.equal((await as(stranger, 'select * from public.announcements')).length, 0);
});

test('Scouts can\'t post or remove', async () => {
  await assert.rejects(post(scout), /row-level security/);
  const [{ id }] = await as(lead, 'select id from public.announcements limit 1');
  await as(scout, 'delete from public.announcements where id = $1', [id]);
  assert.equal((await as(lead, 'select * from public.announcements where id = $1', [id])).length, 1);
});

test('a Lead removes one', async () => {
  const [{ id }] = await post(lead, 'Lunch at 12');
  await as(lead, 'delete from public.announcements where id = $1', [id]);
  assert.equal((await as(lead, 'select * from public.announcements where id = $1', [id])).length, 0);
});

test('messages must have words and stay short', async () => {
  await assert.rejects(post(lead, '   '), /check/);
  await assert.rejects(post(lead, 'x'.repeat(281)), /check/);
});

// (Signed-out access is checked against the real database with curl: no grant to anon.)
