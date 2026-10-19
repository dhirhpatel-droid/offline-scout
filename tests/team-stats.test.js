import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forEvent, teamRows, sortRows, formatAvg, fieldSummary, scoringSections, unlinked } from '../js/team-stats.js';

const config = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));

// A saved Submission for a team, with some values.
const sub = (team, values = {}, extra = {}) => ({
  id: crypto.randomUUID(), groupId: 'g1', eventId: 'e1', submittedAt: '2026-11-21T14:00:00Z',
  summary: { team, match: 1, level: 'qual' }, values, ...extra,
});

test('forEvent keeps saved, not deleted Submissions for this group and Event', () => {
  const subs = [
    sub(1), sub(2, {}, { submittedAt: null }), sub(3, {}, { deletedAt: 'x' }),
    sub(4, {}, { eventId: 'other' }), sub(5, {}, { groupId: 'g2' }),
  ];
  assert.deepEqual(forEvent(subs, { groupId: 'g1', eventId: 'e1' }).map((s) => s.summary.team), [1]);
});

test('scoring sections come from the config', () => {
  assert.deepEqual(scoringSections(config).map((s) => s.id), ['auto', 'teleop', 'end']);
});

test('teamRows: averages skip no-shows, unscouted Teams are listed', () => {
  const subs = [
    sub(23810, { 'auto.leave': true, 'auto.hiveTips': 1 }), // 3 + 20 = 23
    sub(23810, { 'teleop.flower': 2, 'end.park': true }), // 4 + 5 = 9
    sub(23810, { 'pre.noShow': true }),
  ];
  const rows = teamRows(config, subs, [{ team_number: 23810, team_name: 'A' }, { team_number: 16012 }]);
  const a = rows.find((r) => r.team === 23810);
  assert.equal(a.scouted, 1); // one match (match 1)
  assert.equal(a.submissions, 3);
  assert.equal(a.matches, 1); // both played Submissions are for match 1
  assert.equal(a.noShows, 1);
  assert.equal(a.avg, 16);
  assert.deepEqual(a.bySection, { auto: 11.5, teleop: 2, end: 2.5 });
  const b = rows.find((r) => r.team === 16012);
  assert.equal(b.scouted, 0);
  assert.equal(b.avg, null);
});

test('sortRows puts unscouted last and breaks ties by team number', () => {
  const rows = [
    { team: 3, scouted: 1, avg: 10, bySection: { auto: 1 } },
    { team: 1, scouted: 0, avg: null, bySection: { auto: null } },
    { team: 2, scouted: 2, avg: 10, bySection: { auto: 5 } },
  ];
  assert.deepEqual(sortRows(rows, 'avg').map((r) => r.team), [2, 3, 1]);
  assert.deepEqual(sortRows(rows, 'team').map((r) => r.team), [1, 2, 3]);
  assert.deepEqual(sortRows(rows, 'scouted', 'asc').map((r) => r.team), [1, 3, 2]);
  assert.deepEqual(sortRows(rows, 'auto').map((r) => r.team), [2, 3, 1]);
});

test('formatAvg', () => {
  assert.equal(formatAvg(null), '—');
  assert.equal(formatAvg(23), '23');
  assert.equal(formatAvg(23.456), '23.5');
});

test('fieldSummary sums each field by its type', () => {
  const subs = [
    sub(1, { 'auto.leave': true, 'auto.hiveTips': 2, 'post.driverSkill': 3, 'post.notes': 'Fast' }),
    sub(1, { 'auto.leave': false, 'auto.hiveTips': 1, 'post.driverSkill': 3 }),
  ];
  const s = fieldSummary(config, subs);
  const by = (label) => s.find((x) => x.label === label);
  assert.equal(by('LEAVE').yes, 1);
  assert.equal(by('LEAVE').answered, 2);
  assert.equal(s.find((x) => x.label === 'HIVE TIPs' && x.section === 'Auto').value, 1.5);
  assert.deepEqual(by('Driver skill').counts, [{ label: 'Good', count: 2 }]);
  assert.equal(s.find((x) => x.kind === 'texts').texts.length, 1);
  // Fields that only describe the Submission are not summed.
  assert.ok(!s.some((x) => x.label === 'Match number'));
});

test('two Scouts on one match count that match once', () => {
  const m = (match, pts) => sub(1, { 'auto.hiveTips': pts / 20 }, { summary: { team: 1, match, level: 'qual' } });
  // Match 1 seen by two Scouts (20 and 40), match 2 by one (60).
  const [row] = teamRows(config, [m(1, 20), m(1, 40), m(2, 60)]);
  assert.equal(row.submissions, 3);
  assert.equal(row.scouted, 2);
  assert.equal(row.matches, 2);
  assert.equal(row.avg, 45); // (30 + 60) / 2, not (20 + 40 + 60) / 3
});

test('fieldSummary leaves no-shows out, except for the no-show field', () => {
  const subs = [sub(1, { 'auto.leave': true }), sub(1, { 'pre.noShow': true })];
  const s = fieldSummary(config, subs);
  assert.equal(s.find((x) => x.label === 'LEAVE').answered, 1);
  assert.equal(s.find((x) => x.kind === 'yes' && x.section === 'Setup').yes, 1);
  assert.equal(s.find((x) => x.kind === 'yes' && x.section === 'Setup').answered, 2);
});

test('unlinked counts saved Submissions with no Event', () => {
  assert.equal(unlinked([sub(1, {}, { eventId: null }), sub(2), sub(3, {}, { eventId: null, deletedAt: 'x' })], { groupId: 'g1' }), 1);
});

test('Submissions with no match number each count as their own match', () => {
  const noMatch = (pts) => sub(1, { 'auto.hiveTips': pts / 20 }, { summary: { team: 1, level: 'qual' } });
  const [row] = teamRows(config, [noMatch(20), noMatch(60)]);
  assert.equal(row.scouted, 2);
  assert.equal(row.avg, 40);
});

test('a no-show and a played Submission for the same match', () => {
  // One Scout says the robot didn't show, another scouted it: one match,
  // averaged from the played Submission only, with the no-show counted.
  const [row] = teamRows(config, [sub(1, { 'pre.noShow': true }), sub(1, { 'auto.hiveTips': 1 })]);
  assert.equal(row.scouted, 1);
  assert.equal(row.submissions, 2);
  assert.equal(row.noShows, 1);
  assert.equal(row.avg, 20);
});
