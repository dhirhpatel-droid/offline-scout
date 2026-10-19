import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentsFor, isDone, upcoming, byMatch } from '../js/assignments.js';

const matches = [
  { level: 'qual', number: 1, game: 1, red: [23810, 16012], blue: [19455, 21229], played: true },
  { level: 'qual', number: 2, game: 1, red: [16415, 14515], blue: [23810, 24436] },
  { level: 'qual', number: 3, game: 1, red: [22309, 23810], blue: [16012, 25049] },
  { level: 'playoff', number: 1, game: 1, red: [23810, 16415], blue: [1, 2] },
  { level: 'playoff', number: 1, game: 2, red: [23810, 16415], blue: [1, 2] },
];
const maya = 'u-maya';

test('a Position shift becomes one Assignment per match in its range, with the team from the schedule', () => {
  const a = assignmentsFor({ scoutId: maya, shifts: [{ scout_id: maya, position: 'red1', from_match: 1, to_match: 2 }], matches });
  assert.deepEqual(a.map((x) => [x.number, x.position, x.team]), [[1, 'red1', 23810], [2, 'red1', 16415]]);
});

test('before the schedule is out, a shift still says which match and position', () => {
  const a = assignmentsFor({ scoutId: maya, shifts: [{ scout_id: maya, position: 'blue2', from_match: 5, to_match: 6 }] });
  assert.deepEqual(a.map((x) => [x.number, x.position, x.team]), [[5, 'blue2', null], [6, 'blue2', null]]);
});

test('a Team watch follows the team into every match it plays, playoffs once per series', () => {
  const a = assignmentsFor({ scoutId: maya, watches: [{ scout_id: maya, team_number: 23810 }], matches });
  assert.deepEqual(a.map((x) => `${x.level}${x.number}:${x.position}`), ['qual1:red1', 'qual2:blue1', 'qual3:red2', 'playoff1:red1']);
});

test('a match covered by both a shift and a watch appears once', () => {
  const a = assignmentsFor({
    scoutId: maya,
    shifts: [{ scout_id: maya, position: 'red1', from_match: 1, to_match: 1 }],
    watches: [{ scout_id: maya, team_number: 23810 }], matches,
  });
  assert.equal(a.filter((x) => x.number === 1 && x.level === 'qual').length, 1);
  assert.equal(a[0].source, 'both');
});

test('other scouts\' instructions are ignored', () => {
  assert.equal(assignmentsFor({ scoutId: maya, watches: [{ scout_id: 'u-sam', team_number: 23810 }], matches }).length, 0);
});

test('saved and played matches drop off what\'s upcoming', () => {
  const a = assignmentsFor({ scoutId: maya, watches: [{ scout_id: maya, team_number: 23810 }], matches });
  const mine = [{ submittedAt: 'x', summary: { level: 'qual', match: 2, team: 23810 } }];
  assert.equal(isDone(a[1], mine), true);
  assert.deepEqual(upcoming(a, mine).map((x) => x.number), [3, 1]); // Q1 played, Q2 saved; Q3 and P1 left
});

test('two Teams in the same match are grouped, so the Scout can switch between them', () => {
  const a = assignmentsFor({
    scoutId: maya,
    watches: [{ scout_id: maya, team_number: 23810 }, { scout_id: maya, team_number: 16012 }], matches,
  });
  const q3 = byMatch(a).find((g) => g.level === 'qual' && g.number === 3);
  assert.deepEqual(q3.items.map((x) => x.team).sort(), [16012, 23810]);
});
