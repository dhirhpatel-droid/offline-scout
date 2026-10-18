// Home: event name, scout name (both remembered), and the two main actions.

import { h, icon, savedStatus } from '../ui.js';
import { getSetting, setSetting, getDraft, countSubmissions } from '../db.js';

export async function renderHome() {
  const [eventName, scoutName, draft, count] = await Promise.all([
    getSetting('eventName'), getSetting('scoutName'), getDraft(), countSubmissions(),
  ]);

  const eventInput = h('input', {
    id: 'event', class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'words',
    placeholder: 'e.g. Northern Ontario Qualifier',
  });
  eventInput.value = eventName ?? '';
  eventInput.addEventListener('input', () => setSetting('eventName', eventInput.value.trim()));

  const scoutInput = h('input', {
    id: 'scout', class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'words',
    placeholder: 'Your name',
  });
  scoutInput.value = scoutName ?? '';
  scoutInput.addEventListener('input', () => setSetting('scoutName', scoutInput.value.trim()));

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
      h('div', { class: 'field home-event' }, h('label', { class: 'field-label', for: 'event' }, 'Event'), eventInput),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'scout' }, 'Scout name'), scoutInput),
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
