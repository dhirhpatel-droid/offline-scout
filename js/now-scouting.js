// "What am I scouting?" – used by Home's big block and by the now-scouting
// bar that follows you around while a match is unfinished.
//
// Three cases:
//   draft – a match in progress: resume it
//   next  – the last match was saved: the next one (match + 1) is ready
//   none  – nothing yet: start scouting

import { h, icon } from './ui.js';
import { getDraft, getSetting } from './db.js';
import { matchCode, positionLabel, allianceOf } from './submissions.js';

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
    };
  }
  const carry = await getSetting('nextCarry');
  if (carry?.match) {
    return {
      kind: 'next',
      code: matchCode({ level: carry.level, match: carry.match }),
      position: carry.position,
      alliance: allianceOf(carry.position),
    };
  }
  return { kind: 'none' };
}

// The thin bar shown at the bottom of other screens while a match is unfinished.
export async function nowScoutingBar() {
  const next = await whatsNext();
  if (next.kind !== 'draft') return null;
  const where = [next.code, next.team, next.position && positionLabel(next.position)].filter(Boolean).join(' · ') || 'New match';
  return h('a', { class: 'now-bar', href: '#match', 'data-alliance': next.alliance ?? 'none' },
    h('span', { class: 'now-bar-text' },
      h('span', { class: 'now-bar-label' }, 'Unfinished match'),
      h('span', { class: 'num now-bar-where' }, where)),
    h('span', { class: 'now-bar-go' }, 'Resume', icon('next', 18)));
}
