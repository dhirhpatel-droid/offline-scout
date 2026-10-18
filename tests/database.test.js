// Tests the database rules (supabase/migrations) without touching the real
// Supabase project: PGlite is a real Postgres that runs inside Node.
//
// Supabase's login system lives in a schema called "auth". Here we build a
// tiny stand-in for it (a users table, auth.uid(), auth.jwt()) so the
// migration runs unchanged, then "sign in" as different people by setting the
// same login claims Supabase would.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const AUTH_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema public to anon, authenticated;
`;

// People in the tests
const lead = { id: '00000000-0000-4000-8000-000000000001', email: 'lead@example.com', name: 'Dhir' };
const scout = { id: '00000000-0000-4000-8000-000000000002', email: 'maya@example.com', name: 'Maya' };
const stranger = { id: '00000000-0000-4000-8000-000000000003', email: 'sam@example.com', name: 'Sam' };

// Run SQL as a signed-in person (or as the database owner with no person).
async function as(person, sql, params = []) {
  await db.exec('reset role');
  if (person) {
    const claims = JSON.stringify({ sub: person.id, email: person.email, role: 'authenticated' });
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    await db.exec('set role authenticated');
  }
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
const rejects = (promise, pattern) => assert.rejects(promise, pattern);

let groupId;

before(async () => {
  await db.exec(AUTH_STANDIN);
  for (const file of readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort()) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  // Sign-ups (the trigger makes their profiles)
  for (const p of [lead, scout, stranger]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [p.id, p.email, JSON.stringify({ display_name: p.name })]);
  }
  [{ create_group: groupId }] = await as(lead,
    `select public.create_group('frc', 4069, 'Lo-Ellen Robotics', 'frc-2027')`);
});

test('signing up makes a profile with the name from the form', async () => {
  const [p] = await as(lead, 'select display_name from public.profiles where id = $1', [lead.id]);
  assert.equal(p.display_name, 'Dhir');
});

test('creating a group makes you its Lead', async () => {
  const rows = await as(lead, 'select role from public.memberships where group_id = $1', [groupId]);
  assert.deepEqual(rows, [{ role: 'lead' }]);
  const [g] = await as(lead, 'select program, team_number from public.groups where id = $1', [groupId]);
  assert.deepEqual(g, { program: 'FRC', team_number: 4069 });
});

test('anyone can label a group with the same Team number', async () => {
  await as(stranger, `select public.create_group('FRC', 4069, 'Another 4069 group', 'frc-2027')`);
});

test('people outside a group cannot see it, its members or its invites', async () => {
  assert.equal((await as(stranger, 'select * from public.groups where id = $1', [groupId])).length, 0);
  assert.equal((await as(stranger, 'select * from public.memberships where group_id = $1', [groupId])).length, 0);
  assert.equal((await as(stranger, 'select * from public.profiles where id = $1', [lead.id])).length, 0);
});

test('only a Lead can send an Invite', async () => {
  await rejects(as(stranger, `insert into public.invites (group_id, email, invited_by) values ($1, 'x@example.com', $2)`,
    [groupId, stranger.id]), /row-level security/);
  await as(lead, `insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)`,
    [groupId, scout.email, lead.id]);
});

test('the invited person sees their Invite; others do not', async () => {
  assert.equal((await as(scout, 'select * from public.invites')).length, 1);
  assert.equal((await as(stranger, 'select * from public.invites')).length, 0);
});

test('only the invited person can accept, and they join as a Scout', async () => {
  const [{ id }] = await as(lead, 'select id from public.invites where email = $1', [scout.email]);
  await rejects(as(stranger, 'select public.accept_invite($1)', [id]), /not for you/);
  await as(scout, 'select public.accept_invite($1)', [id]);
  const [m] = await as(scout, 'select role from public.memberships where group_id = $1 and user_id = $2', [groupId, scout.id]);
  assert.equal(m.role, 'scout');
  await rejects(as(scout, 'select public.accept_invite($1)', [id]), /already used/);
});

test('members see each other\'s names once they share a group', async () => {
  const [p] = await as(scout, 'select display_name from public.profiles where id = $1', [lead.id]);
  assert.equal(p.display_name, 'Dhir');
});

test('a Scout cannot change roles or invite people', async () => {
  const rows = await as(scout, `update public.memberships set role = 'lead' where group_id = $1 and user_id = $2 returning *`, [groupId, scout.id]);
  assert.equal(rows.length, 0, 'the update matched no rows it was allowed to change');
  await rejects(as(scout, `insert into public.invites (group_id, email, invited_by) values ($1, 'x@example.com', $2)`,
    [groupId, scout.id]), /row-level security/);
});

test('a Lead cannot move a member into another group', async () => {
  await rejects(as(lead, 'update public.memberships set group_id = gen_random_uuid() where user_id = $1', [scout.id]),
    /permission denied/);
});

test('a group always keeps at least one Lead', async () => {
  await rejects(as(lead, `update public.memberships set role = 'scout' where group_id = $1 and user_id = $2`,
    [groupId, lead.id]), /at least one Lead/);
  await rejects(as(lead, 'delete from public.memberships where group_id = $1 and user_id = $2', [groupId, lead.id]),
    /at least one Lead/);
  // With a second Lead, the first can step down.
  await as(lead, `update public.memberships set role = 'lead' where group_id = $1 and user_id = $2`, [groupId, scout.id]);
  await as(lead, `update public.memberships set role = 'scout' where group_id = $1 and user_id = $2`, [groupId, lead.id]);
  await as(scout, `update public.memberships set role = 'lead' where group_id = $1 and user_id = $2`, [groupId, lead.id]);
  await as(lead, `update public.memberships set role = 'scout' where group_id = $1 and user_id = $2`, [groupId, scout.id]);
});

test('a Scout can leave; a Lead can remove members', async () => {
  await as(lead, `insert into public.invites (group_id, email, invited_by) values ($1, $2, $3)`, [groupId, stranger.email, lead.id]);
  const [{ id }] = await as(stranger, 'select id from public.invites where email = $1', [stranger.email]);
  await as(stranger, 'select public.accept_invite($1)', [id]);
  await as(stranger, 'delete from public.memberships where group_id = $1 and user_id = $2', [groupId, stranger.id]);
  assert.equal((await as(stranger, 'select * from public.groups where id = $1', [groupId])).length, 0, 'left');
  await as(lead, 'delete from public.memberships where group_id = $1 and user_id = $2', [groupId, scout.id]);
  assert.equal((await as(scout, 'select * from public.groups where id = $1', [groupId])).length, 0, 'removed');
});

test('expired Invites cannot be accepted', async () => {
  const [{ id }] = await as(null, `insert into public.invites (group_id, email, invited_by, expires_at)
    values ($1, $2, $3, now() - interval '1 day') returning id`, [groupId, scout.email, lead.id]);
  await rejects(as(scout, 'select public.accept_invite($1)', [id]), /expired/);
});

test('people who are not signed in can do nothing', async () => {
  await db.exec('set role anon');
  try {
    await rejects(db.query('select * from public.groups'), /permission denied/);
    await rejects(db.query(`select public.create_group('FRC', 1, 'x', 'y')`), /permission denied/);
  } finally {
    await db.exec('reset role');
  }
});
