// Data checks (GLOSSARY.md): flags shown to Leads when Submissions look
// wrong. Pure functions, tested in tests/data-checks.test.js. A check never
// changes data: it says what looks off and which Submissions to open, and
// the Lead decides (PRODUCT.md: show the data, let humans decide).
//
// Three kinds:
//   disagree   – two Submissions for the same Team and match don't agree
//   score      – an alliance's scouted points add up far from its official score
//   impossible – a value that can't be right (team not at the event, not in
//                that match, a match that isn't in the schedule…)

import { estimatePoints, fieldKey } from './scoring.js';
import { positionOf } from './schedule.js';
import { positionLabel, matchCode } from './submissions.js';

// How sensitive the checks are: a Group setting (checkSensitivity).
//   points  – how far apart two Scouts' estimates can be for one robot
//   score   – how far an alliance total can be from the official score:
//             the larger of a number of points and a share of the score
export const SENSITIVITY = {
  relaxed: { points: 20, score: { points: 40, share: 0.5 } },
  normal: { points: 12, score: { points: 25, share: 0.35 } },
  strict: { points: 6, score: { points: 15, share: 0.2 } },
};

const noShowKey = (config) => {
  for (const s of config.sections) for (const f of s.fields) if (f.role === 'noShow') return fieldKey(s.id, f.id);
  return null;
};
const levelOf = (s) => s.summary?.level ?? 'qual';
const scoutOf = (s) => s.summary?.scout ?? 'A scout';

// All checks for one Event, sorted by match.
// subs: saved Submissions for this group and Event; event: { teams, matches }.
export function dataChecks(config, subs, event = {}, sensitivity = 'normal') {
  const limits = SENSITIVITY[sensitivity] ?? SENSITIVITY.normal;
  const out = [...disagreements(config, subs, limits), ...scoreGaps(config, subs, event.matches ?? [], limits),
    ...impossible(config, subs, event)];
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'qual' ? -1 : 1) || (a.number ?? 0) - (b.number ?? 0));
}

// Two (or more) Scouts on the same Team in the same match who disagree: on
// whether it showed up, on a Yes/No that scores, or on the points by more
// than the limit.
export function disagreements(config, subs, limits = SENSITIVITY.normal) {
  const groups = new Map();
  for (const s of subs) {
    if (!s.summary?.team || !s.summary?.match) continue;
    const key = `${levelOf(s)}:${s.summary.match}:${s.summary.team}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const noShow = noShowKey(config);
  const scoringToggles = config.sections.flatMap((sec) => sec.fields
    .filter((f) => f.type === 'toggle' && f.points).map((f) => ({ key: fieldKey(sec.id, f.id), label: f.label })));
  const out = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first] = group;
    const reasons = [];
    const shows = group.map((s) => s.values?.[noShow] === true);
    if (noShow && shows.some(Boolean) && !shows.every(Boolean)) {
      reasons.push(`${group.filter((s, i) => shows[i]).map(scoutOf).join(' and ')} said it didn’t show up`);
    } else {
      const pts = group.map((s) => estimatePoints(config, s.values ?? {}));
      if (Math.max(...pts) - Math.min(...pts) > limits.points) {
        reasons.push(group.map((s, i) => `${scoutOf(s)} ${pts[i]}`).join(', ') + ' est. pts');
      }
      for (const t of scoringToggles) {
        const answers = group.map((s) => s.values?.[t.key] === true);
        if (answers.some(Boolean) && !answers.every(Boolean)) {
          reasons.push(`${t.label}: ${group.map((s, i) => `${scoutOf(s)} ${answers[i] ? 'yes' : 'no'}`).join(', ')}`);
        }
      }
    }
    if (!reasons.length) continue;
    out.push({
      kind: 'disagree', level: levelOf(first), number: first.summary.match, team: first.summary.team,
      title: `${matchCode(first.summary)} · ${first.summary.team}: scouts disagree`,
      text: reasons.join('. ') + '.',
      subs: group.map((s) => s.id),
    });
  }
  return out;
}

// For each played match with an official score: when every robot of an
// alliance was scouted, does their Estimated points add up anywhere near the
// official score? (Some points are never scouted, like fouls or alliance
// bonuses, so a gap is normal; a big one may mean a missed or extra tap.)
export function scoreGaps(config, subs, matches, limits = SENSITIVITY.normal) {
  const out = [];
  for (const m of matches) {
    if (!m.played || m.red_score == null) continue;
    for (const side of ['red', 'blue']) {
      const official = m[`${side}_score`];
      const teams = m[side] ?? [];
      const perTeam = teams.map((team) => {
        const here = subs.filter((s) => s.summary?.team === team && levelOf(s) === m.level && s.summary?.match === m.number);
        if (!here.length) return null;
        // Two Scouts on one robot: their average.
        return here.reduce((sum, s) => sum + estimatePoints(config, s.values ?? {}), 0) / here.length;
      });
      if (!teams.length || perTeam.some((p) => p == null)) continue; // not every robot scouted
      const scouted = Math.round(perTeam.reduce((a, b) => a + b, 0));
      const allowed = Math.max(limits.score.points, Math.round(official * limits.score.share));
      if (Math.abs(scouted - official) <= allowed) continue;
      const code = matchCode({ level: m.level, match: m.number });
      out.push({
        kind: 'score', level: m.level, number: m.number, alliance: side, teams,
        title: `${code} · ${side === 'red' ? 'Red' : 'Blue'} alliance: ${scouted} scouted, ${official} official`,
        text: `Your scouts’ estimates for ${teams.join(' and ')} add up to ${scouted}; the official score was ${official}. `
          + 'Fouls and alliance bonuses aren’t scouted, so some gap is normal. This one is big: a tap may be missing or extra.',
        subs: subs.filter((s) => teams.includes(s.summary?.team) && levelOf(s) === m.level && s.summary?.match === m.number).map((s) => s.id),
      });
    }
  }
  return out;
}

// Values that can't be right, checked against the Event's teams and schedule
// and the Game config's limits.
export function impossible(config, subs, { teams = [], matches = [] } = {}) {
  const out = [];
  const atEvent = new Set(teams.map((t) => t.team_number));
  const lastQual = Math.max(0, ...matches.filter((m) => m.level === 'qual').map((m) => m.number));
  for (const s of subs) {
    const { team, match, position } = s.summary ?? {};
    const level = levelOf(s);
    const code = matchCode(s.summary ?? {});
    const flag = (title, text) => out.push({ kind: 'impossible', level, number: match, team, title, text, subs: [s.id] });

    if (team && atEvent.size && !atEvent.has(team)) {
      flag(`${code} · ${team} isn’t at this event`, `${scoutOf(s)} entered team ${team}, which isn’t on the event’s team list. Probably a typo in the team number.`);
      continue;
    }
    const m = match ? matches.find((x) => x.level === level && x.number === match) : null;
    if (level === 'qual' && match && lastQual && !m) {
      flag(`${code} isn’t in the schedule`, `Qualifications end at Q${lastQual}. Check the match number.`);
      continue;
    }
    if (m && team) {
      const actual = positionOf(m, team);
      const scheduled = position ? (m[position.replace(/\d/, '')] ?? [])[Number(position.slice(-1)) - 1] : null;
      if (!actual) {
        flag(`${code} · ${team} isn’t in this match`,
          `${scoutOf(s)} entered ${team}${scheduled ? `, but the schedule has ${scheduled} at ${positionLabel(position)}` : ''}. Check the match or team number.`);
        continue;
      }
      if (position && actual !== position) {
        flag(`${code} · ${team} was at ${positionLabel(actual)}, not ${positionLabel(position)}`,
          `${scoutOf(s)} marked ${positionLabel(position)}. The team is right; the position is probably a mis-tap.`);
      }
    }
    // Numbers outside the limits a Game config gives ("min" / "max").
    for (const sec of config.sections) {
      for (const f of sec.fields) {
        const v = s.values?.[fieldKey(sec.id, f.id)];
        if (typeof v !== 'number' || f.role) continue;
        if ((f.max != null && v > f.max) || (f.min != null && v < f.min) || v < 0) {
          flag(`${code} · ${team ?? ''}: ${f.label} ${v}`, `${f.label} can’t be ${v} in ${sec.label}${f.max != null ? ` (the most is ${f.max})` : ''}.`);
        }
      }
    }
  }
  return out;
}

// Checks about one Team (for its page).
export const checksFor = (checks, team) => checks.filter((c) => c.team === team
  || (c.kind === 'score' && c.teams.includes(team)));
