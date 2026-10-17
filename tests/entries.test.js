import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newEntry, refresh, missingRequired, nextMatchCarry } from '../js/entries.js';

const biobuzz = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));

test('a new entry starts with the scout, event, match and alliance it was given', () => {
  const e = newEntry(biobuzz, { scout: 'Maya', event: 'Sudbury', match: 14, alliance: 'red' });
  assert.equal(e.values['pre.scout'], 'Maya');
  assert.equal(e.values['pre.match'], 14);
  assert.equal(e.values['pre.alliance'], 'red');
  assert.equal(e.values['pre.team'], undefined);
  assert.equal(e.event, 'Sudbury');
  assert.equal(e.configId, 'ftc-2026-biobuzz');
  assert.equal(e.points, 0);
  assert.deepEqual(e.summary, { scout: 'Maya', match: 14, team: null, alliance: 'red' });
});

test('refresh updates the summary and points after a change', () => {
  const e = newEntry(biobuzz, { scout: 'Maya', match: 3 });
  e.values['pre.team'] = 23810;
  e.values['auto.hiveTips'] = 2;
  refresh(biobuzz, e);
  assert.equal(e.summary.team, 23810);
  assert.equal(e.points, 40);
});

test('missingRequired lists the empty required fields', () => {
  const e = newEntry(biobuzz, { scout: 'Maya', match: 3 });
  const missing = missingRequired(biobuzz, e).map((m) => m.field.id);
  assert.deepEqual(missing, ['team', 'alliance']);
});

test('the next match keeps scout, event and alliance, adds 1 to the match number, clears the team', () => {
  const e = newEntry(biobuzz, { scout: 'Maya', event: 'Sudbury', match: 14, alliance: 'blue' });
  e.values['pre.team'] = 23810;
  refresh(biobuzz, e);
  const next = newEntry(biobuzz, nextMatchCarry(e));
  assert.equal(next.summary.match, 15);
  assert.equal(next.summary.scout, 'Maya');
  assert.equal(next.summary.alliance, 'blue');
  assert.equal(next.summary.team, null);
  assert.equal(next.event, 'Sudbury');
  assert.notEqual(next.id, e.id);
});
