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
