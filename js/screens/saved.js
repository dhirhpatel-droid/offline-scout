// My matches: the Submissions on this phone, newest first, grouped by event.
// Tap one to view or edit it (delete is inside).

import { h, icon, savedStatus } from '../ui.js';
import { listSubmissions } from '../db.js';
import { positionLabel, matchCode, syncStatus, needsSync } from '../submissions.js';
import { nowScoutingBar } from '../now-scouting.js';

export async function renderSaved() {
  const [submissions, bar] = await Promise.all([listSubmissions(), nowScoutingBar()]);
  const unsent = submissions.filter(needsSync).length;

  // Group by event, keeping newest-first order.
  const byEvent = new Map();
  for (const s of submissions) {
    const key = s.event || 'No event';
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(s);
  }

  const body = submissions.length
    ? [...byEvent].map(([event, subs]) => h('section', {},
        h('h2', { class: 'section-h' }, `${event} · ${subs.length}`),
        h('ul', { class: 'submission-list' }, subs.map((s) => h('li', {}, submissionRow(s))))))
    : h('div', { class: 'empty-state' },
        h('h2', {}, 'No matches yet'),
        h('p', {}, 'Every match you save shows up here, newest first. They stay on this phone even with no signal.'),
        h('a', { class: 'pill', href: '#match' }, 'Start scouting'));

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'My matches')),
    h('main', { class: 'content' }, body),
    bar,
    h('footer', { class: 'bottombar' }, savedStatus(submissions.length
      ? `${submissions.length} on this phone${unsent ? ` · ${unsent} not sent yet` : ''}`
      : 'Saved on this phone')),
  );
  return { el };
}

// One row: the alliance position as a coloured block, the match and team,
// the points, and where the data is (on this phone / sent).
export function submissionRow(sub) {
  const { team, position, alliance, scout } = sub.summary ?? {};
  const code = matchCode(sub.summary);
  const where = position ? positionLabel(position) : '';
  const time = new Date(sub.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // "R1" / "B2" (or "R" for Milestone 1 data that only knew the colour)
  const badge = where ? where.replace(/[a-z ]/g, '') : '?';
  const status = syncStatus(sub);

  return h('a', {
    class: 'submission-row', href: `#match/${sub.id}`,
    'aria-label': `${code}, team ${team ?? 'not set'}, ${where || 'no position'}, ${sub.estimatedPoints} estimated points, ${status.text}`,
  },
    // Colour AND letters, so it reads without colour vision too.
    h('span', { class: `badge ${alliance ?? ''}`, 'aria-hidden': 'true' }, badge),
    h('span', { class: 'submission-main' },
      h('span', { class: 'submission-title num' }, `${code} · ${team ?? '—'}`),
      h('span', { class: 'sub' }, [where, scout, time].filter(Boolean).join(' · '))),
    h('span', { class: 'pts' },
      h('span', { class: 'value num' }, sub.estimatedPoints),
      h('span', { class: `sync-chip ${status.state}` }, status.state === 'sent' ? 'Sent' : 'On phone')),
  );
}
