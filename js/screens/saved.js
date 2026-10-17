// Saved matches: newest first. Tap one to view or edit it (delete is inside).

import { h, icon, savedStatus } from '../ui.js';
import { listEntries } from '../db.js';

export async function renderSaved() {
  const entries = await listEntries();

  const body = entries.length
    ? h('ul', { class: 'entries' }, entries.map(entryRow))
    : h('div', { class: 'empty-state' },
        h('h2', {}, 'No saved matches yet'),
        h('p', {}, 'Each match you save shows up here, newest first. They stay on this device, even with no internet.'),
        h('a', { class: 'pill', href: '#match' }, 'Scout a match'));

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Saved matches'),
      entries.length ? h('span', { class: 'plain num', style: 'padding-right:8px' }, entries.length) : null,
    ),
    h('main', { class: 'content' }, body),
    h('footer', { class: 'bottombar' }, savedStatus(`${entries.length} saved on this device`)),
  );
  return { el };
}

function entryRow(entry) {
  const { match, team, alliance, scout } = entry.summary ?? {};
  const allianceName = alliance ? alliance[0].toUpperCase() + alliance.slice(1) : '';
  const time = new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return h('li', {},
    h('a', {
      class: 'entry', href: `#match/${entry.id}`,
      'aria-label': `Match ${match}, team ${team}, ${allianceName || 'no'} alliance, ${entry.points} estimated points`,
    },
      // Colour AND a letter, so it reads without colour vision too.
      h('span', { class: `badge ${alliance ?? ''}`, 'aria-hidden': 'true' }, allianceName ? allianceName[0] : '?'),
      h('span', {},
        h('span', { class: 'team num', style: 'display:block' }, `Team ${team ?? '—'}`),
        h('span', { class: 'sub', style: 'display:block' },
          [`Match ${match ?? '—'}`, allianceName, scout, time].filter(Boolean).join(' · '))),
      h('span', { class: 'pts' },
        h('span', { class: 'value num', style: 'display:block' }, entry.points),
        h('span', { class: 'label' }, 'est. pts')),
    ),
  );
}
