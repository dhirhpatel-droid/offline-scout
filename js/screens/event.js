// The group's Current event (#event).
// The event is the cover: its name, when and where, then its schedule, so
// anyone can check who's in a match. Leads search FIRST's events and pick
// the one the group is at.

import { h, icon, formField, formMessage, busy, confirmDialog, bumper } from '../ui.js';
import { currentGroup, cachedProfile } from '../account.js';
import { isLead } from '../group-rules.js';
import { loadConfig } from '../config.js';
import { seasonOf, timeOf } from '../schedule.js';
import { searchEvents, chooseEvent, cachedEvent, cachedPlan, refreshCurrentEvent } from '../events.js';
import { assignmentsFor } from '../assignments.js';
import { alliancePositions, positionLabel } from '../submissions.js';
import { friendlyError, isOnline } from '../supabase.js';
import { timeAgo } from '../sync.js';
import { getSetting, setSetting } from '../db.js';

export async function renderEvent() {
  const group = await currentGroup();
  const lead = isLead(group);
  const config = await loadConfig(group.game_config_id);
  const season = seasonOf(config);
  // Events follow the GAME the group scouts (e.g. an FRC team practising
  // with the FTC game picks FTC events), not the group's own program label.
  const program = config.program;
  const ev = group.currentEvent;
  const data = ev ? await cachedEvent(ev.id) : null;
  const message = formMessage();

  // A note left by the last pick ("Downloaded: 10 teams, 7 matches").
  const note = await getSetting('eventNote');
  if (note) {
    message.show(note, 'info');
    await setSetting('eventNote', null);
  }

  const quals = data?.matches.filter((m) => m.level === 'qual') ?? [];
  const playoffs = data?.matches.filter((m) => m.level === 'playoff') ?? [];

  // ---------- the cover ----------
  const cover = h('section', { class: 'now event-cover', 'data-alliance': 'none' },
    h('div', { class: 'now-top' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      null),
    ev
      ? [
          h('h1', { class: 'now-hero event-title', tabindex: '-1' }, ev.name),
          h('p', { class: 'now-sub' }, [formatDates(ev.starts_on, ev.ends_on), ev.city, `${ev.program} ${ev.code}`].filter(Boolean).join(' · ')),
          h('p', { class: 'event-facts' }, data
            ? joinNoBreak([
                `${data.teams.length} teams`,
                quals.length ? `${quals.length} qualification matches` : 'schedule not out yet',
                `updated ${timeAgo(data.savedAt)}`,
              ])
            : 'Schedule downloads to this phone the next time it has signal.'),
        ]
      : [
          h('h1', { class: 'now-hero', tabindex: '-1' }, 'No event yet'),
          h('p', { class: 'now-sub' }, program !== 'FTC'
            ? 'FRC events arrive with the FRC game after kickoff in January.'
            : lead
              ? 'Pick the event your team is at. Its teams and schedule download to everyone’s phone, so team numbers fill in by themselves.'
              : 'Your Lead picks the event. Its schedule then downloads to your phone.'),
        ]);

  // ---------- the schedule ----------
  // Laid out like the printed schedule posted at events: one column per
  // alliance station. Teams you're assigned to watch get a ring.
  const profile = await cachedProfile();
  const plan = ev ? await cachedPlan(group.id, ev.id) : { shifts: [], watches: [] };
  const mine = new Set(assignmentsFor({ scoutId: profile?.id, ...plan, matches: data?.matches ?? [] })
    .map((a) => `${a.level}:${a.number}:${a.position}`));
  const positions = alliancePositions(config);
  const all = [...quals, ...playoffs];
  const nextMatch = all.find((x) => !x.played);
  const schedule = data && all.length
    ? h('section', {},
        h('h2', { class: 'section-title sub' }, 'Schedule'),
        h('table', { class: 'schedule', style: `--stations: ${positions.length}` },
          h('caption', { class: 'visually-hidden' }, 'Match schedule. Teams you watch are marked.'),
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, 'Match'),
            positions.map((p) => h('th', { scope: 'col', class: `st ${p.replace(/\d/, '')}` }, positionLabel(p))))),
          h('tbody', {}, all.map((m) => matchRow(m, m === nextMatch, positions, mine)))))
    : data ? h('p', { class: 'notice' }, 'The qualification schedule isn’t out yet. It usually comes the night before or the morning of the event, and downloads by itself when it does.') : null;

  const teams = data?.teams.length ? h('details', { class: 'team-list' },
    h('summary', {}, `All ${data.teams.length} teams`, icon('next', 18)),
    h('ul', {}, data.teams.map((t) => h('li', {}, h('span', { class: 'num' }, t.team_number), ` ${t.team_name ?? ''}`)))) : null;

  // ---------- Leads: find and pick an event ----------
  let picker = null;
  if (lead) {
    if (program !== 'FTC') {
      picker = ev ? h('p', { class: 'notice' }, 'FRC events arrive with the FRC game after kickoff in January.') : null;
    } else if (!isOnline()) {
      picker = h('p', { class: 'plain' }, ev ? 'Changing the event needs signal. This schedule is saved on your phone.' : 'Picking the event needs signal.');
    } else {
      const results = h('ul', { class: 'rows', 'aria-label': 'Events found', 'aria-live': 'polite' });
      const search = formField(ev ? 'Change event' : 'Find your event',
        { type: 'search', autocomplete: 'off', enterkeyhint: 'search', placeholder: 'Event name or city' },
        `FTC ${season}–${String((season + 1) % 100).padStart(2, '0')} season`);
      const go = h('button', { class: 'pill block', type: 'submit' }, 'Search');
      picker = h('form', { class: 'form', novalidate: true, role: 'search' },
        h('h2', { class: 'section-title sub' }, ev ? 'Change event' : 'Find your event'),
        search.el, h('div', { class: 'actions' }, go), results);
      search.el.querySelector('label').classList.add('visually-hidden');

      picker.addEventListener('submit', (e) => {
        e.preventDefault();
        busy(go, 'Searching…', async () => {
          try {
            const found = await searchEvents({ program, season, text: search.input.value });
            results.replaceChildren(...(found.length ? found.map(resultRow) : [
              h('li', { class: 'plain', style: 'padding: 12px 0' }, 'No events match. Try the city, or part of the name.')]));
          } catch (err) { message.show(friendlyError(err), 'error'); }
        });
      });

      function resultRow(r) {
        const use = h('span', { class: 'small-btn primary' }, 'Use this event');
        const row = h('button', { class: 'row event-result', type: 'button' },
          h('div', {},
            h('div', { class: 'title' }, r.name),
            h('div', { class: 'sub' }, [formatDates(r.starts_on, r.ends_on), r.city].filter(Boolean).join(' · '))),
          use);
        row.addEventListener('click', async () => {
          // Replacing the event changes it for the whole group: ask first.
          if (ev && ev.code !== r.code) {
            const ok = await confirmDialog({
              title: `Switch everyone to ${r.name}?`,
              body: `Your group’s phones download its schedule the next time they have signal. Matches already scouted at ${ev.name} stay as they are.`,
              confirmLabel: 'Switch event',
            });
            if (!ok) return;
          }
          busy(use, 'Downloading…', async () => {
            try {
              const id = await chooseEvent(group, { program, season, code: r.code });
              const saved = await cachedEvent(id);
              const q = saved?.matches.filter((m) => m.level === 'qual').length ?? 0;
              await setSetting('eventNote', `Downloaded ${r.name}: ${saved?.teams.length ?? 0} teams, ${q ? `${q} qualification matches` : 'schedule not out yet'}. Your scouts’ phones get it next time they have signal.`);
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            } catch (err) { message.show(friendlyError(err), 'error'); }
          });
        });
        return h('li', {}, row);
      }
    }
  }

  const refreshBtn = ev && isOnline()
    ? h('button', { class: 'pill secondary block', type: 'button' }, 'Update schedule now') : null;
  refreshBtn?.addEventListener('click', () => busy(refreshBtn, 'Updating…', async () => {
    try {
      await refreshCurrentEvent();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) { message.show(friendlyError(err), 'error'); }
  }));

  const el = h('div', { class: 'screen' },
    cover,
    h('main', { class: 'content' }, message.el,
      schedule,
      lead && ev ? h('a', { class: 'pill block', href: '#assign' }, 'Plan assignments', icon('next', 20)) : null,
      teams, refreshBtn, picker),
  );
  return { el };
}

// One schedule row: the match (with its time, or the score once played),
// then a bumper per station.
function matchRow(m, isNext, positions, mine) {
  const code = m.level === 'qual' ? `Q${m.number}` : `P${m.number}${m.game > 1 ? `-${m.game}` : ''}`;
  const score = m.played && m.red_score != null ? `${m.red_score}–${m.blue_score}` : null;
  // Words, not just shade: "Played 82–141", "Next 11:06 AM", or the time.
  const when = m.played ? (score ?? 'Played') : isNext ? `Next ${timeOf(m) ?? ''}` : timeOf(m) ?? '';
  return h('tr', { class: `${m.played ? 'played' : ''}${isNext ? ' next-up' : ''}` },
    h('th', { scope: 'row' }, h('span', { class: 'schedule-code num' }, code),
      isNext ? h('span', { class: 'schedule-time next' }, 'Next') : null,
      h('span', { class: 'schedule-time' }, isNext ? timeOf(m) ?? '' : when)),
    positions.map((p) => {
      const color = p.replace(/\d/, '');
      const team = m[color]?.[Number(p.slice(color.length)) - 1] ?? null;
      return h('td', {}, bumper(team, color, { mine: mine.has(`${m.level}:${m.number}:${p}`) }));
    }));
}

// "a · b · c" where each piece stays on one line.
function joinNoBreak(parts) {
  return parts.flatMap((p, i) => [i ? ' · ' : '', h('span', { class: 'nowrap' }, p)]);
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
