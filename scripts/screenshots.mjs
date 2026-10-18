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
      const mk = (match, team, position, pts, mins) => ({ id: crypto.randomUUID(), configId: 'ftc-2026-biobuzz', configVersion: 2, event: 'Northern Ontario Qualifier',
        values: { 'pre.scout': 'Dhir', 'pre.level': 'qual', 'pre.match': match, 'pre.team': team, 'pre.position': position },
        summary: { scout: 'Dhir', level: 'qual', match, team, position, alliance: position.replace(/\\d/, '') }, estimatedPoints: pts,
        createdAt: new Date(Date.now() - mins * 60000).toISOString(), updatedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), syncedAt: null });
      await new Promise((ok) => { const tx = db.transaction(['settings', 'submissions'], 'readwrite'); const s = tx.objectStore('settings');
        s.put([{ id: 'g1', program: 'FRC', team_number: 4069, name: 'Lo-Ellen Robotics', role: 'lead', game_config_id: 'ftc-2026-biobuzz', settings: {} }], 'groups');
        s.put('g1', 'currentGroupId'); s.put('Northern Ontario Qualifier', 'eventName');
        const sub = tx.objectStore('submissions');
        [[14, 23810, 'red1', 51, 40], [15, 16012, 'red1', 34, 30], [16, 19455, 'blue2', 72, 20], [17, 21229, 'red1', 0, 10]].forEach((a) => sub.put(mk(...a)));
        tx.oncomplete = ok; });
      db.close();
      return 1`);
    await go('#home');
    await shot(t('05-home'));
    await go('#match', 1200);
    await go('#home');
    await shot(t('05b-home-unfinished'));
    await go('#saved');
    await shot(t('08b-saved-with-bar'));
    await go('#group');
    await shot(t('06-group-offline'));
    await go('#settings');
    await shot(t('07-settings'));
    await go('#saved');
    await shot(t('08-saved'));

    // A match in progress
    await go('#match', 1200);
    await shot(t('09-match-pre-empty'));
    await run(`
      const type = (label, value) => { const i = [...document.querySelectorAll('input')].find((x) => x.labels[0]?.textContent === label); i.value = value; i.dispatchEvent(new Event('input')); };
      type('Match number', '18'); type('Team number', '23810');
      [...document.querySelectorAll('.position-grid button')].find((b) => b.textContent === 'Red 2').click();
      return 1`);
    await shot(t('10-match-pre'));
    await run(`document.querySelector('#tab-auto').click(); document.querySelector('.field.tile').click(); document.querySelector('.round.add').click(); return 1`);
    await sleep(600);
    await shot(t('11-match-auto'));
    await run(`document.querySelector('#tab-teleop').click(); const a = [...document.querySelectorAll('.round.add')]; a[1].click(); a[1].click(); a[1].click(); a[3].click(); return 1`);
    await sleep(600);
    await shot(t('12-match-teleop'));
    await run(`window.scrollTo(0, document.body.scrollHeight); [...document.querySelectorAll('.field.tile')].at(-1).click(); return 1`);
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
