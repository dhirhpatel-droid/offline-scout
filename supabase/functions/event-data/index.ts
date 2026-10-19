// Server function: Events from FIRST (docs/adr/0003).
//
//   POST { action: 'search', program, season, text }  → { events: [...] }
//   POST { action: 'import', program, season, code }  → { eventId }
//
// "import" fetches the event, its teams and its schedule from FTCScout and
// saves them in the shared tables (events, event_teams, event_matches). It
// does this at most once every 5 minutes per event, so a whole group's
// phones asking at once costs FTCScout one request. Only this function can
// write those tables (it uses the secret key Supabase gives it).
//
// FRC: not yet. It needs the FRC 2027 game and an FRC data source (a key).

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { FTCSCOUT_URL, SEARCH_QUERY, eventQuery, toRows, toMatchRow, toSearchResult } from './ftcscout.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const REFRESH_AFTER_MS = 5 * 60 * 1000;

async function ftcscout(query: string, variables: Record<string, unknown>) {
  const res = await fetch(FTCSCOUT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'FTCScout error');
  return json.data;
}

// Which scores type FTCScout has for this season (e.g. MatchScores2026), if any.
async function scoresTypeFor(season: number) {
  const data = await ftcscout('{ __type(name: "MatchScores") { possibleTypes { name } } }', {});
  const names = (data.__type?.possibleTypes ?? []).map((t: { name: string }) => t.name);
  return names.includes(`MatchScores${season}`) ? `MatchScores${season}` : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  const fromJson = (name: string) => {
    try { return Object.values(JSON.parse(Deno.env.get(name) ?? '{}'))[0] as string | undefined; } catch { return undefined; }
  };
  const url = Deno.env.get('SUPABASE_URL')!;
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? fromJson('SUPABASE_PUBLISHABLE_KEYS') ?? req.headers.get('apikey') ?? '';
  const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? fromJson('SUPABASE_SECRET_KEYS') ?? '';

  // Signed-in people only.
  const asCaller = createClient(url, publicKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await asCaller.auth.getUser();
  if (!user) return reply(401, { error: 'Sign in again, then try once more.' });

  const body = await req.json().catch(() => ({}));
  const program = String(body.program ?? 'FTC').toUpperCase();
  const season = Number(body.season);
  if (program !== 'FTC') return reply(400, { error: 'FRC events arrive with the FRC game, after kickoff.' });
  if (!Number.isInteger(season)) return reply(400, { error: 'Missing season.' });

  try {
    if (body.action === 'search') {
      const text = String(body.text ?? '').trim();
      const data = await ftcscout(SEARCH_QUERY, { season, text: text || null });
      return reply(200, { events: (data.eventsSearch ?? []).map(toSearchResult) });
    }

    if (body.action === 'import') {
      const code = String(body.code ?? '').trim().toUpperCase();
      if (!code) return reply(400, { error: 'Missing event code.' });
      const admin = createClient(url, secretKey);

      // Fresh enough? Then don't ask FTCScout again.
      const { data: existing } = await admin.from('events').select('id, fetched_at')
        .eq('program', program).eq('season', season).eq('code', code).maybeSingle();
      if (existing?.fetched_at && Date.now() - new Date(existing.fetched_at).getTime() < REFRESH_AFTER_MS) {
        return reply(200, { eventId: existing.id, fresh: false });
      }

      const data = await ftcscout(eventQuery(await scoresTypeFor(season)), { season, code });
      if (!data.eventByCode) return reply(404, { error: `No FTC event ${code} in the ${season}–${(season + 1) % 100} season.` });
      const { event, teams, matches } = toRows(data.eventByCode, { season });

      const { data: saved, error: eventError } = await admin.from('events')
        .upsert({ ...event, fetched_at: new Date().toISOString() }, { onConflict: 'program,season,code' })
        .select('id').single();
      if (eventError) throw eventError;
      const eventId = saved.id;

      if (teams.length) {
        const { error } = await admin.from('event_teams')
          .upsert(teams.map((t) => ({ ...t, event_id: eventId })), { onConflict: 'event_id,team_number' });
        if (error) throw error;
      }
      const rows = matches.map((m: unknown) => toMatchRow(m, eventId));
      if (rows.length) {
        const { error } = await admin.from('event_matches').upsert(rows, { onConflict: 'event_id,level,number,game' });
        if (error) throw error;
      }
      return reply(200, { eventId, fresh: true, teams: teams.length, matches: rows.length });
    }

    return reply(400, { error: 'Unknown action.' });
  } catch (err) {
    return reply(502, { error: `Couldn’t get event data right now (${(err as Error).message}). Try again soon.` });
  }
});
