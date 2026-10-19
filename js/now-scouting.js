// "What am I scouting?" – used by Home's big block and by the now-scouting
// bar that follows you around while a match is unfinished.
//
// Three cases:
//   draft – a match in progress: resume it
//   next  – the last match was saved: the next one (match + 1) is ready
//   none  – nothing yet: start scouting

import { h, icon } from './ui.js';
import { getDraft, getSetting, listSubmissions } from './db.js';
import { matchCode, positionLabel, allianceOf } from './submissions.js';
import { currentEventData } from './events.js';
import { findMatch, teamAt, timeOf } from './schedule.js';

export async function whatsNext() {
  const draft = await getDraft();
  if (draft) {
    const s = draft.summary ?? {};
    return {
      kind: 'draft',
      // null until the match number is filled in, so screens can say "New match"
      code: s.match ? matchCode(s) : null,
      team: s.team,
      position: s.position,
      alliance: s.alliance,
      points: draft.estimatedPoints ?? 0,
      started: new Date(draft.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
  }
  const [carry, eventData] = await Promise.all([getSetting('nextCarry'), currentEventData()]);
  // The schedule (if any) says which team is in that match and position, and when.
  const withSchedule = (next, level, match) => {
    const m = findMatch(eventData?.matches, level, match);
    return { ...next, team: teamAt(m, next.position), time: timeOf(m) };
  };
  if (carry?.match) {
    return withSchedule({
      kind: 'next',
      code: matchCode({ level: carry.level, match: carry.match }),
      position: carry.position,
      alliance: allianceOf(carry.position),
    }, carry.level, carry.match);
  }
  // No carry-over (e.g. a new phone): continue from the last saved match.
  const [last] = await listSubmissions();
  if (last?.summary?.match) {
    return withSchedule({
      kind: 'next',
      code: matchCode({ level: last.summary.level, match: last.summary.match + 1 }),
      position: last.summary.position,
      alliance: allianceOf(last.summary.position),
    }, last.summary.level, last.summary.match + 1);
  }
  return { kind: 'none' };
}

// The thin bar shown at the bottom of other screens while a match is unfinished.
export async function nowScoutingBar() {
  const next = await whatsNext();
  if (next.kind !== 'draft') return null;
  const where = [next.code, next.team, next.position && positionLabel(next.position)].filter(Boolean).join(' · ');
  return h('a', { class: 'now-bar', href: '#match', 'data-alliance': next.alliance ?? 'none',
    'aria-label': `Resume your unfinished match${where ? `, ${where}` : ''}, started ${next.started}` },
    h('span', { class: 'now-bar-text' },
      h('span', { class: 'num now-bar-where' }, where || 'Unfinished match'),
      h('span', { class: 'now-bar-label' }, `Unfinished · started ${next.started}`)),
    h('span', { class: 'now-bar-go' }, 'Resume', icon('next', 18)));
}
