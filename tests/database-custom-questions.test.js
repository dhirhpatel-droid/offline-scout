// Database rules for Custom questions (supabase/migrations/*_custom_questions.sql).
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

const add = (who, fields = {}) => {
  const q = { section: 'teleop', type: 'toggle', label: 'Cycled from the far side', options: null, ...fields };
  return as(who, `insert into public.custom_questions (group_id, config_id, section, type, label, options, created_by)
    values ($1, 'ftc-2026-biobuzz', $2, $3, $4, $5, $6) returning id`, [groupId, q.section, q.type, q.label, q.options && JSON.stringify(q.options), who.id]);
};

test('a Lead adds a question; the group sees it, outsiders don\'t', async () => {
  await add(lead);
  assert.equal((await as(scout, 'select * from public.custom_questions')).length, 1);
  assert.equal((await as(stranger, 'select * from public.custom_questions')).length, 0);
});

test('Scouts can\'t add or change questions', async () => {
  await assert.rejects(add(scout), /row-level security/);
  const [{ id }] = await as(lead, 'select id from public.custom_questions limit 1');
  // A Scout's attempt to hide one matches no rows (Row Level Security).
  await as(scout, 'update public.custom_questions set hidden_at = now() where id = $1', [id]);
  const [{ hidden_at: hiddenAt }] = await as(lead, 'select hidden_at from public.custom_questions where id = $1', [id]);
  assert.equal(hiddenAt, null);
});

test('Leads hide a question instead of deleting it', async () => {
  const [{ id }] = await as(lead, 'select id from public.custom_questions limit 1');
  await as(lead, 'update public.custom_questions set hidden_at = now() where id = $1', [id]);
  await as(lead, 'delete from public.custom_questions where id = $1', [id]).catch(() => {});
  assert.equal((await as(lead, 'select * from public.custom_questions where id = $1', [id])).length, 1, 'still there');
});

test('questions must make sense', async () => {
  await assert.rejects(add(lead, { type: 'essay' }), /check/);
  await assert.rejects(add(lead, { label: '   ' }), /check/);
  await assert.rejects(add(lead, { type: 'choice', options: ['Only one'] }), /check/);
  await add(lead, { type: 'choice', options: ['Left', 'Right'] });
});

test('a question\'s wording can\'t change once asked (hide and add a new one)', async () => {
  const [{ id }] = await as(lead, `select id from public.custom_questions where type = 'choice' limit 1`);
  await assert.rejects(as(lead, `update public.custom_questions set label = 'Reworded' where id = $1`, [id]), /permission denied/);
  await as(lead, 'update public.custom_questions set position = 3 where id = $1', [id]);
});

test('every question belongs to a Game config', async () => {
  await assert.rejects(as(lead, `insert into public.custom_questions (group_id, section, type, label, created_by)
    values ($1, 'auto', 'toggle', 'No game', $2)`, [groupId, lead.id]), /null value|not-null/);
});
