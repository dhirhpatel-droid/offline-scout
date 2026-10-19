// Data checks (#checks), for Leads: Submissions that look wrong at the
// Current event, each with what looks off and buttons to open the
// Submissions involved. Nothing here changes data; the Lead looks and decides.

import { h, icon } from '../ui.js';
import { matchCode } from '../submissions.js';
import { load } from './teams.js';
import { dataChecks } from '../data-checks.js';
import { nowScoutingBar } from '../now-scouting.js';

const KINDS = [
  ['disagree', 'Scouts disagree', 'Two scouts watched the same team in the same match and saw different things.'],
  ['score', 'Far from the official score', 'Every robot on the alliance was scouted, but the estimates don’t add up to the real score.'],
  ['impossible', 'Can’t be right', 'A team or match that doesn’t fit the event’s schedule.'],
];

export const SENSITIVITY_WORDS = [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['strict', 'Strict']];

// Buttons to open each Submission a check is about: "Open Maya's Q18 · 23810".
export function checkButtons(check, byId) {
  const subs = check.subs.map((id) => byId.get(id)).filter(Boolean);
  return h('div', { class: 'check-actions' }, subs.map((s) => h('a', { class: 'small-btn', href: `#match/${s.id}` },
    `Open ${s.summary?.scout ? `${s.summary.scout}’s` : ''} ${matchCode(s.summary)} · ${s.summary?.team ?? '?'}`.replace(/\s+/g, ' ').trim())));
}

export async function renderChecks() {
  const { group, ev, config, data, subs, canSeeAll } = await load();
  const header = h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
    h('h1', { tabindex: '-1' }, 'Data checks'));
  if (!canSeeAll || !ev) {
    return { el: h('div', { class: 'screen' }, header, h('main', { class: 'content' },
      h('p', { class: 'plain teams-empty' }, !ev ? 'Data checks follow your event. Pick it first.' : 'Data checks are for Leads.'))) };
  }
  const sensitivity = group.settings?.checkSensitivity ?? 'normal';
  const checks = dataChecks(config, subs, data ?? {}, sensitivity);
  const byId = new Map(subs.map((s) => [s.id, s]));

  const sections = KINDS.map(([kind, title, about]) => {
    const mine = checks.filter((c) => c.kind === kind);
    if (!mine.length) return null;
    return h('section', {},
      h('h2', { class: 'section-h' }, `${title} (${mine.length})`),
      h('p', { class: 'plain checks-about' }, about),
      h('ul', { class: 'checks' }, mine.map((c) => h('li', { class: `check ${c.kind}` },
        h('p', { class: 'check-title' }, c.title),
        h('p', { class: 'check-text' }, c.text),
        checkButtons(c, byId)))));
  });

  const word = SENSITIVITY_WORDS.find(([k]) => k === sensitivity)?.[1] ?? 'Normal';
  const el = h('div', { class: 'screen' },
    header,
    h('main', { class: 'content' },
      h('p', { class: 'group-lede' }, checks.length
        ? `${ev.name} · ${checks.length} to look at`
        : `${ev.name} · nothing looks off`),
      h('p', { class: 'plain teams-note' }, `Checks are ${word.toLowerCase()} (a Group setting). They never change anything: open a match to fix it, or leave it if it’s right.`),
      checks.length ? sections : h('p', { class: 'plain teams-empty' }, 'When two scouts disagree, a total is far from the official score, or a team doesn’t fit the schedule, it shows up here.')),
    await nowScoutingBar(),
  );
  return { el };
}
