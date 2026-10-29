// Data checks (#checks), for Leads: Submissions that look wrong at the
// Current event, each with what looks off and buttons to open the
// Submissions involved. Nothing here changes data; the Lead looks and decides.

import { backHref } from '../nav.js';
import { h, icon, topbar } from '../ui.js';
import { matchCode } from '../submissions.js';
import { load } from './teams.js';
import { dataChecks, openChecks, checkKey } from '../data-checks.js';
import { getSetting, setSetting } from '../db.js';
import { nowScoutingBar } from '../now-scouting.js';

const KINDS = [
  ['disagree', 'Scouts disagree', 'Two scouts watched the same team in the same match and saw different things.'],
  ['score', 'Far from the official score', 'Every robot on the alliance was scouted, but the estimates don’t add up to the real score.'],
  ['impossible', 'Can’t be right', 'A team or match that doesn’t fit the event’s schedule.'],
];

export const SENSITIVITY_WORDS = [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['strict', 'Strict']];

// Buttons to open each Submission a check is about. Short on screen
// ("Maya’s", or the team when it's one scout's), full for screen readers.
export function checkButtons(check, byId, extra = null) {
  const subs = check.subs.map((id) => byId.get(id)).filter(Boolean);
  const scouts = new Set(subs.map((s) => s.summary?.scout));
  return h('div', { class: 'check-actions' },
    h('div', { class: 'check-open' }, subs.map((s) => {
      const full = `Open ${s.summary?.scout ? `${s.summary.scout}’s` : 'the'} ${matchCode(s.summary)}, team ${s.summary?.team ?? 'not set'}`;
      const shown = scouts.size === subs.length && s.summary?.scout ? `${s.summary.scout}’s` : `${matchCode(s.summary)} · ${s.summary?.team ?? '?'}`;
      return h('a', { class: 'small-btn', href: `#match/${s.id}`, 'aria-label': full }, `Open ${shown}`);
    })),
    extra);
}

// Keys of the checks this phone marked "Looks right", per group.
export const okKeys = async (groupId) => (await getSetting(`checksOk:${groupId}`)) ?? [];

// "Looks right" / "Look again": remembered on this phone, then redraws.
export function okButton(check, byId, groupId, ok, on = true) {
  return h('button', { class: 'check-ok', type: 'button', 'aria-label': `${on ? 'Looks right' : 'Look again'}: ${check.title}`,
    onclick: async () => {
      const key = checkKey(check, byId);
      await setSetting(`checksOk:${groupId}`, on ? [...ok, key] : ok.filter((k) => k !== key));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } }, icon(on ? 'check' : 'undo', 18), on ? 'Looks right' : 'Look again');
}

export async function renderChecks() {
  const { group, ev, config, data, subs, canSeeAll } = await load();
  const header = topbar('Data checks', backHref('#home'));
  if (!canSeeAll || !ev) {
    return { el: h('div', { class: 'screen' }, header, h('main', { class: 'content' },
      h('p', { class: 'plain teams-empty' }, !ev ? 'Data checks follow your event’s schedule, so pick your event first.' : 'Data checks are for Leads.'),
      !ev ? h('a', { class: 'pill block', href: '#event' }, 'Pick your event') : null)) };
  }
  const sensitivity = group.settings?.checkSensitivity ?? 'normal';
  const all = dataChecks(config, subs, data ?? {}, sensitivity);
  const byId = new Map(subs.map((s) => [s.id, s]));
  const ok = await okKeys(group.id);
  const checks = openChecks(all, ok, byId);
  const marked = all.filter((c) => !checks.includes(c));
  const item = (c, on, short) => h('li', { class: `check ${c.kind}` },
    h('h3', { class: 'check-title' }, short ? c.short ?? c.title : c.title),
    h('p', { class: 'check-text' }, c.text),
    checkButtons(c, byId, okButton(c, byId, group.id, ok, on)));

  const sections = KINDS.map(([kind, title, about]) => {
    const mine = checks.filter((c) => c.kind === kind);
    if (!mine.length) return null;
    return h('section', {},
      h('h2', { class: 'section-h' }, `${title} (${mine.length})`),
      h('p', { class: 'plain checks-about' }, about),
      h('ul', { class: 'checks' }, mine.map((c) => item(c, true, true))));
  });

  const word = SENSITIVITY_WORDS.find(([k]) => k === sensitivity)?.[1] ?? 'Normal';
  const el = h('div', { class: 'screen' },
    header,
    h('main', { class: 'content' },
      h('p', { class: 'group-lede' }, checks.length
        ? `${ev.name} · ${checks.length} to look at`
        : `${ev.name} · nothing looks off`),
      // One line before the checks: how picky they are, and where to change it.
      h('p', { class: 'plain teams-note' }, 'Sensitivity ', h('strong', {}, word), ' · ', h('a', { href: '#group' }, 'change')),
      checks.length ? sections : h('p', { class: 'plain teams-empty' }, 'Something shows up here when two scouts disagree, when an alliance’s estimated points are far from its official score, or when a team doesn’t fit the schedule. Checks never change anything: you open the match and decide.'),
      marked.length ? h('details', { class: 'team-list' },
        h('summary', {}, `Marked right on this phone (${marked.length})`, icon('next', 18)),
        h('ul', { class: 'checks' }, marked.map((c) => item(c, false, false)))) : null),
    await nowScoutingBar(),
  );
  return { el };
}
