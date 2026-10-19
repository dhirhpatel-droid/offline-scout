// "What am I scouting?" – used by Home's big block and by the now-scouting
// bar that follows you around while a match is unfinished.
//
// Four cases:
//   draft    – a match in progress: resume it
//   assigned – your Lead gave you Assignments: the next one (1 or 2 Teams)
//   next     – the last match was saved: the next one (match + 1) is ready
//   none     – nothing yet: start scouting

import { h, icon } from './ui.js';
import { getDraft, getSetting, listSubmissions } from './db.js';
import { matchCode, positionLabel, allianceOf } from './submissions.js';
import { currentEventData, cachedPlan } from './events.js';
import { currentGroup, cachedProfile } from './account.js';
import { findMatch, teamAt, timeOf } from './schedule.js';
import { assignmentsFor, upcoming, byMatch } from './assignments.js';

// My Assignments still to do at the Current event, grouped by match.
// Works offline: the plan and schedule are copies saved on this phone.
export async function myPlan() {
  const [group, profile, eventData, all] = await Promise.all([
    currentGroup(), cachedProfile(), currentEventData(), listSubmissions(),
  ]);
  const ev = group?.currentEvent;
  if (!ev || !profile?.id) return { assigned: false, todo: [] };
  const plan = await cachedPlan(group.id, ev.id);
  const mine = assignmentsFor({ scoutId: profile.id, shifts: plan.shifts, watches: plan.watches, matches: eventData?.matches ?? [] });
  const mySubs = all.filter((s) => s.scoutId === profile.id || !s.scoutId);
  const todo = byMatch(upcoming(mine, mySubs)).map((g) => ({
    ...g,
    code: matchCode({ level: g.level, match: g.number }),
    time: timeOf(findMatch(eventData?.matches, g.level, g.number)),
  }));
  return { assigned: mine.length > 0, total: mine.length, todo };
}

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
  // Assignments come first: the Lead planned these.
  const plan = await myPlan();
  if (plan.todo.length) {
    const [first, ...later] = plan.todo;
    return {
      kind: 'assigned',
      items: first.items,
      code: first.code,
      time: first.time,
      team: first.items.map((a) => a.team).filter(Boolean).join(' + ') || null,
      position: first.items[0].position,
      // Red 1 + Blue 2? Then no single alliance colour (the words say both).
      alliance: sharedAlliance(first.items),
      later,
    };
  }
  if (plan.assigned) return { kind: 'all-done', total: plan.total };

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

// The alliance all these Assignments share, or null if they're mixed.
export function sharedAlliance(items) {
  const sides = new Set(items.map((a) => allianceOf(a.position)));
  return sides.size === 1 ? [...sides][0] : null;
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
