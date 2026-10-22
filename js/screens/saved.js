// Matches: the Submissions on this phone, newest first, grouped by event.
//   #saved           – my matches
//   #saved/everyone  – everyone's (Leads, or Scouts if the group allows it)
// Tap one to view or edit it (delete is inside).

import { h, icon, busy, bumper } from '../ui.js';
import { listSubmissions, getSetting } from '../db.js';
import { positionLabel, matchCode, syncStatus, needsSync } from '../submissions.js';
import { nowScoutingBar } from '../now-scouting.js';
import { currentUser, currentGroup } from '../account.js';
import { isLead } from '../group-rules.js';
import { syncNow, sendStatus, lastResult } from '../sync.js';
import { isOnline } from '../supabase.js';

export async function renderSaved({ param }) {
  const [all, bar, me, group, lastSyncAt] = await Promise.all([
    listSubmissions(), nowScoutingBar(), currentUser(), currentGroup(), getSetting('lastSyncAt'),
  ]);
  const canSeeAll = isLead(group) || group?.settings?.scoutsSeeAll === true;
  const everyone = canSeeAll && param === 'everyone';
  // "Mine" = scouted by me (matches from before accounts existed count as mine).
  const mine = (s) => !s.scoutId || s.scoutId === me?.id;
  const inGroup = (s) => !s.groupId || s.groupId === group?.id;
  const submissions = all.filter((s) => inGroup(s) && (everyone || mine(s)));
  const unsent = all.filter((s) => mine(s) && needsSync(s)).length;

  // Group by event, keeping newest-first order.
  const byEvent = new Map();
  for (const s of submissions) {
    const key = s.event || 'No event';
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(s);
  }

  const switcher = canSeeAll ? h('div', { class: 'segmented wide list-switch', role: 'group', 'aria-label': 'Whose matches' },
    h('a', { class: 'seg-link', href: '#saved', 'aria-current': everyone ? null : 'page' }, 'Mine'),
    h('a', { class: 'seg-link', href: '#saved/everyone', 'aria-current': everyone ? 'page' : null }, 'Everyone')) : null;

  const body = submissions.length
    ? [...byEvent].map(([event, subs]) => h('section', {},
        h('h2', { class: 'section-h' }, `${event} · ${subs.length}`),
        h('ul', { class: 'submission-list' }, subs.map((s) => h('li', {}, submissionRow(s, submissions, everyone))))))
    : h('div', { class: 'empty-state' },
        h('h2', {}, everyone ? 'No matches from your group yet' : 'No matches yet'),
        h('p', {}, everyone
          ? 'Matches your scouts save show up here once their phones have had signal.'
          : 'Every match you save shows up here, newest first. They stay on this phone even with no signal.'),
        everyone ? null : h('a', { class: 'pill', href: '#match' }, 'Start scouting'));

  // Footer: where my matches are, and a way to send now that says what happened.
  const st = sendStatus({ unsent, lastSyncAt, result: lastResult });
  const statusEl = h('p', { class: `status ${st.state}`, role: 'status' },
    icon(st.state === 'sent' ? 'check' : 'device', 18), h('span', {}, st.text));
  // Offline there's nothing to send with: the status line says they'll send
  // later, and with QR backup on, the Scout can show them as QR codes instead.
  const sendBtn = unsent && isOnline() ? h('button', { class: 'pill', type: 'button' }, 'Send now')
    : unsent && group?.settings?.qrBackup ? h('a', { class: 'pill', href: '#qr' }, 'Show as QR') : null;
  if (sendBtn?.tagName === 'BUTTON') sendBtn.addEventListener('click', () => busy(sendBtn, 'Sending…', async () => {
    const r = await syncNow();
    if (r.error) statusEl.replaceChildren(icon('device', 18), h('span', {}, sendStatus({ unsent: r.waiting, result: r }).text));
  }));

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, everyone ? 'Everyone’s matches' : 'My matches')),
    h('main', { class: 'content' }, switcher, body),
    bar,
    h('footer', { class: 'bottombar' },
      statusEl,
      sendBtn),
  );
  return { el };
}

// One row: the alliance position as a coloured block, the match and team,
// the points, and where the data is. The status chip only shows when rows
// differ, so it means something when it's there.
export function submissionRow(sub, all = [sub], showScout = false) {
  const mixed = new Set(all.map((x) => syncStatus(x).state)).size > 1;
  const { team, position, alliance, scout } = sub.summary ?? {};
  const code = matchCode(sub.summary);
  const where = position ? positionLabel(position) : '';
  const time = new Date(sub.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const status = syncStatus(sub);

  return h('a', {
    class: 'submission-row', href: `#match/${sub.id}`,
    'aria-label': `${code}, team ${team ?? 'not set'}, ${where || 'no position'}, by ${scout ?? 'unknown'}, ${sub.estimatedPoints} estimated points, ${status.text}`,
  },
    // The team as its bumper; the position is written out below it.
    h('span', { class: 'submission-team', 'aria-hidden': 'true' }, bumper(team, alliance)),
    h('span', { class: 'submission-main' },
      h('span', { class: 'submission-title num' }, code),
      h('span', { class: 'sub' }, [where, showScout && scout, `saved ${time}`].filter(Boolean).join(' · '))),
    h('span', { class: 'pts' },
      h('span', { class: 'value num' }, sub.estimatedPoints),
      mixed ? h('span', { class: `sync-chip ${status.state}` }, status.state === 'sent' ? 'Sent' : 'Not sent') : null),
  );
}
