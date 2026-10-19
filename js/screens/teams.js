// Lead views (Milestone 6):
//   #teams        – All Teams: every Team at the Current event, how often it's
//                   been scouted (Coverage) and its average Estimated points
//   #team/<num>   – one Team: its averages, every field summed up, its
//                   matches and each Submission
// Built from the Submissions on this phone (Leads' phones download the
// group's), so it works offline. It shows data; it never ranks for a pick.

import { h, icon, bumper, station } from '../ui.js';
import { currentGroup, currentUser } from '../account.js';
import { isLead } from '../group-rules.js';
import { loadConfig } from '../config.js';
import { listSubmissions, getSetting, setSetting } from '../db.js';
import { cachedEvent } from '../events.js';
import { positionOf, timeOf } from '../schedule.js';
import { positionLabel, matchCode } from '../submissions.js';
import { forEvent, teamRows, sortRows, formatAvg, fieldSummary, scoringSections } from '../team-stats.js';
import { timeAgo } from '../sync.js';
import { submissionRow } from './saved.js';
import { nowScoutingBar } from '../now-scouting.js';

// Everything both screens need, or a reason they can't show.
async function load() {
  const group = await currentGroup();
  const ev = group?.currentEvent;
  const [config, data, all, lastSyncAt] = await Promise.all([
    loadConfig(group.game_config_id), cachedEvent(ev?.id), listSubmissions(), getSetting('lastSyncAt'),
  ]);
  const canSeeAll = isLead(group) || group.settings?.scoutsSeeAll === true;
  const subs = ev ? forEvent(all, { groupId: group.id, eventId: ev.id }) : [];
  return { group, ev, config, data, subs, canSeeAll, lastSyncAt };
}

function topbar(title, back = '#home') {
  return h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, icon('back')),
    h('h1', { tabindex: '-1' }, title));
}

// Why there's nothing to show, as a screen.
function notice(title, text, link) {
  return { el: h('div', { class: 'screen' }, topbar(title),
    h('main', { class: 'content' }, h('p', { class: 'plain teams-empty' }, text), link)) };
}

// ---------- All Teams ----------

const COLUMNS = (config) => [
  { key: 'team', label: 'Team' },
  { key: 'scouted', label: 'Scouted' },
  { key: 'avg', label: 'Avg' },
  ...scoringSections(config).map((s) => ({ key: s.id, label: s.label === 'Endgame' ? 'End' : s.label })),
];

export async function renderTeams() {
  const { group, ev, config, data, subs, canSeeAll, lastSyncAt } = await load();
  if (!canSeeAll) {
    return notice('Teams', 'The Teams table is for Leads. A Lead can let Scouts see it by turning on “Scouts see everyone’s matches” in Group settings.');
  }
  if (!ev) return notice('Teams', 'The Teams table follows your event. Pick it first.', h('a', { class: 'pill block', href: '#event' }, 'Pick your event'));

  const rows = teamRows(config, subs, data?.teams ?? []);
  const columns = COLUMNS(config);
  // Sort: what this phone last chose, else the group's default (a Group setting).
  const saved = (await getSetting('teamsSort')) ?? {};
  let sort = { key: saved.key ?? group.settings?.teamsSort ?? 'avg', dir: saved.dir ?? null };
  const scouted = rows.filter((r) => r.scouted).length;

  const table = h('table', { class: 'teams-table', style: `--cols: ${columns.length}` });
  function draw() {
    const sorted = sortRows(rows, sort.key, sort.dir ?? undefined);
    const dir = sort.dir ?? (sort.key === 'team' ? 'asc' : 'desc');
    table.replaceChildren(
      h('caption', { class: 'visually-hidden' }, `Teams at ${ev.name}. Tap a column heading to sort.`),
      h('thead', {}, h('tr', {}, columns.map((c) => {
        const active = c.key === sort.key;
        return h('th', { scope: 'col', 'aria-sort': active ? (dir === 'asc' ? 'ascending' : 'descending') : null },
          h('button', { type: 'button', class: `sort${active ? ' on' : ''}`, onclick: () => {
            // Same column: flip the direction. New column: its natural direction.
            sort = active ? { key: c.key, dir: dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: null };
            setSetting('teamsSort', sort);
            draw();
            table.querySelector('th button.on')?.focus();
          } }, c.label, active ? icon(dir === 'asc' ? 'sortUp' : 'sortDown', 14) : null));
      }))),
      h('tbody', {}, sorted.map((r) => h('tr', { class: r.scouted ? '' : 'unscouted' },
        h('th', { scope: 'row' }, h('a', { href: `#team/${r.team}`, class: 'team-link', 'aria-label': `${r.team}${r.name ? `, ${r.name}` : ''}` },
          bumper(r.team))),
        h('td', { class: 'num' }, r.scouted ? String(r.scouted) : h('span', { class: 'not-yet' }, 'None')),
        h('td', { class: 'num strong' }, formatAvg(r.avg)),
        scoringSections(config).map((s) => h('td', { class: 'num' }, formatAvg(r.bySection[s.id])))))));
  }
  draw();

  const el = h('div', { class: 'screen' },
    topbar('Teams'),
    h('main', { class: 'content' },
      h('p', { class: 'group-lede' }, `${ev.name} · ${scouted} of ${rows.length} teams scouted`),
      h('p', { class: 'plain teams-note' }, [
        'Averages are estimated points from your scouts’ taps, without no-shows.',
        lastSyncAt ? ` Up to date as of ${timeAgo(lastSyncAt)}.` : '',
      ].join('')),
      h('div', { class: 'teams-wrap' }, table)),
    await nowScoutingBar(),
  );
  return { el };
}

// ---------- One Team ----------

export async function renderTeam({ param }) {
  const team = Number(param);
  const { ev, config, data, subs, canSeeAll } = await load();
  if (!canSeeAll) return notice(`Team ${team}`, 'Team pages are for Leads, unless a Lead turns on “Scouts see everyone’s matches”.');
  const mine = subs.filter((s) => s.summary?.team === team);
  const [row] = teamRows(config, mine, (data?.teams ?? []).filter((t) => t.team_number === team));
  const name = row?.name;
  const sections = scoringSections(config);

  // Its matches at this event, from the schedule, each with how often it was scouted.
  const matches = (data?.matches ?? []).filter((m) => positionOf(m, team));
  const scoutedIn = (m) => mine.filter((s) => (s.summary?.level ?? 'qual') === m.level && s.summary?.match === m.number).length;

  const cover = h('section', { class: 'now team-cover', 'data-alliance': 'none' },
    h('div', { class: 'now-top' },
      h('a', { class: 'icon-btn', href: '#teams', 'aria-label': 'Back to all teams' }, icon('back')), null),
    h('h1', { class: 'now-hero num', tabindex: '-1' }, team),
    h('p', { class: 'team-cover-name' }, name ?? (data ? 'Not on this event’s team list' : '')),
    h('p', { class: 'now-sub' }, !row?.scouted ? 'Not scouted yet'
      : [`Scouted ${row.scouted} ${row.scouted === 1 ? 'time' : 'times'}`,
        row.noShows ? `${row.noShows} no-show${row.noShows > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')));

  // Averages, laid out like the results screen.
  const averages = row?.played ? h('section', {},
    h('h2', { class: 'section-h' }, 'Average per match'),
    h('dl', { class: 'parts team-parts' },
      sections.map((s) => h('div', { class: 'part' },
        h('dt', { class: 'part-label' }, s.label), h('dd', { class: 'part-value num' }, formatAvg(row.bySection[s.id])))),
      h('div', { class: 'part total' },
        h('dt', { class: 'part-label' }, `Estimated, over ${row.played} ${row.played === 1 ? 'match' : 'matches'}`),
        h('dd', { class: 'part-value num' }, formatAvg(row.avg))))) : null;

  // Every field in the Game config, summed up.
  const summary = mine.length ? fieldSummary(config, mine) : [];
  const bySection = new Map();
  for (const item of summary) {
    if (!bySection.has(item.section)) bySection.set(item.section, []);
    bySection.get(item.section).push(item);
  }
  const details = summary.length ? h('section', {},
    h('h2', { class: 'section-h' }, 'What scouts saw'),
    [...bySection].map(([section, items]) => h('div', { class: 'team-fields' },
      h('h3', { class: 'team-fields-h' }, section),
      h('dl', {}, items.map(fieldRow))))) : null;

  const schedule = matches.length ? h('section', {},
    h('h2', { class: 'section-h' }, 'Matches here'),
    h('ul', { class: 'team-matches' }, matches.map((m) => {
      const pos = positionOf(m, team);
      const n = scoutedIn(m);
      const code = matchCode({ level: m.level, match: m.number });
      return h('li', {},
        h('span', { class: 'num team-match-code' }, code),
        station(positionLabel(pos), pos.replace(/\d/, '')),
        h('span', { class: 'team-match-when' }, m.played ? (m.red_score != null ? `Played ${m.red_score}–${m.blue_score}` : 'Played') : timeOf(m) ?? ''),
        h('span', { class: `team-match-scouted${n ? '' : ' none'}` }, n ? `Scouted${n > 1 ? ` ×${n}` : ''}` : m.played ? 'Not scouted' : ''));
    }))) : null;

  const list = mine.length ? h('section', {},
    h('h2', { class: 'section-h' }, 'Submissions'),
    h('ul', { class: 'submission-list' }, mine.map((s) => h('li', {}, submissionRow(s, mine, true))))) : null;

  const el = h('div', { class: 'screen' },
    cover,
    h('main', { class: 'content' },
      !ev ? h('p', { class: 'plain' }, 'Pick your event to see this team’s matches.') : null,
      averages, details, schedule, list,
      !mine.length && ev ? h('p', { class: 'plain teams-empty' }, 'No one in your group has scouted this team here yet.') : null),
    await nowScoutingBar(),
  );
  return { el };
}

// One field's summary as a definition row: "LEAVE · 4 of 5".
function fieldRow(item) {
  let value;
  if (item.kind === 'average') value = item.value == null ? '—' : `${formatAvg(item.value)} a match`;
  else if (item.kind === 'yes') value = `${item.yes} of ${item.answered}`;
  else if (item.kind === 'choices') value = item.counts.length ? item.counts.map((c) => `${c.label} ${c.count}`).join(' · ') : '—';
  else {
    return h('div', { class: 'team-field texts' },
      h('dt', {}, item.label),
      h('dd', {}, item.texts.length
        ? h('ul', { class: 'team-notes' }, item.texts.map((t) => h('li', {},
          h('span', { class: 'num' }, matchCode(t.sub.summary)), ` ${t.text}`,
          t.sub.summary?.scout ? h('span', { class: 'team-note-by' }, ` · ${t.sub.summary.scout}`) : null)))
        : '—'));
  }
  return h('div', { class: 'team-field' }, h('dt', {}, item.label), h('dd', { class: 'num' }, value));
}
