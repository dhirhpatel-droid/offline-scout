// Shared by the database tests: a real Postgres (PGlite) inside Node, with a
// tiny stand-in for Supabase's login system, and every migration applied.
// Nothing here touches the real Supabase project.

import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const AUTH_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema public to anon, authenticated, service_role;
`;

export async function freshDatabase() {
  const db = new PGlite();
  await db.exec(AUTH_STANDIN);
  for (const file of readdirSync(new URL('../../supabase/migrations/', import.meta.url)).sort()) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }

  // Sign up a person (the trigger makes their profile).
  async function signUp(p) {
    await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)',
      [p.id, p.email, JSON.stringify({ display_name: p.name })]);
  }

  // Run SQL as a signed-in person, as 'service' (what server functions use),
  // or as the database owner when person is null.
  async function as(person, sql, params = []) {
    await db.exec('reset role');
    if (person === 'service') {
      await db.exec('set role service_role');
    } else if (person) {
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

  return { db, signUp, as };
}

export const person = (n, name) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, email: `${name.toLowerCase()}@example.com`, name,
});
