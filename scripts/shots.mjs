// Screenshots of every screen at phone size:  npm run shots
//
//   npm run shots                      every screen, dark and light, 390px wide
//   npm run shots -- teams             only screens whose name contains "teams"
//   npm run shots -- teams light       ... in one theme
//   npm run shots -- all dark 360      a narrower phone (360px)
//
// Pictures land in .impeccable/review/screens/ (git-ignored), named
// <theme>-<width>-<nn>-<screen>.png. Look at them after every UI change.
//
// How it works: starts its own web server and a headless Chrome, and drives
// Chrome through the DevTools Protocol (like scripts/offline-test.mjs). The
// app needs a signed-in person, and a test can't make real accounts, so it
// saves a pretend login, group, event and matches on this "phone". Requests
// to Supabase are blocked, so the pretend login never reaches the real project.
//
// Every step has a time limit, so a problem ends with a message, never a hang.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [only = 'all', onlyTheme = '', widthArg = '390'] = process.argv.slice(2);
const WIDTH = Number(widthArg) || 390;
const PORT = 8137;
const DEBUG_PORT = 9377;
const APP = `http://localhost:${PORT}/`;
const OUT = '.impeccable/review/screens';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const STEP_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (promise, what) => Promise.race([
  promise,
  sleep(STEP_MS).then(() => { throw new Error(`Timed out: ${what}`); }),
]);

mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['scripts/serve.py', String(PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'scout-shots-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let ws;
const stop = async () => {
  ws?.close();
  chrome.kill();
  server.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
};
process.on('SIGINT', async () => { await stop(); process.exit(130); });

// ---- the pretend phone: who is signed in and what they have saved ----
// Runs inside the page. Every database request can fail or be blocked, and
// says so, so nothing waits for ever.
const SEED = `
  const req = (r) => new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error ?? new Error('database request failed'));
    r.onblocked = () => fail(new Error('database blocked'));
  });
  const me = '00000000-0000-4000-8000-0000000000aa';
  const maya = '00000000-0000-4000-8000-0000000000bb';
  const sam = '00000000-0000-4000-8000-0000000000cc';
  const user = { id: me, email: 'dhir@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { display_name: 'Dhir' } };
  localStorage.setItem('sb-mfjuzvfdoaqztxzencot-auth-token', JSON.stringify({
    access_token: 'shots', refresh_token: 'shots', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 365 * 86400, user,
  }));
  const db = await req(indexedDB.open('offline-scout'));
  const ev = { id: 'ev1', program: 'FTC', season: 2026, code: 'CAONSUQ', name: 'Sudbury Qualifier', starts_on: '2026-11-21', ends_on: '2026-11-21', city: 'Sudbury, ON' };
  const numbers = [23810, 16012, 19455, 21229, 16415, 14515, 22309, 24436, 30420, 25049];
  const teams = numbers.map((n) => ({ team_number: n, team_name: 'Team ' + n }));
  const at = (q) => new Date(Date.UTC(2026, 10, 21, 14, q * 7)).toISOString();
  const matches = Array.from({ length: 14 }, (_, i) => {
    const q = i + 11;
    const played = q < 18;
    return { level: 'qual', number: q, game: 1, scheduled_at: at(q), played,
      red: [numbers[i % 10], numbers[(i + 1) % 10]], blue: [numbers[(i + 2) % 10], numbers[(i + 3) % 10]],
      red_score: played ? 60 + q * 3 : null, blue_score: played ? 140 - q * 4 : null };
  });
  // Values that give believable points with the BIOBUZZ config (v7).
  const scored = (pts) => ({
    'auto.leave': pts > 0, 'auto.hiveTips': Math.floor(pts / 40), 'end.flower': Math.floor((pts % 40) / 4), 'end.park': pts > 30,
    'post.driverSkill': pts > 50 ? 4 : pts > 20 ? 3 : 2,
    'post.notes': pts > 60 ? 'Fast cycles, scores high CELLs' : pts === 0 ? 'Stopped moving after Auto' : '',
  });
  const mk = (match, team, position, pts, mins, scout = 'Dhir', scoutId = me, sent = false) => {
    const now = new Date(Date.now() - mins * 60000).toISOString();
    return { id: crypto.randomUUID(), configId: 'ftc-2026-biobuzz', configVersion: 7, event: ev.name, eventId: ev.id, groupId: 'g1', scoutId,
      values: { 'pre.scout': scout, 'pre.level': 'qual', 'pre.match': match, 'pre.team': team, 'pre.position': position, ...scored(pts) },
      summary: { scout, level: 'qual', match, team, position, alliance: position.replace(/\\d/, '') }, estimatedPoints: pts,
      createdAt: now, updatedAt: now, submittedAt: now, syncedAt: sent ? now : null };
  };
  const tx = db.transaction(['settings', 'submissions', 'drafts'], 'readwrite');
  const done = new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); });
  const s = tx.objectStore('settings');
  s.put({ id: me, email: user.email, display_name: 'Dhir' }, 'profile');
  s.put([{ id: 'g1', program: 'FTC', team_number: 16415, name: 'Lo-Ellen Black', role: 'lead', game_config_id: 'ftc-2026-biobuzz',
    settings: { qrBackup: true }, currentEvent: ev }], 'groups');
  s.put('g1', 'currentGroupId');
  s.put(true, 'installTipHidden');
  s.put({ event: ev, teams, matches, savedAt: new Date(Date.now() - 4 * 60000).toISOString() }, 'event:ev1');
  s.put({ shifts: [{ id: 's1', scout_id: me, position: 'red1', from_match: 18, to_match: 21 }, { id: 's2', scout_id: maya, position: 'blue1', from_match: 14, to_match: 24 }],
    watches: [{ id: 'w1', scout_id: me, team_number: 23810 }], savedAt: new Date().toISOString() }, 'plan:g1:ev1');
  s.put([{ user_id: me, role: 'lead', display_name: 'Dhir' }, { user_id: maya, role: 'scout', display_name: 'Maya' }, { user_id: sam, role: 'lead', display_name: 'Coach Sam' }], 'members:g1');
  s.put([{ id: 'n2', body: 'Lunch is at 12:30 by the pit entrance. Q19 and Q20 scouts eat after your match.', created_by: sam, author_name: 'Coach Sam', created_at: new Date(Date.now() - 6 * 60000).toISOString() },
    { id: 'n1', body: 'Switch to Red 2 after lunch.', created_by: sam, author_name: 'Coach Sam', created_at: new Date(Date.now() - 90 * 60000).toISOString() }], 'announcements:g1');
  s.put([{ id: '1f2e3d4c-0000-4000-8000-000000000001', config_id: 'ftc-2026-biobuzz', section: 'teleop', type: 'choice', label: 'Scored from', options: ['Near side', 'Far side'], position: 0, created_at: '2026-10-19', hidden_at: null },
    { id: '1f2e3d4c-0000-4000-8000-000000000002', config_id: 'ftc-2026-biobuzz', section: 'post', type: 'toggle', label: 'Helped their partner', options: null, position: 0, created_at: '2026-10-19', hidden_at: null }], 'questions:g1');
  s.put(new Date(Date.now() - 4 * 60000).toISOString(), 'lastSyncAt');
  const sub = tx.objectStore('submissions');
  sub.clear();
  tx.objectStore('drafts').clear();
  [[14, 23810, 'red1', 51, 40, true], [15, 16012, 'red1', 34, 30, true], [16, 19455, 'blue2', 72, 20], [17, 21229, 'red1', 0, 10]]
    .forEach(([m, t, p, pts, mins, sent]) => sub.put(mk(m, t, p, pts, mins, 'Dhir', me, sent)));
  [[14, 23810, 'red1', 91, 39], [14, 21229, 'blue2', 44, 41], [15, 16415, 'blue2', 66, 31], [16, 14515, 'blue1', 28, 21], [17, 22309, 'blue2', 81, 11], [16, 23810, 'blue1', 58, 22]]
    .forEach(([m, t, p, pts, mins]) => sub.put(mk(m, t, p, pts, mins, 'Maya', maya, true)));
  await done;
  db.close();
  return true;
`;

// ---- the screens: [name, #address, things to do before the picture] ----
const click = (selector) => `document.querySelector(${JSON.stringify(selector)})?.click();`;
const SIGNED_OUT = [
  ['sign-in', '#auth'],
  ['create-account', '#auth/signup'],
  ['forgot-password', '#auth/forgot'],
];
const SIGNED_IN = [
  ['home', '#home'],
  ['matches', '#saved'],
  ['matches-everyone', '#saved/everyone'],
  ['teams', '#teams'],
  ['team', '#team/23810'],
  ['data-checks', '#checks'],
  ['plan', '#assign'],
  ['group', '#group'],
  ['group-settings', '#group/settings'],
  ['event', '#event'],
  ['questions', '#questions'],
  ['announcements', '#announcements'],
  ['show-qr', '#qr', click('.qr-controls .pill:nth-child(2)')],
  ['scan', '#scan'],
  ['settings', '#settings'],
  ['groups', '#groups'],
  ['new-group', '#groups/new'],
  // A planned match, tab by tab (started from Home's big button), then saved.
  ['match-setup', '#home', `${click('.now-go')} await new Promise((r) => setTimeout(r, 900)); ${click('#tab-pre')}`],
  ['match-auto', null, `${click('#tab-auto')} ${click('.round.add')}`],
  ['match-teleop', null, `${click('#tab-teleop')} ${click('.round.add')}`],
  ['match-endgame', null, `${click('#tab-end')} ${click('.round.add')}`],
  ['match-after', null, click('#tab-post')],
  ['match-saved', null, `[...document.querySelectorAll('.bottombar .pill')].at(-1)?.click();`],
  ['home-after-match', '#home'],
];

let count = 0;
try {
  // Wait for Chrome to start listening.
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(250);
    targets = await fetch(`http://localhost:${DEBUG_PORT}/json`).then((r) => r.json(), () => undefined);
  }
  if (!targets) throw new Error('Chrome did not start');
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await within(new Promise((r) => ws.addEventListener('open', r, { once: true })), 'connecting to Chrome');

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) => within(new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  }), method);
  // Runs code in the page and returns the result.
  const run = async (code) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const waitFor = async (code, what) => {
    for (let i = 0; i < STEP_MS / 200; i++) {
      if (await run(code).catch(() => false)) return;
      await sleep(200);
    }
    throw new Error(`Timed out waiting for ${what}`);
  };
  const size = (height) => send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height, deviceScaleFactor: 2, mobile: true });
  // Opens an address and waits until the app has drawn a screen (and fonts).
  const go = async (hash) => {
    // (Setting the address it's already on doesn't redraw, so ask for that.)
    await run(`document.querySelector('#app').replaceChildren();
      if (location.hash === ${JSON.stringify(hash)}) window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = ${JSON.stringify(hash)};
      return true`);
    await waitFor(`return Boolean(document.querySelector('#app > .screen, #app > div'))`, `the screen at ${hash}`);
    await run('await document.fonts.ready; return true');
    await sleep(250);
  };
  const shot = async (theme, name) => {
    // The whole page in one picture: make the "phone" as tall as the page.
    await size(844);
    const height = Math.min(4000, Math.max(844, await run('return Math.ceil(document.documentElement.scrollHeight)')));
    await size(height);
    await sleep(150);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    count += 1;
    const file = `${OUT}/${theme}-${WIDTH}-${String(count).padStart(2, '0')}-${name}.png`;
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`• ${file}`);
  };
  const wanted = (name) => only === 'all' || name.includes(only);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await size(844);

  for (const theme of ['dark', 'light']) {
    if (onlyTheme && onlyTheme !== theme) continue;
    count = 0;
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });

    // Signed out: a clean phone.
    await send('Page.navigate', { url: `${APP}#auth` });
    await waitFor(`return Boolean(document.querySelector('#app > .screen'))`, 'the app to start');
    await run(`localStorage.clear(); return true`);
    for (const [name, hash] of SIGNED_OUT) {
      if (!wanted(name)) { count += 1; continue; }
      await go(hash);
      await shot(theme, name);
    }

    // Signed in: seed once the app has made its database (version 2).
    await waitFor(`return (await indexedDB.databases()).some((d) => d.name === 'offline-scout' && d.version >= 2)`, 'the app database');
    await run(SEED);
    await send('Page.navigate', { url: `${APP}?seeded#home` });
    await waitFor(`return Boolean(document.querySelector('#app > .screen'))`, 'Home after seeding');
    for (const [name, hash, before] of SIGNED_IN) {
      // Match steps build on each other, so they always run; others can be skipped.
      const isMatchStep = name.startsWith('match-') || name === 'home-after-match';
      if (!wanted(name) && !(isMatchStep && (only === 'all' || 'match'.includes(only) || only.startsWith('match')))) { count += 1; continue; }
      if (hash) await go(hash);
      if (before) { await run(`${before} return true`); await sleep(500); }
      if (wanted(name)) await shot(theme, name); else count += 1;
    }
  }
  console.log(`\nDone: pictures are in ${OUT}`);
} catch (err) {
  console.error(`\nFAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  await stop();
}
