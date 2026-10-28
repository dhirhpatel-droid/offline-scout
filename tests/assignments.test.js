import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentsFor, isDone, upcoming, byMatch, coverage, coverageGrid, shortNames, planSummary } from '../js/assignments.js';

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

test('coverage counts watched positions per qualification match', () => {
  const matches = [
    { level: 'qual', number: 1, red: [1, 2], blue: [3, 4], played: true },
    { level: 'qual', number: 2, red: [5, 1], blue: [6, 7], played: false },
  ];
  const plan = {
    shifts: [{ scout_id: 'a', position: 'red1', from_match: 1, to_match: 2 }],
    watches: [{ scout_id: 'b', team_number: 1 }], // red1 in Q1 (same position), red2 in Q2
  };
  assert.deepEqual(coverage(plan, matches), [
    { number: 1, played: true, total: 4, covered: 1 },
    { number: 2, played: false, total: 4, covered: 2 },
  ]);
  assert.equal(planSummary(plan, matches), '2 open positions in Q2 · first Q2');
  assert.equal(planSummary({ shifts: [], watches: [] }, matches), null);
});

test('the Coverage grid lists matches still to play, with who watches each station', () => {
  const plan = {
    shifts: [{ scout_id: maya, position: 'red1', from_match: 1, to_match: 3 }],
    watches: [{ scout_id: 'u-dhir', team_number: 23810 }],
  };
  const grid = coverageGrid(plan, matches, ['red1', 'red2', 'blue1', 'blue2']);
  // Q1 is played, so it's left out; playoffs aren't in the grid.
  assert.deepEqual(grid.map((r) => r.number), [2, 3]);
  assert.deepEqual(grid[0].scouts, { red1: [maya], red2: [], blue1: ['u-dhir'], blue2: [] });
  assert.deepEqual(grid[1].scouts, { red1: [maya], red2: ['u-dhir'], blue1: [], blue2: [] });
  assert.deepEqual(grid[0].doubled, []);
});

test('a Scout on two stations in one match is listed as doubled', () => {
  const plan = {
    shifts: [{ scout_id: maya, position: 'red1', from_match: 3, to_match: 3 }],
    watches: [{ scout_id: maya, team_number: 23810 }], // red2 in Q3
  };
  const q3 = coverageGrid(plan, matches, ['red1', 'red2', 'blue1', 'blue2']).find((r) => r.number === 3);
  assert.deepEqual(q3.doubled, [maya]);
});

test('two Scouts on the same station both show in its cell, once each', () => {
  const plan = {
    shifts: [{ scout_id: maya, position: 'blue1', from_match: 2, to_match: 2 }],
    watches: [{ scout_id: 'u-dhir', team_number: 23810 }, { scout_id: maya, team_number: 23810 }],
  };
  const [q2] = coverageGrid(plan, matches, ['red1', 'red2', 'blue1', 'blue2']);
  assert.deepEqual(q2.scouts.blue1.sort(), ['u-dhir', maya].sort());
});

test('an empty plan leaves every station open', () => {
  const grid = coverageGrid({ shifts: [], watches: [] }, matches, ['red1', 'blue1']);
  assert.ok(grid.every((r) => r.scouts.red1.length === 0 && r.scouts.blue1.length === 0));
});

test('short names use the first letter, more when two names start the same', () => {
  const labels = shortNames([
    { user_id: 'a', display_name: 'Dhir' },
    { user_id: 'b', display_name: 'Maya Lee' },
    { user_id: 'c', display_name: 'Alexandra' },
    { user_id: 'd', display_name: '' },
    { user_id: 'e', display_name: 'Sam Kim' },
    { user_id: 'f', display_name: 'Sam Li' },
  ]);
  assert.deepEqual([...labels.values()], ['Dhir', 'Maya', 'Alexan', '?', 'Sam K', 'Sam L']);
});

test('members with the very same name get numbered labels', () => {
  const labels = shortNames([{ user_id: 'a', display_name: 'Sam' }, { user_id: 'b', display_name: 'Sam' }]);
  assert.deepEqual([...labels.values()], ['Sam', 'Sam 2']);
});
