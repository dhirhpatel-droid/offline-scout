import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, findMatch, teamAt, positionOf, isAtEvent } from '../js/schedule.js';

const matches = [
  { level: 'qual', number: 1, game: 1, red: [22309, 24436], blue: [30420, 25049], scheduled_at: '2025-12-13T16:30:00Z' },
  { level: 'qual', number: 2, game: 1, red: [16415, 14515], blue: [1, 2] },
  { level: 'playoff', number: 6, game: 1, red: [10, 11], blue: [12, 13] },
  { level: 'playoff', number: 6, game: 2, red: [10, 11], blue: [12, 13] },
];

test('the season comes from the game config', () => {
  assert.equal(seasonOf({ season: '2026–27' }), 2026);
  assert.equal(seasonOf({}), null);
});

test('find a match, and the team in each Alliance position', () => {
  const q1 = findMatch(matches, 'qual', 1);
  assert.equal(teamAt(q1, 'red1'), 22309);
  assert.equal(teamAt(q1, 'red2'), 24436);
  assert.equal(teamAt(q1, 'blue2'), 25049);
  assert.equal(teamAt(q1, 'blue3'), null, 'no third robot in FTC');
  assert.equal(findMatch(matches, 'qual', 99), null);
  assert.equal(findMatch(matches, 'playoff', 6).game, 2, 'latest game of a playoff series');
});

test('find where a team plays in a match', () => {
  const q2 = findMatch(matches, 'qual', 2);
  assert.equal(positionOf(q2, 16415), 'red1');
  assert.equal(positionOf(q2, 999), null);
});

test('teams not at the event are spotted (but an empty list never complains)', () => {
  const teams = [{ team_number: 16415 }];
  assert.equal(isAtEvent(teams, 16415), true);
  assert.equal(isAtEvent(teams, 23810), false);
  assert.equal(isAtEvent([], 23810), true);
});
