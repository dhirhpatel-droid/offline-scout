// QR backup (docs/adr/0004), a Group setting (qrBackup), off by default.
//   #qr    – a Scout shows their matches, one QR code at a time
//   #scan  – a Lead scans them with the camera; they're saved on the Lead's
//            phone and uploaded (as the Scout's) when it has signal
// Both work with no signal at all: that's the point.

import { h, icon, buzz } from '../ui.js';
import { currentGroup, currentUser } from '../account.js';
import { isLead } from '../group-rules.js';
import { listSubmissions, getSubmission, putSubmission } from '../db.js';
import { needsSync, matchCode, positionLabel } from '../submissions.js';
import { loadConfig, listConfigs } from '../config.js';
import { pack, unpack, mergeAction } from '../qr-rules.js';
import { qrSvg, startScanner } from '../qr.js';

const ADVANCE_MS = 2500;

const topbar = (title, back) => h('header', { class: 'topbar' },
  h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, icon('back')),
  h('h1', { tabindex: '-1' }, title));

// ---------- a Scout shows their matches ----------
export async function renderShowQr() {
  const [group, me, all] = await Promise.all([currentGroup(), currentUser(), listSubmissions()]);
  const mine = all.filter((s) => s.submittedAt && (!s.scoutId || s.scoutId === me?.id) && (!s.groupId || s.groupId === group.id));
  // The ones the group hasn't got yet; if they're all sent, every match here.
  const unsent = mine.filter(needsSync);
  const list = unsent.length ? unsent : mine.filter((s) => s.eventId === group.currentEvent?.id);
  if (!list.length) {
    return { el: h('div', { class: 'screen' }, topbar('Show as QR', '#saved'), h('main', { class: 'content' },
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
    const svg = qrSvg(pack(configs.get(s.configId), s));
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
    pause.setAttribute('aria-pressed', String(!on));
  };
  const pause = h('button', { class: 'pill secondary', type: 'button', onclick: () => play(!playing) });
  const controls = list.length > 1 ? h('div', { class: 'qr-controls' },
    h('button', { class: 'pill secondary', type: 'button', 'aria-label': 'Previous match', onclick: () => { play(false); step(-1); } }, icon('back', 22)),
    pause,
    h('button', { class: 'pill secondary', type: 'button', 'aria-label': 'Next match', onclick: () => { play(false); step(1); } }, icon('next', 22))) : null;
  draw();
  if (list.length > 1) play(true);

  const el = h('div', { class: 'screen' },
    topbar('Show as QR', '#saved'),
    h('main', { class: 'content qr-show' },
      h('p', { class: 'group-lede' }, unsent.length
        ? `${unsent.length} ${unsent.length === 1 ? 'match' : 'matches'} your group doesn’t have yet`
        : 'All your matches at this event'),
      frame, caption, count, controls,
      h('p', { class: 'plain qr-help' }, 'Turn your screen brightness up. Your Lead opens Offline Scout → Scan scouts’ matches and points the camera here; it changes by itself every few seconds.')),
  );
  return { el, cleanup: () => clearInterval(timer) };
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
  const status = h('p', { class: 'qr-status', role: 'status' }, 'Point the camera at a scout’s code.');
  const got = h('ol', { class: 'qr-got', 'aria-label': 'Matches received' });
  const seen = new Set(); // codes already handled this session
  let received = 0;
  let stop = null;

  async function onText(text) {
    if (seen.has(text)) return;
    seen.add(text);
    const { sub, error } = unpack(text, configs);
    if (error) { status.textContent = error; return; }
    if (sub.groupId && sub.groupId !== group.id) { status.textContent = 'That match is for a different Scouting group.'; return; }
    const action = mergeAction(await getSubmission(sub.id), sub);
    const name = sub.summary?.scout ?? 'a scout';
    const what = `${matchCode(sub.summary)} · ${sub.summary?.team ?? '?'}`;
    if (action === 'have') { status.textContent = `Already have ${what} from ${name}.`; return; }
    await putSubmission({ ...sub, groupId: sub.groupId ?? group.id });
    received += 1;
    buzz();
    status.textContent = `Got ${what} from ${name}. ${received} so far.`;
    got.prepend(h('li', {}, icon('check', 18), h('span', { class: 'num' }, what), h('span', { class: 'qr-got-by' }, ` · ${name}`)));
  }

  const startBtn = h('button', { class: 'pill big block', type: 'button' }, icon('camera', 22), 'Start the camera');
  const holder = h('div', { class: 'qr-camera' }, startBtn);
  startBtn.addEventListener('click', async () => {
    try {
      holder.replaceChildren(video, h('div', { class: 'qr-aim', 'aria-hidden': 'true' }));
      stop = await startScanner(video, onText);
    } catch (err) {
      holder.replaceChildren(startBtn);
      status.textContent = /Permission|NotAllowed/i.test(err.name + err.message)
        ? 'The camera is blocked. Allow it for this site in your browser settings, then try again.'
        : `The camera didn’t start: ${err.message}`;
    }
  });

  const el = h('div', { class: 'screen' },
    topbar('Scan scouts’ matches', '#home'),
    h('main', { class: 'content qr-scan' },
      h('p', { class: 'group-lede' }, 'For when nobody has signal: each scout opens My matches → Show as QR.'),
      holder, status, got,
      h('a', { class: 'pill secondary block', href: '#saved/everyone' }, 'Done: see everyone’s matches'),
      h('p', { class: 'plain qr-help' }, 'Scanned matches are saved on this phone and sent to your group, as each scout’s own, the next time it has signal.')),
  );
  return { el, cleanup: () => stop?.() };
}
