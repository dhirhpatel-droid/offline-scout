// QR backup (docs/adr/0004), a Group setting (qrBackup), off by default.
//   #qr    – a Scout shows their matches, one QR code at a time
//   #scan  – a Lead scans them with the camera; they're saved on the Lead's
//            phone and uploaded (as the Scout's) when it has signal
// Both work with no signal at all: that's the point.

import { backHref } from '../nav.js';
import { h, icon, buzz, keepScreenOn, topbar } from '../ui.js';
import { currentGroup, currentUser } from '../account.js';
import { isLead } from '../group-rules.js';
import { listSubmissions, getSubmission, putSubmission } from '../db.js';
import { needsSync, matchCode, positionLabel } from '../submissions.js';
import { loadConfig, listConfigs } from '../config.js';
import { pack, unpack, mergeAction } from '../qr-rules.js';
import { qrSvg, startScanner } from '../qr.js';

const ADVANCE_MS = 2500;

// The shared top bar, with Back to where you came from.
const bar = (title, fallback = '#home') => topbar(title, backHref(fallback));

// ---------- a Scout shows their matches ----------
export async function renderShowQr() {
  const [group, me, all] = await Promise.all([currentGroup(), currentUser(), listSubmissions()]);
  const mine = all.filter((s) => s.submittedAt && (!s.scoutId || s.scoutId === me?.id) && (!s.groupId || s.groupId === group.id));
  // The ones the group hasn't got yet; if they're all sent, every match here.
  const unsent = mine.filter(needsSync);
  const list = unsent.length ? unsent : mine.filter((s) => s.eventId === group.currentEvent?.id);
  if (!list.length) {
    return { el: h('div', { class: 'screen' }, bar('Show as QR', '#saved'), h('main', { class: 'content' },
      h('p', { class: 'plain teams-empty' }, 'No matches to show yet. Matches you save show up here.'))) };
  }
  const configs = new Map();
  for (const s of list) if (!configs.has(s.configId)) configs.set(s.configId, await loadConfig(s.configId));

  let i = 0;
  let playing = list.length > 1;
  const frame = h('div', { class: 'qr-frame' });
  const caption = h('p', { class: 'qr-caption num', 'aria-live': 'polite' });
  const count = h('p', { class: 'qr-count' });
  const draw = () => {
    const s = list[i];
    // Each code says "i of n", so the Lead's screen knows when the set is done.
    // Matches saved before signing in have no owner yet: they're this Scout's.
    const svg = qrSvg(pack(configs.get(s.configId), { ...s, scoutId: s.scoutId ?? me?.id, groupId: s.groupId ?? group.id }, [i + 1, list.length]));
    svg.setAttribute('aria-label', `QR code for ${matchCode(s.summary)}, team ${s.summary?.team ?? 'not set'}`);
    frame.replaceChildren(svg);
    caption.textContent = [matchCode(s.summary), s.summary?.team, s.summary?.position && positionLabel(s.summary.position)].filter(Boolean).join(' · ');
    count.textContent = list.length > 1 ? `${i + 1} of ${list.length}` : '';
  };
  const step = (d) => { i = (i + d + list.length) % list.length; draw(); };
  let timer = null;
  const play = (on) => {
    playing = on;
    clearInterval(timer);
    if (on) timer = setInterval(() => step(1), ADVANCE_MS);
    pause.replaceChildren(icon(on ? 'pause' : 'play', 22), h('span', {}, on ? 'Pause' : 'Play'));
    // While it changes by itself, screen readers don't announce every code.
    caption.setAttribute('aria-live', on ? 'off' : 'polite');
  };
  const pause = h('button', { class: 'pill secondary', type: 'button', onclick: () => play(!playing) });
  const controls = list.length > 1 ? h('div', { class: 'qr-controls' },
    h('button', { class: 'pill secondary', type: 'button', 'aria-label': 'Previous match', onclick: () => { play(false); step(-1); } }, icon('back', 22)),
    pause,
    h('button', { class: 'pill secondary', type: 'button', 'aria-label': 'Next match', onclick: () => { play(false); step(1); } }, icon('next', 22))) : null;
  draw();
  if (list.length > 1) play(true);

  const el = h('div', { class: 'screen' },
    bar('Show as QR', '#saved'),
    h('main', { class: 'content qr-show' },
      h('p', { class: 'group-lede' }, unsent.length
        ? `${unsent.length} ${unsent.length === 1 ? 'match' : 'matches'} your group doesn’t have yet`
        : 'All your matches at this event'),
      frame, caption, count, controls,
      h('p', { class: 'plain qr-help' }, 'Turn your screen brightness up. Your Lead taps Scan Scouts’ matches on their Home screen and points the camera here. The screen stays on while this is open.')),
  );
  const release = keepScreenOn();
  return { el, cleanup: () => { clearInterval(timer); release(); } };
}

// ---------- a Lead scans them ----------
export async function renderScan() {
  const group = await currentGroup();
  if (!isLead(group)) {
    location.hash = '#home';
    return { el: h('div') };
  }
  const configs = Object.fromEntries(await Promise.all((await listConfigs()).map(async (c) => {
    const full = await loadConfig(c.id);
    return [full.id, full];
  })));

  const video = h('video', { class: 'qr-video', 'aria-hidden': 'true' });
  // Two lines: what just happened, and a problem (kept on screen a few
  // seconds, with a different buzz, so it isn't missed in a loud gym).
  const status = h('p', { class: 'qr-status', role: 'status' });
  const problem = h('p', { class: 'qr-problem', role: 'alert', hidden: true });
  let problemTimer = null;
  const showProblem = (text) => {
    problem.replaceChildren(icon('alert', 20), h('span', {}, text));
    problem.hidden = false;
    buzz([90, 60, 90]);
    clearTimeout(problemTimer);
    problemTimer = setTimeout(() => { problem.hidden = true; }, 5000);
  };
  // Per Scout: which of their codes we have, and how many they're showing.
  const byScout = new Map(); // name → { have: Set(i or id), n }
  const tally = h('ul', { class: 'qr-tally', 'aria-label': 'Scouts scanned' });
  const drawTally = () => tally.replaceChildren(...[...byScout].map(([name, t]) => h('li', {},
    t.n && t.have.size >= t.n ? icon('check', 18) : icon('device', 18),
    h('span', { class: 'qr-tally-name' }, name),
    h('span', { class: 'num qr-tally-count' }, t.n ? (t.have.size >= t.n ? `all ${t.n}` : `${t.have.size} of ${t.n}`) : `${t.have.size}`))));
  const seen = new Set(); // codes already handled this session
  let stop = null;

  // A code that can't be used is reported once per few seconds (it stays in
  // view), and can be tried again later; only handled codes go in `seen`.
  const lastProblem = new Map();
  const problemOnce = (text, msg) => {
    if (Date.now() - (lastProblem.get(text) ?? 0) < 5000) return;
    lastProblem.set(text, Date.now());
    showProblem(msg);
  };
  async function onText(text) {
    if (seen.has(text)) return;
    const { sub, part, error } = unpack(text, configs);
    if (error) { problemOnce(text, error); return; }
    if (sub.groupId && sub.groupId !== group.id) { problemOnce(text, 'That match is for a different Scouting group.'); return; }
    seen.add(text);
    const name = sub.summary?.scout ?? 'A Scout';
    const t = byScout.get(name) ?? { have: new Set(), n: 0 };
    t.have.add(part?.i ?? sub.id);
    if (part?.n) t.n = part.n;
    byScout.set(name, t);
    drawTally();
    const what = `${matchCode(sub.summary)} · ${sub.summary?.team ?? '?'}`;
    const progress = t.n ? ` (${t.have.size} of ${t.n})` : '';
    if (mergeAction(await getSubmission(sub.id), sub) === 'have') {
      status.textContent = `${name}: already have ${what}${progress}.`;
      return;
    }
    try {
      await putSubmission({ ...sub, groupId: sub.groupId ?? group.id });
    } catch {
      seen.delete(text); // let the next read try again
      problemOnce(text, 'Couldn’t save that match on this phone. Try it again.');
      return;
    }
    buzz();
    status.textContent = t.n && t.have.size >= t.n ? `${name}: got all ${t.n}. Next Scout.` : `${name}: got ${what}${progress}.`;
  }

  // Before the camera starts, the square it'll fill, with the button in it.
  const startBtn = h('button', { class: 'pill big', type: 'button' }, icon('camera', 22), 'Start the camera');
  const waitHint = h('p', { class: 'qr-waiting-hint' }, 'Point it at a Scout’s Show as QR screen. Matches save on this phone.');
  const holder = h('div', { class: 'qr-camera waiting' }, startBtn, waitHint);
  let release = null;
  let left = false; // the Lead left while the camera was still starting
  startBtn.addEventListener('click', async () => {
    try {
      holder.classList.remove('waiting');
      holder.replaceChildren(video, h('div', { class: 'qr-aim', 'aria-hidden': 'true' }));
      stop = await startScanner(video, onText);
      if (left) { stop(); return; }
      release = keepScreenOn();
      status.textContent = 'Point the camera at a Scout’s code.';
    } catch (err) {
      holder.classList.add('waiting');
      holder.replaceChildren(startBtn, waitHint);
      showProblem(cameraProblem(err));
    }
  });

  const el = h('div', { class: 'screen' },
    bar('Scan Scouts’ matches', '#home'),
    h('main', { class: 'content qr-scan' },
      h('p', { class: 'group-lede' }, 'For when nobody has signal: each Scout taps Show my matches as QR on their Home screen.'),
      holder, status, problem, tally,
      h('a', { class: 'pill secondary block', href: '#saved/everyone' }, 'Done: see everyone’s matches'),
      h('p', { class: 'plain qr-help' }, 'Scanned matches are saved on this phone and sent to your group, as each Scout’s own, the next time it has signal.')),
  );
  return { el, cleanup: () => { left = true; stop?.(); release?.(); clearTimeout(problemTimer); } };
}

// A camera error in plain words.
function cameraProblem(err) {
  const what = `${err?.name ?? ''} ${err?.message ?? ''}`;
  if (/NotAllowed|Permission/i.test(what)) return 'The camera is blocked. Allow it for this site in your browser settings, then try again.';
  if (/NotFound|Overconstrained/i.test(what)) return 'This phone has no camera Offline Scout can use.';
  if (/NotReadable|TrackStart/i.test(what)) return 'Another app is using the camera. Close it, then try again.';
  return 'The camera didn’t start. Close other apps using it, then try again.';
}
