// Server function: a Lead invites someone to their Scouting group by email.
// Runs on Supabase (Deno), not in the app, because emailing a sign-up link
// needs Supabase's secret key, which must never be in the app (docs/adr/0002).
//
//   POST { groupId, email }  with the Lead's login token
//   → saves the Invite (the database checks they're a Lead of that group)
//   → if the person has no account yet, Supabase emails them a sign-up link;
//     if they already have one, they'll see the Invite next time they open the app.

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  const { groupId, email: rawEmail, redirectTo } = await req.json().catch(() => ({}));
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

  // Replace any earlier open Invite for this email, then save the new one.
  // The database refuses both unless the caller is a Lead of this group.
  await asCaller.from('invites').delete().eq('group_id', groupId).eq('email', email).is('accepted_at', null);
  const { error: insertError } = await asCaller.from('invites').insert({ group_id: groupId, email, invited_by: user.id });
  if (insertError) {
    return reply(403, { error: 'Only a Lead of this group can send invites.' });
  }

  // 2. Email a sign-up link if they don't have an account yet. This uses the
  //    secret key, which Supabase gives server functions automatically.
  const admin = createClient(url, secretKey);
  const { data: group } = await asCaller.from('groups').select('name, program, team_number').eq('id', groupId).single();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { invited_to: group ? `${group.program} ${group.team_number} · ${group.name}` : '' },
  });

  if (inviteError) {
    // Already has an account: they'll see the Invite in the app.
    if (/already|registered|exists/i.test(inviteError.message)) return reply(200, { emailed: false, hasAccount: true });
    // Saved, but the email failed (e.g. Supabase's hourly email limit).
    return reply(200, { emailed: false, hasAccount: false, emailError: inviteError.message });
  }
  return reply(200, { emailed: true, hasAccount: false });
});
