// The group's Current event (#event).
// Everyone sees which event it is and how fresh the schedule is.
// Leads search FIRST's events and pick the one the group is at.

import { h, icon, formField, formMessage, busy } from '../ui.js';
import { currentGroup } from '../account.js';
import { isLead } from '../group-rules.js';
import { loadConfig } from '../config.js';
import { seasonOf } from '../schedule.js';
import { searchEvents, chooseEvent, cachedEvent, refreshCurrentEvent } from '../events.js';
import { friendlyError, isOnline } from '../supabase.js';
import { timeAgo } from '../sync.js';

export async function renderEvent() {
  const group = await currentGroup();
  const lead = isLead(group);
  const config = await loadConfig(group.game_config_id);
  const season = seasonOf(config);
  const ev = group.currentEvent;
  const data = ev ? await cachedEvent(ev.id) : null;
  const message = formMessage();

  // ---------- the current event ----------
  const quals = data?.matches.filter((m) => m.level === 'qual') ?? [];
  const currentBlock = ev
    ? h('section', { class: 'event-current' },
        h('p', { class: 'event-code num' }, `${ev.program} · ${ev.code}`),
        h('h2', { class: 'event-name' }, ev.name),
        h('p', { class: 'plain' }, [formatDates(ev.starts_on, ev.ends_on), ev.city].filter(Boolean).join(' · ')),
        h('dl', { class: 'event-facts' },
          fact('Teams', data ? data.teams.length : '—'),
          fact('Quals', data ? quals.length : '—'),
          fact('Updated', data ? timeAgo(data.savedAt).replace(' ago', '') : '—')),
        data && !quals.length ? h('p', { class: 'notice' }, 'The qualification schedule isn’t out yet. It usually comes the night before or the morning of the event; it downloads by itself when it does.') : null)
    : h('section', { class: 'event-current' },
        h('h2', { class: 'event-name' }, 'No event yet'),
        h('p', { class: 'plain' }, lead
          ? 'Pick the event your team is at. Its teams and schedule download to everyone’s phone, so team numbers fill in by themselves.'
          : 'Your Lead picks the event. Its schedule then downloads to your phone.'));

  const refreshBtn = ev ? h('button', { class: 'pill secondary block', type: 'button', disabled: !isOnline() },
    isOnline() ? 'Update schedule now' : 'Update schedule (needs signal)') : null;
  refreshBtn?.addEventListener('click', () => busy(refreshBtn, 'Updating…', async () => {
    try {
      await refreshCurrentEvent();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) { message.show(friendlyError(err), 'error'); }
  }));

  // ---------- Leads: find and pick an event ----------
  let picker = null;
  if (lead) {
    const results = h('ul', { class: 'rows', 'aria-label': 'Events found', 'aria-live': 'polite' });
    const search = formField(ev ? 'Change event' : 'Find your event',
      { type: 'search', autocomplete: 'off', enterkeyhint: 'search', placeholder: 'Event name or city' },
      group.program === 'FTC' ? `FTC ${season}–${String((season + 1) % 100).padStart(2, '0')} season` : null);
    const go = h('button', { class: 'pill block', type: 'submit', disabled: !isOnline() || group.program !== 'FTC' },
      !isOnline() ? 'Search (needs signal)' : 'Search');
    picker = h('form', { class: 'form', novalidate: true, role: 'search' }, search.el, h('div', { class: 'actions' }, go), results);

    if (group.program !== 'FTC') {
      picker.prepend(h('p', { class: 'notice' }, 'FRC events arrive with the FRC game after kickoff in January.'));
    }

    picker.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(go, 'Searching…', async () => {
        try {
          const found = await searchEvents({ program: group.program, season, text: search.input.value });
          results.replaceChildren(...(found.length ? found.map(resultRow) : [
            h('li', { class: 'plain', style: 'padding: 12px 0' }, 'No events match. Try the city, or part of the name.')]));
        } catch (err) { message.show(friendlyError(err), 'error'); }
      });
    });

    function resultRow(r) {
      const pick = h('button', { class: 'row event-result', type: 'button' },
        h('div', {},
          h('div', { class: 'title' }, r.name),
          h('div', { class: 'sub' }, [formatDates(r.starts_on, r.ends_on), r.city, r.code].filter(Boolean).join(' · '))),
        h('span', { class: 'small-btn primary' }, 'Pick'));
      pick.addEventListener('click', () => busy(pick.querySelector('.small-btn'), 'Loading…', async () => {
        try {
          await chooseEvent(group, { program: group.program, season, code: r.code });
          location.hash = '#home';
        } catch (err) { message.show(friendlyError(err), 'error'); }
      }));
      return h('li', {}, pick);
    }
  }

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Event')),
    h('main', { class: 'content' }, message.el, currentBlock, refreshBtn, picker),
  );
  return { el };
}

function fact(label, value) {
  return h('div', { class: 'fact' }, h('dt', {}, label), h('dd', { class: 'num' }, value));
}

// "Dec 13" or "Dec 13–14"
export function formatDates(start, end) {
  if (!start) return '';
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const a = new Date(`${start}T00:00:00Z`).toLocaleDateString([], opts);
  if (!end || end === start) return a;
  const b = new Date(`${end}T00:00:00Z`).toLocaleDateString([], { day: 'numeric', timeZone: 'UTC' });
  return `${a}–${b}`;
}
