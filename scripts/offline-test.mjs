// Real offline test: npm run test:offline   (needs Google Chrome installed)
//
// Does what a scout would do with airplane mode on:
//   1. open the app once while "online" (the service worker caches it)
//   2. shut the web server down — now nothing can come from the network
//   3. reload the app, scout a match, save it
//   4. reload again and check the match is still in Saved matches
//
// Chrome is driven through the DevTools Protocol (the same thing Chrome's
// developer tools use) over a WebSocket. Node 22+ has WebSocket built in.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8123;
const DEBUG_PORT = 9333;
const APP = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log(`• ${msg}`);

// ---- start the web server and Chrome ----
let server = spawn('python3', ['scripts/serve.py', String(PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'scout-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  // Wait for Chrome to start listening (can take a few seconds).
  let targets;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    targets = await fetch(`http://localhost:${DEBUG_PORT}/json`).then((r) => r.json(), () => undefined);
  }
  if (!targets) throw new Error('Chrome did not start');
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  // Runs code in the page and returns the result.
  const run = async (code) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const load = async (url) => {
    await send('Page.navigate', { url });
    await sleep(1500);
  };
  const waitFor = async (code, what) => {
    for (let i = 0; i < 40; i++) {
      if (await run(code)) return;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${what}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  // ---- 1. first visit, online ----
  step('Opening the app online (first visit)');
  await load(APP);
  await waitFor('await navigator.serviceWorker.ready; return true', 'service worker');
  await load(APP); // second load: now the service worker controls the page
  const cached = await run(`const c = await caches.open((await caches.keys())[0]); return (await c.keys()).length`);
  step(`Service worker active, ${cached} files cached`);

  // ---- 2. go offline: stop the server ----
  server.kill();
  await sleep(500);
  const reachable = await fetch(APP).then(() => true, () => false);
  if (reachable) throw new Error('Server is still running');
  step('Server stopped — the network is gone (like airplane mode)');

  // ---- 3. reload and scout a match ----
  await load(`${APP}?offline-reload#match`);
  await waitFor(`return !!document.querySelector('#tab-pre')`, 'match screen to load offline');
  step('App opened with no network');

  await run(`
    const type = (label, value) => {
      const input = [...document.querySelectorAll('input')].find((i) => i.labels[0]?.textContent === label);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('Scout name', 'Offline Test');
    type('Match number', '42');
    type('Team number', '4069');
    [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Blue').click();
    document.querySelector('#tab-auto').click();
    document.querySelector('.round.add').click();
    document.querySelector('.round.add').click();
    document.querySelector('#tab-post').click();
  `);
  await sleep(300);
  await run(`[...document.querySelectorAll('.bottombar .pill')].at(-1).click()`);
  await waitFor(`return document.querySelector('.done h2')?.textContent === 'Match 42 saved'`, 'save confirmation');
  step('Scouted and saved match 42 offline');

  // ---- 4. reload, still offline, and check it is there ----
  await load(`${APP}?second-reload#saved`);
  await waitFor(`return document.querySelectorAll('.entry').length > 0`, 'saved list');
  const first = await run(`return document.querySelector('.entry').getAttribute('aria-label')`);
  if (!first.includes('Match 42') || !first.includes('team 4069') || !first.includes('40 estimated points')) {
    throw new Error(`Unexpected saved entry: ${first}`);
  }
  step(`After reloading offline, Saved matches shows: "${first}"`);
  console.log('\nPASS: the app works with no network and keeps data across reloads.');
} catch (err) {
  console.error(`\nFAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
