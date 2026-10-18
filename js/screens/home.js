// Home: your Scouting group, the event name, and the two main actions.
// Your scout name comes from your account (Settings → Account).

import { h, icon, savedStatus } from '../ui.js';
import { getSetting, setSetting, getDraft, countSubmissions } from '../db.js';
import { currentGroup, cachedProfile } from '../account.js';
import { groupLabel } from '../group-rules.js';

export async function renderHome() {
  const [eventName, draft, count, group, profile] = await Promise.all([
    getSetting('eventName'), getDraft(), countSubmissions(), currentGroup(), cachedProfile(),
  ]);

  const eventInput = h('input', {
    id: 'event', class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'words',
    placeholder: 'e.g. Northern Ontario Qualifier',
  });
  eventInput.value = eventName ?? '';
  eventInput.addEventListener('input', () => setSetting('eventName', eventInput.value.trim()));

  const main = draft
    ? [
        h('a', { class: 'pill big block', href: '#match' }, `Resume ${describe(draft)}`),
        h('p', { class: 'resume-note' }, 'This match is not submitted yet. Everything you tapped is kept.'),
      ]
    : [h('a', { class: 'pill big block', href: '#match' }, 'Scout a match')];

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('h1', { class: 'wordmark', tabindex: '-1' }, 'Offline Scout'),
      h('span', { style: 'flex:1' }),
      h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings' }, icon('settings')),
    ),
    h('main', { class: 'content home' },
      h('div', { class: 'home-group' },
        h('a', { class: 'group-chip', href: '#group', 'aria-label': `Scouting group ${groupLabel(group)}, ${group.name}. You are a ${group.role}. Open group` },
          h('span', { class: 'num' }, groupLabel(group)),
          h('span', {}, group.role === 'lead' ? 'Lead' : 'Scout'),
          icon('next', 18)),
        profile?.display_name ? h('span', { class: 'plain' }, `Scouting as ${profile.display_name}`) : null),
      h('div', { class: 'field home-event' }, h('label', { class: 'field-label', for: 'event' }, 'Event'), eventInput),
      h('div', { class: 'home-actions' },
        ...main,
        h('a', { class: 'list-link', href: '#saved' },
          'Saved matches', h('span', { class: 'count num' }, count), icon('next', 20)),
      ),
    ),
    h('footer', { class: 'bottombar' }, savedStatus('Everything is saved on this device')),
  );

  return { el };
}

// "match 14 · 23810" from the Draft's summary.
function describe(draft) {
  const { match, team } = draft.summary ?? {};
  if (match && team) return `match ${match} · ${team}`;
  if (match) return `match ${match}`;
  return 'match';
}
