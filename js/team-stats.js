// The Lead views (Milestone 6): numbers about each Team, worked out on the
// phone from the Submissions it has. Pure functions, tested in
// tests/team-stats.test.js. Nothing here makes a decision: it only counts
// and averages, so the Lead can read the data and decide (PRODUCT.md).

import { pointsBySection, estimatePoints, fieldKey } from './scoring.js';

// The Submissions that count for a group at an Event: saved (not Drafts),
// not deleted, and for this group and Event.
export function forEvent(subs, { groupId, eventId }) {
  return subs.filter((s) => s.submittedAt && !s.deletedAt
    && (!s.groupId || s.groupId === groupId)
    && s.eventId === eventId);
}

// The sections that score points (Auto, Teleop, Endgame for BIOBUZZ), from
// the Game config, so FRC gets its own periods with no code change.
export function scoringSections(config) {
  return config.sections.filter((s) => s.fields.some((f) => f.points));
}

const isNoShow = (config, sub) => config.sections.some((s) => s.fields.some((f) =>
  f.role === 'noShow' && sub.values?.[fieldKey(s.id, f.id)] === true));

const average = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

// One row per Team: every Team at the Event (so unscouted ones show up too)
// plus any other Team someone scouted.
//   scouted  – how many Submissions (this is Coverage, GLOSSARY.md)
//   played   – of those, how many the robot actually played (not a no-show)
//   avg      – average Estimated points over the matches it played
//   bySection – the same average per scoring period
// No-shows are left out of the averages (a robot that didn't come out tells
// you nothing about how it scores) and counted on their own instead.
export function teamRows(config, subs, teams = []) {
  const names = new Map(teams.map((t) => [t.team_number, t.team_name ?? null]));
  const numbers = new Set([...names.keys(), ...subs.map((s) => s.summary?.team).filter(Boolean)]);
  const sections = scoringSections(config);
  return [...numbers].map((team) => {
    const mine = subs.filter((s) => s.summary?.team === team);
    const played = mine.filter((s) => !isNoShow(config, s));
    const parts = played.map((s) => pointsBySection(config, s.values ?? {}));
    return {
      team,
      name: names.get(team) ?? null,
      scouted: mine.length,
      played: played.length,
      noShows: mine.length - played.length,
      avg: average(played.map((s) => estimatePoints(config, s.values ?? {}))),
      bySection: Object.fromEntries(sections.map((sec) => [sec.id, average(parts.map((p) => p[sec.id]))])),
    };
  });
}

// Sorting the All Teams table. key: 'avg' | 'team' | 'scouted' | a section id.
// Teams with no number to sort by (never scouted) always go last.
export function sortRows(rows, key = 'avg', dir = key === 'team' ? 'asc' : 'desc') {
  const value = (r) => (key === 'team' ? r.team : key === 'scouted' ? r.scouted : key === 'avg' ? r.avg : r.bySection[key]);
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return a.team - b.team;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sign || a.team - b.team;
  });
}

// "23.5" → "23.5", 23 → "23", null → "—" (one decimal is plenty for a Lead).
export function formatAvg(n) {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Every field of the Game config, summed up over one Team's Submissions,
// in the config's order. The kind says how to show it:
//   average – counters ("HIVE TIPs: 2.3 a match")
//   yes     – Yes/No ("LEAVE: 4 of 5")
//   choices – pick-one and ratings ("Driver skill: Good 3, Great 1")
//   texts   – written notes, each with its match
// Fields that only describe the Submission (scout, match, team, position)
// are skipped: they're shown elsewhere on the Team page.
export function fieldSummary(config, subs) {
  const out = [];
  for (const section of config.sections) {
    for (const field of section.fields) {
      if (field.role && field.role !== 'noShow') continue;
      const key = fieldKey(section.id, field.id);
      const answered = subs.filter((s) => s.values?.[key] !== undefined && s.values?.[key] !== null && s.values?.[key] !== '');
      const base = { section: section.label, label: field.label, answered: answered.length, of: subs.length };
      if (field.type === 'counter') {
        out.push({ ...base, kind: 'average', value: average(answered.map((s) => Number(s.values[key]) || 0)) });
      } else if (field.type === 'toggle') {
        // A Yes/No left untouched means No, so it counts out of every Submission.
        out.push({ ...base, kind: 'yes', answered: subs.length, yes: answered.filter((s) => s.values[key] === true).length });
      } else if (field.type === 'choice' || field.type === 'rating') {
        const options = field.type === 'rating'
          ? Array.from({ length: field.max - field.min + 1 }, (_, i) => ({
            value: field.min + i, label: field.labels?.[i] ?? String(field.min + i) }))
          : field.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
        out.push({ ...base, kind: 'choices',
          counts: options.map((o) => ({ label: o.label, count: answered.filter((s) => s.values[key] === o.value).length }))
            .filter((c) => c.count) });
      } else if (field.type === 'notes' || field.type === 'text') {
        out.push({ ...base, kind: 'texts',
          texts: answered.map((s) => ({ text: String(s.values[key]), sub: s })) });
      }
    }
  }
  return out;
}
