import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMatchRow, toRows, toSearchResult, eventQuery } from '../supabase/functions/event-data/ftcscout.js';

// Shapes copied from a real FTCScout response (Bolton Qualifier 2025, CAONBOQ).
const qual = {
  matchNum: 1, series: 0, tournamentLevel: 'Quals', scheduledStartTime: '2025-12-13T16:30:00.000Z', hasBeenPlayed: true,
  teams: [
    { teamNumber: 24436, alliance: 'Red', station: 'Two' },
    { teamNumber: 22309, alliance: 'Red', station: 'One' },
    { teamNumber: 30420, alliance: 'Blue', station: 'One' },
    { teamNumber: 25049, alliance: 'Blue', station: 'Two' },
  ],
  scores: { red: { totalPoints: 82 }, blue: { totalPoints: 141 } },
};

test('a qualification match becomes a schedule row with teams in position order', () => {
  assert.deepEqual(toMatchRow(qual, 'e1'), {
    event_id: 'e1', level: 'qual', number: 1, game: 1, scheduled_at: '2025-12-13T16:30:00.000Z',
    red: [22309, 24436], blue: [30420, 25049], red_score: 82, blue_score: 141, played: true,
  });
});

test('a playoff game is filed under its series, with the game number', () => {
  const row = toMatchRow({ ...qual, tournamentLevel: 'DoubleElim', series: 6, matchNum: 2, scores: null, hasBeenPlayed: false }, 'e1');
  assert.equal(row.level, 'playoff');
  assert.equal(row.number, 6);
  assert.equal(row.game, 2);
  assert.equal(row.red_score, null);
  assert.equal(row.played, false);
});

test('an event, its teams and search results map to plain rows', () => {
  const { event, teams } = toRows({
    code: 'CAONBOQ', name: 'Bolton Qualifier', start: '2025-12-13', end: '2025-12-13', timezone: 'America/Toronto',
    location: { city: 'Bolton', state: 'ON', country: 'Canada' },
    teams: [{ teamNumber: 16415, team: { name: 'Lo-Ellen EDIT (BLACK)' } }],
  }, { season: 2025 });
  assert.equal(event.city, 'Bolton, ON');
  assert.equal(event.season, 2025);
  assert.deepEqual(teams, [{ team_number: 16415, team_name: 'Lo-Ellen EDIT (BLACK)' }]);
  assert.equal(toSearchResult({ code: 'X', name: 'Y', location: { city: 'Sudbury', state: 'ON' } }).city, 'Sudbury, ON');
});

test('scores are only asked for when the season has a scores type', () => {
  assert.match(eventQuery('MatchScores2026'), /on MatchScores2026/);
  assert.doesNotMatch(eventQuery(null), /scores/);
});
