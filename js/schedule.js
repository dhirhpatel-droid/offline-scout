// Reading an Event's schedule. Pure functions, so they're easy to test
// (tests/schedule.test.js). A match row looks like the server's
// event_matches: { level, number, game, scheduled_at, red: [...], blue: [...] }.

import { allianceOf } from './submissions.js';

// The season a game config is for: "2026–27" → 2026.
export function seasonOf(config) {
  return Number.parseInt(String(config?.season ?? ''), 10) || null;
}

// The match with this level and number (for playoffs, the latest game).
export function findMatch(matches, level, number) {
  const found = (matches ?? []).filter((m) => m.level === (level ?? 'qual') && m.number === Number(number));
  return found.sort((a, b) => b.game - a.game)[0] ?? null;
}

// "red2" → the team in Red 2 for this match, or null.
export function teamAt(match, position) {
  if (!match || !position) return null;
  const side = allianceOf(position);
  const index = Number(position.slice(side.length)) - 1;
  return match[side]?.[index] ?? null;
}

// Where a team plays in a match: "blue1", or null if it isn't in it.
export function positionOf(match, team) {
  for (const side of ['red', 'blue']) {
    const i = (match?.[side] ?? []).indexOf(Number(team));
    if (i >= 0) return `${side}${i + 1}`;
  }
  return null;
}

// "10:42 AM" from a scheduled time (in the phone's own time zone, which is
// the event's when you're at it).
export function timeOf(match) {
  if (!match?.scheduled_at) return null;
  return new Date(match.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Is this team on the event's team list? (Unknown list → don't complain.)
export function isAtEvent(teams, team) {
  if (!teams?.length || !team) return true;
  return teams.some((t) => t.team_number === Number(team));
}
