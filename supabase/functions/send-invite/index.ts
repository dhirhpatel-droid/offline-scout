// Server function: a Lead invites someone to their Scouting group by email.
// Runs on Supabase (Deno), not in the app, because emailing a sign-up link
// needs Supabase's secret key, which must never be in the app (docs/adr/0002).
//
//   POST { groupId, email }  with the Lead's login token
//   → saves the Invite (the database checks they're a Lead of that group)
//   → if the person has no account yet, Supabase emails them a sign-up link;
//     if they already have one, they'll see the Invite next time they open the app.
//   The reply is the same either way, so nobody can use invites to find out
//   which emails have an account. At most 20 invites per Lead per hour.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

// Only the app itself (and a local copy while developing) may call this.
const APP_ORIGINS = ['https://dhirhpatel-droid.github.io', 'http://localhost:8000'];
let CORS: Record<string, string> = {};
const corsFor = (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': APP_ORIGINS.includes(origin) ? origin : APP_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Where the email's link may lead: only the app.
const APP_URLS = ['https://dhirhpatel-droid.github.io/offline-scout/', 'http://localhost:8000/'];
const MAX_INVITES_PER_HOUR = 20;

Deno.serve(async (req) => {
  CORS = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  const { groupId, email: rawEmail, redirectTo: asked } = await req.json().catch(() => ({}));
  const redirectTo = APP_URLS.includes(asked) ? asked : APP_URLS[0];
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!groupId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(400, { error: 'Enter a valid email address.' });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  // Supabase gives server functions their keys as environment variables.
  // Newer projects also have them under SUPABASE_*_KEYS (JSON), so try both.
  const fromJson = (name: string) => {
    try { return Object.values(JSON.parse(Deno.env.get(name) ?? '{}'))[0] as string | undefined; } catch { return undefined; }
  };
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? fromJson('SUPABASE_PUBLISHABLE_KEYS') ?? req.headers.get('apikey') ?? '';
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? fromJson('SUPABASE_SECRET_KEYS') ?? '';

  // 1. Act as the Lead who called us, so the database rules apply to them.
  const asCaller = createClient(url, publicKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await asCaller.auth.getUser();
  if (!user) return reply(401, { error: 'Sign in again, then try once more.' });

  // Every invite can send an email through the team's Gmail: limit them.
  const admin = createClient(url, secretKey);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from('invites').select('id', { count: 'exact', head: true })
    .eq('invited_by', user.id).gt('created_at', hourAgo);
  if ((count ?? 0) >= MAX_INVITES_PER_HOUR) {
    return reply(429, { error: 'That’s a lot of invites in one hour. Wait a bit, then send the rest.' });
  }

  // Replace any earlier open Invite for this email, then save the new one.
  // The database refuses both unless the caller is a Lead of this group.
  await asCaller.from('invites').delete().eq('group_id', groupId).eq('email', email).is('accepted_at', null);
  const { error: insertError } = await asCaller.from('invites').insert({ group_id: groupId, email, invited_by: user.id });
  if (insertError) {
    return reply(403, { error: 'Only a Lead of this group can send invites.' });
  }

  // 2. Email a sign-up link if they don't have an account yet. This uses the
  //    secret key, which Supabase gives server functions automatically.
  const { data: group } = await asCaller.from('groups').select('name, program, team_number').eq('id', groupId).single();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { invited_to: group ? `${group.program} ${group.team_number} · ${group.name}` : '' },
  });

  // Already has an account (no email: the Invite waits in the app), or the
  // email failed: logged here, and the same reply as a sent one.
  if (inviteError && !/already|registered|exists/i.test(inviteError.message)) {
    console.error('invite email failed:', inviteError.message);
  }
  return reply(200, { saved: true });
});
