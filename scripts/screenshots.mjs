// Screenshots of every screen, for design reviews: npm run screenshots
// (needs Google Chrome; writes PNGs to .impeccable/review/screens/, not in git)
//
// Uses a pretend signed-in Lead with sample matches, saved on a throwaway
// Chrome profile, so it never touches the real Supabase project. The group
// screen is captured offline, since its member list needs the server.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8124;
const DEBUG_PORT = 9366;
const APP = `http://localhost:${PORT}/`;
const OUT = new URL('../.impeccable/review/screens/', import.meta.url).pathname;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['scripts/serve.py', String(PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'scout-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let ws;
try {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    targets = await fetch(`http://localhost:${DEBUG_PORT}/json`).then((r) => r.json(), () => undefined);
  }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const run = async (code) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async (hash, wait = 900) => { await send('Page.navigate', { url: `${APP}?${Date.now()}${hash}` }); await sleep(wait); };
  const shot = async (name) => {
    await sleep(500);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    console.log('•', name);
  };
  const scheme = (value) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
  const offline = (on) => send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  for (const theme of ['dark', 'light']) {
    await scheme(theme);
    const t = (name) => `${theme}-${name}`;

    // Signed out
    await go('#auth', 600);
    await run(`localStorage.clear(); indexedDB.deleteDatabase('offline-scout'); return 1`);
    await go('#auth');
    await shot(t('01-sign-in'));
    await go('#auth/signup');
    await shot(t('02-create-account'));

    // Pretend signed-in Lead with no group yet
    await run(`
      const user = { id: '00000000-0000-4000-8000-0000000000aa', email: 'dhir@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { display_name: 'Dhir' } };
      localStorage.setItem('sb-mfjuzvfdoaqztxzencot-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 31536000, user }));
      const db = await new Promise((ok) => { const r = indexedDB.open('offline-scout', 2); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('drafts'); d.createObjectStore('settings'); d.createObjectStore('submissions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt'); }; r.onsuccess = () => ok(r.result); });
      await new Promise((ok) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ id: user.id, email: user.email, display_name: 'Dhir' }, 'profile'); tx.objectStore('settings').put([], 'groups'); tx.oncomplete = ok; });
      db.close();
      return 1`);
    await offline(true);
    await go('#groups');
    await shot(t('03-no-group'));
    await go('#groups/new');
    await shot(t('04-new-group'));

    // Now in a group, with saved matches
    await run(`
      const db = await new Promise((ok) => { const r = indexedDB.open('offline-scout'); r.onsuccess = () => ok(r.result); });
      // Scouted values give believable points (Auto LEAVE + HIVE TIPs, Teleop rows, PARK).
      const scored = (pts) => ({ 'auto.leave': pts > 0, 'auto.hiveTips': Math.floor(pts / 40), 'teleop.flower': Math.floor((pts % 40) / 4), 'end.park': pts > 30,
        'post.driverSkill': pts > 50 ? 4 : pts > 20 ? 3 : 2, 'post.notes': pts > 60 ? 'Fast cycles, scores high CELLs' : pts === 0 ? 'Stopped moving after Auto' : '' });
      const mk = (match, team, position, pts, mins, scout = 'Dhir') => ({ id: crypto.randomUUID(), configId: 'ftc-2026-biobuzz', configVersion: 4, event: 'Sudbury Qualifier',
        eventId: 'ev1', groupId: 'g1',
        values: { 'pre.scout': scout, 'pre.level': 'qual', 'pre.match': match, 'pre.team': team, 'pre.position': position, ...scored(pts) },
        summary: { scout, level: 'qual', match, team, position, alliance: position.replace(/\\d/, '') }, estimatedPoints: pts,
        createdAt: new Date(Date.now() - mins * 60000).toISOString(), updatedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), syncedAt: null });
      await new Promise((ok) => { const tx = db.transaction(['settings', 'submissions'], 'readwrite'); const s = tx.objectStore('settings');
        // A pretend Current event with a small schedule (Q14–Q20).
        const ev = { id: 'ev1', program: 'FTC', season: 2026, code: 'CAONSUQ', name: 'Sudbury Qualifier', starts_on: '2026-11-21', ends_on: '2026-11-21', city: 'Sudbury, ON' };
        const teams = [23810, 16012, 19455, 21229, 16415, 14515, 22309, 24436, 30420, 25049].map((n) => ({ team_number: n, team_name: 'Team ' + n }));
        const at = (q) => new Date(Date.UTC(2026, 10, 21, 14, 0 + q * 7)).toISOString();
        const matches = [14, 15, 16, 17, 18, 19, 20].map((q, i) => ({ level: 'qual', number: q, game: 1, scheduled_at: at(q),
          red: [teams[i % 10].team_number, teams[(i + 1) % 10].team_number], blue: [teams[(i + 2) % 10].team_number, teams[(i + 3) % 10].team_number], played: q < 18,
          red_score: q < 18 ? 60 + q * 3 : null, blue_score: q < 18 ? 140 - q * 4 : null }));
        matches[4].red = [16415, 23810]; // Q18 Red 2 = 23810
        s.put({ event: ev, teams, matches, savedAt: new Date(Date.now() - 4 * 60000).toISOString() }, 'event:ev1');
        s.put([{ id: 'g1', program: 'FTC', team_number: 16415, name: 'Lo-Ellen EDIT', role: 'lead', game_config_id: 'ftc-2026-biobuzz', settings: { qrBackup: true }, currentEvent: ev }], 'groups');
        s.put('g1', 'currentGroupId'); s.put('Northern Ontario Qualifier', 'eventName');
        // A pretend plan: Dhir watches Red 1 for Q18–Q20 and follows 23810; Maya has Blue 1.
        const dhir = '00000000-0000-4000-8000-0000000000aa', maya = '00000000-0000-4000-8000-0000000000bb';
        s.put({ shifts: [{ id: 's1', scout_id: dhir, position: 'red1', from_match: 18, to_match: 20 }, { id: 's2', scout_id: maya, position: 'blue1', from_match: 14, to_match: 20 }],
          watches: [{ id: 'w1', scout_id: dhir, team_number: 23810 }], savedAt: new Date().toISOString() }, 'plan:g1:ev1');
        // Two announcements from another Lead (unread on this phone).
        s.put([{ id: 'n2', body: 'Lunch is at 12:30 by the pit entrance. Q19 and Q20 scouts eat after your match.', created_by: '00000000-0000-4000-8000-0000000000cc', author_name: 'Coach Sam', created_at: new Date(Date.now() - 6 * 60000).toISOString() },
          { id: 'n1', body: 'Switch to Red 2 after lunch.', created_by: '00000000-0000-4000-8000-0000000000cc', author_name: 'Coach Sam', created_at: new Date(Date.now() - 90 * 60000).toISOString() }], 'announcements:g1');
        // Two Custom questions (Milestone 7).
        s.put([{ id: 'q1', config_id: 'ftc-2026-biobuzz', section: 'teleop', type: 'choice', label: 'Scored from', options: ['Near side', 'Far side'], position: 0, created_at: '2026-10-19', hidden_at: null },
          { id: 'q2', config_id: 'ftc-2026-biobuzz', section: 'post', type: 'toggle', label: 'Helped their partner', options: null, position: 0, created_at: '2026-10-19', hidden_at: null }], 'questions:g1');
        s.put([{ user_id: dhir, role: 'lead', display_name: 'Dhir' }, { user_id: maya, role: 'scout', display_name: 'Maya' }, { user_id: '00000000-0000-4000-8000-0000000000cc', role: 'lead', display_name: 'Coach Sam' }], 'members:g1');
        const sub = tx.objectStore('submissions');
        [[14, 23810, 'red1', 51, 40], [15, 16012, 'red1', 34, 30], [16, 19455, 'blue2', 72, 20], [17, 21229, 'red1', 0, 10]].forEach((a) => sub.put(mk(...a)));
        // Maya's matches (synced from her phone), so the Teams table has a spread.
        [[14, 23810, 'red1', 91, 39], [14, 21229, 'blue2', 44, 41], [15, 16415, 'blue2', 66, 31], [16, 14515, 'blue1', 28, 21], [17, 22309, 'blue2', 81, 11], [16, 23810, 'blue1', 58, 22]]
          .forEach((a) => sub.put({ ...mk(...a, 'Maya'), scoutId: '00000000-0000-4000-8000-0000000000bb' }));
        tx.oncomplete = ok; });
      db.close();
      return 1`);
    await go('#home');
    await shot(t('05-home'));
    await go('#saved');
    await shot(t('08-saved'));
    await go('#qr');
    await run(`document.querySelector('.qr-controls .pill:nth-child(2)')?.click(); return 1`); // pause on the first code
    await shot(t('24-show-qr'));
    await go('#scan');
    await shot(t('25-scan'));
    await go('#announcements');
    await shot(t('23-news'));
    await go('#checks');
    await shot(t('21-checks'));
    await go('#questions');
    await shot(t('22-questions'));
    await go('#teams');
    await shot(t('19-teams'));
    await go('#team/23810');
    await shot(t('20-team'));
    await go('#assign');
    await shot(t('16-assign'));
    // With "signal" (pretend: the real server can't be reached from here, so
    // the member refresh fails quietly and its message is cleared).
    await run(`Object.defineProperty(navigator, 'onLine', { get: () => true }); window.dispatchEvent(new HashChangeEvent('hashchange')); return 1`);
    await sleep(900);
    await run(`document.querySelectorAll('.form-message').forEach((m) => { m.hidden = true; }); document.querySelectorAll('.assign-member .pill')[1].click(); [...document.querySelectorAll('.position-grid button')].find((b) => b.textContent === 'Blue 2').click(); return 1`);
    await shot(t('17-assign-add'));
    await run(`document.querySelector('.can-fill')?.closest('button').click(); return 1`);
    await shot(t('17b-assign-fill'));
    await run(`document.querySelector('dialog')?.remove(); return 1`);
    // Start the assigned match (two Teams in Q18), then come back home.
    await go('#home');
    await run(`document.querySelector('.now-go').click(); return 1`);
    await sleep(1200);
    await shot(t('18-match-two-teams'));
    await run(`indexedDB.open('offline-scout').onsuccess = (e) => { const tx = e.target.result.transaction('drafts', 'readwrite'); tx.objectStore('drafts').clear(); }; return 1`);
    await sleep(300);
    // Start a match, type one thing, leave: it's now an unfinished match.
    await go('#match', 1200);
    await run(`const i = [...document.querySelectorAll('input')].find((x) => x.labels[0]?.textContent === 'Match number'); i.value = '18'; i.dispatchEvent(new Event('input')); return 1`);
    await sleep(300);
    await go('#home');
    await shot(t('05b-home-unfinished'));
    await go('#saved');
    await shot(t('08b-saved-with-bar'));
    await go('#group');
    await shot(t('06-group-offline'));
    await go('#settings');
    await shot(t('07-settings'));
    await go('#event');
    await shot(t('07b-event'));

    // A match in progress
    await go('#match', 1200);
    await shot(t('09-match-pre-empty'));
    // One tap on the line-up picks the team and its station.
    await run(`document.querySelectorAll('.lineup-team.pick')[1].click(); return 1`);
    await shot(t('09b-match-picked'));
    await run(`
      const type = (label, value) => { const i = [...document.querySelectorAll('input')].find((x) => x.labels[0]?.textContent === label); i.value = value; i.dispatchEvent(new Event('input')); };
      type('Match number', '18');
      [...document.querySelectorAll('.position-grid button')].find((b) => b.textContent === 'Red 2').click();
      return 1`);
    await shot(t('10-match-pre'));
    await run(`document.querySelector('#tab-auto').click(); document.querySelector('.field.tile').click(); document.querySelector('.round.add').click(); return 1`);
    await sleep(600);
    await shot(t('11-match-auto'));
    await run(`document.querySelector('#tab-teleop').click(); const a = [...document.querySelectorAll('.round.add')]; a[1].click(); a[1].click(); a[1].click(); a[3].click(); return 1`);
    await sleep(600);
    await shot(t('12-match-teleop'));
    await run(`document.querySelector('#tab-end').click(); [...document.querySelectorAll('.field.tile')].at(-1).click(); return 1`);
    await shot(t('13-match-endgame'));
    await run(`document.querySelector('#tab-post').click(); [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Good').click(); return 1`);
    await shot(t('14-match-after'));
    await run(`[...document.querySelectorAll('.bottombar .pill')].at(-1).click(); return 1`);
    await shot(t('15-match-saved'));
    await offline(false);
  }
  console.log(`\nScreenshots in ${OUT}`);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
