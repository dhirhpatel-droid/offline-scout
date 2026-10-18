// Saved Submissions: newest first. Tap one to view or edit it (delete is inside).

import { h, icon, savedStatus } from '../ui.js';
import { listSubmissions } from '../db.js';
import { positionLabel } from '../submissions.js';

export async function renderSaved() {
  const submissions = await listSubmissions();

  const body = submissions.length
    ? h('ul', { class: 'submission-list' }, submissions.map(submissionRow))
    : h('div', { class: 'empty-state' },
        h('h2', {}, 'No saved matches yet'),
        h('p', {}, 'Each match you save shows up here, newest first. They stay on this device, even with no internet.'),
        h('a', { class: 'pill', href: '#match' }, 'Scout a match'));

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Saved matches'),
      submissions.length ? h('span', { class: 'plain num', style: 'padding-right:8px' }, submissions.length) : null,
    ),
    h('main', { class: 'content' }, body),
    h('footer', { class: 'bottombar' }, savedStatus(`${submissions.length} saved on this device`)),
  );
  return { el };
}

function submissionRow(sub) {
  const { level, match, team, position, alliance, scout } = sub.summary ?? {};
  const where = position ? positionLabel(position) : '';
  const matchText = `${level === 'playoff' ? 'Playoff' : 'Match'} ${match ?? '—'}`;
  const time = new Date(sub.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // "R1" / "B2" (or "R" for Milestone 1 data that only knew the colour)
  const badge = where ? where.replace(/[a-z ]/g, '') : '?';

  return h('li', {},
    h('a', {
      class: 'submission-row', href: `#match/${sub.id}`,
      'aria-label': `${matchText}, team ${team}, ${where || 'no position'}, ${sub.estimatedPoints} estimated points`,
    },
      // Colour AND letters, so it reads without colour vision too.
      h('span', { class: `badge ${alliance ?? ''}`, 'aria-hidden': 'true' }, badge),
      h('span', {},
        h('span', { class: 'team num', style: 'display:block' }, `Team ${team ?? '—'}`),
        h('span', { class: 'sub', style: 'display:block' },
          [matchText, where, scout, time].filter(Boolean).join(' · '))),
      h('span', { class: 'pts' },
        h('span', { class: 'value num', style: 'display:block' }, sub.estimatedPoints),
        h('span', { class: 'label' }, 'est. pts')),
    ),
  );
}
