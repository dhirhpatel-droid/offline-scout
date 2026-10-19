// Working out Assignments on the phone (GLOSSARY.md). Pure functions, tested
// in tests/assignments.test.js.
//
// A Lead stores Position shifts ("Red 1 for Q1–Q20") and Team watches
// ("follow 23810"). With the Event's schedule, each phone turns them into a
// list of Assignments: "watch <team> in <match> at <position>". Nothing about
// Assignments is stored, so they work offline and follow schedule changes.

import { findMatch, teamAt, positionOf } from './schedule.js';

const key = (a) => `${a.level}:${a.number}:${a.team ?? a.position}`;
const order = (a, b) => (a.level === b.level ? 0 : a.level === 'qual' ? -1 : 1) || a.number - b.number;

// All of one Scout's Assignments at the Current event, in match order.
export function assignmentsFor({ scoutId, shifts = [], watches = [], matches = [] }) {
  const out = new Map();
  const add = (a) => {
    const k = key(a);
    const existing = out.get(k);
    out.set(k, existing ? { ...existing, source: 'both' } : a);
  };

  for (const s of shifts.filter((x) => x.scout_id === scoutId)) {
    for (let n = s.from_match; n <= s.to_match; n++) {
      const m = findMatch(matches, 'qual', n);
      // Before the schedule is out we still know the match and position.
      if (matches.length && !m) continue; // past the end of the schedule
      add({
        level: 'qual', number: n, position: s.position, team: teamAt(m, s.position),
        scheduled_at: m?.scheduled_at ?? null, played: Boolean(m?.played), source: 'shift',
      });
    }
  }

  for (const w of watches.filter((x) => x.scout_id === scoutId)) {
    for (const m of matches) {
      const position = positionOf(m, w.team_number);
      if (!position) continue;
      // Playoff series: one Assignment per series (its latest game).
      if (m.level === 'playoff' && findMatch(matches, 'playoff', m.number) !== m) continue;
      add({
        level: m.level, number: m.number, position, team: w.team_number,
        scheduled_at: m.scheduled_at ?? null, played: Boolean(m.played), source: 'watch',
      });
    }
  }

  return [...out.values()].sort(order);
}

// Has this Scout already saved a Submission for this Assignment?
export function isDone(a, mySubmissions) {
  return mySubmissions.some((s) => !s.deletedAt && s.submittedAt
    && (s.summary?.level ?? 'qual') === a.level && s.summary?.match === a.number
    && (a.team ? s.summary?.team === a.team : s.summary?.position === a.position));
}

// What's still to do: not saved yet and not already played.
export function upcoming(assignments, mySubmissions) {
  return assignments.filter((a) => !a.played && !isDone(a, mySubmissions));
}

// Assignments grouped by match: [{ level, number, items: [a, a] }]. Two items
// means the Scout watches two Teams at once in that match.
export function byMatch(assignments) {
  const groups = [];
  for (const a of assignments) {
    const last = groups.at(-1);
    if (last && last.level === a.level && last.number === a.number) last.items.push(a);
    else groups.push({ level: a.level, number: a.number, items: [a] });
  }
  return groups;
}

// Every Scout's Assignments from the plan, each tagged with its scoutId.
function everyonesAssignments(plan, matches) {
  const scouts = new Set([...plan.shifts, ...plan.watches].map((x) => x.scout_id));
  return [...scouts].flatMap((scoutId) =>
    assignmentsFor({ scoutId, ...plan, matches }).map((a) => ({ ...a, scoutId })));
}

// Coverage of the plan per qualification match: how many positions someone
// is assigned to watch. [{ number, covered, total, played }]
// (Used by Home's Lead row.)
export function coverage(plan, matches) {
  const all = everyonesAssignments(plan, matches);
  return matches.filter((m) => m.level === 'qual').map((m) => ({
    number: m.number,
    played: Boolean(m.played),
    total: m.red.length + m.blue.length,
    covered: new Set(all.filter((a) => a.level === 'qual' && a.number === m.number).map((a) => a.position)).size,
  }));
}

// The Coverage grid on the Assignments screen: for each qualification match
// still to play, who watches each station.
// → [{ number, scheduled_at, scouts: { red1: ['u-maya'], red2: [], ... }, doubled: ['u-dhir'] }]
// An empty list means that station is open. doubled = Scouts on two stations
// in that match (allowed, but worth seeing). The Lead decides what to do
// about either; the app never fills anything in.
export function coverageGrid(plan, matches, positions) {
  const all = everyonesAssignments(plan, matches);
  return matches
    .filter((m) => m.level === 'qual' && !m.played)
    .sort((a, b) => a.number - b.number)
    .map((m) => {
      const scouts = Object.fromEntries(positions.map((p) => [p, [...new Set(all
        .filter((a) => a.level === 'qual' && a.number === m.number && a.position === p)
        .map((a) => a.scoutId))]]));
      const ids = Object.values(scouts).flat();
      const doubled = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      return { number: m.number, scheduled_at: m.scheduled_at ?? null, scouts, doubled };
    });
}

// Short labels for the grid's cells: each member's first letter, or more
// letters when two names start the same ("Maya" and "Max" → "May", "Max").
// members: [{ user_id, display_name }] → Map(user_id → label)
export function shortNames(members) {
  const names = members.map((m) => (m.display_name ?? '').trim() || '?');
  const labels = new Map();
  members.forEach((m, i) => {
    const name = names[i];
    let n = 1;
    // Grow until no other member's name starts with the same letters.
    while (n < name.length && names.some((other, j) => j !== i
      && other.slice(0, n).toLowerCase() === name.slice(0, n).toLowerCase())) n++;
    labels.set(m.user_id, name[0].toUpperCase() + name.slice(1, n));
  });
  // Two members with the very same name: number them ("Sam", "Sam 2").
  const seen = new Map();
  for (const [id, label] of labels) {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    if (count > 1) labels.set(id, `${label} ${count}`);
  }
  return labels;
}

// Used by Home for the Lead's row, the same count as the Coverage grid:
// "5 open positions in Q18–Q20 · first Q18 Blue 2".
export function planSummary(plan, matches) {
  const scouts = new Set([...plan.shifts, ...plan.watches].map((x) => x.scout_id));
  if (!scouts.size) return null;
  const left = coverage(plan, matches).filter((c) => !c.played);
  if (!left.length) return `${scouts.size} ${scouts.size === 1 ? 'scout' : 'scouts'} assigned`;
  const range = left.length > 1 ? `Q${left[0].number}–Q${left.at(-1).number}` : `Q${left[0].number}`;
  const open = left.reduce((sum, c) => sum + (c.total - c.covered), 0);
  if (!open) return `Every position covered in ${range}`;
  const first = left.find((c) => c.covered < c.total);
  return `${open} open ${open === 1 ? 'position' : 'positions'} in ${range} · first Q${first.number}`;
}
