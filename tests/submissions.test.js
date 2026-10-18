import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newSubmission, refresh, missingRequired, nextMatchCarry, needsSync,
  alliancePositions, allianceOf, positionLabel, fromMilestone1,
} from '../js/submissions.js';

const biobuzz = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a new Submission starts with what it was given, a UUID, and no sync yet', () => {
  const s = newSubmission(biobuzz, { scout: 'Maya', event: 'Sudbury', match: 14, position: 'red2' });
  assert.match(s.id, UUID);
  assert.equal(s.values['pre.scout'], 'Maya');
  assert.equal(s.values['pre.level'], 'qual'); // qualification unless told otherwise
  assert.equal(s.values['pre.match'], 14);
  assert.equal(s.values['pre.position'], 'red2');
  assert.equal(s.values['pre.team'], undefined);
  assert.equal(s.estimatedPoints, 0);
  assert.equal(s.submittedAt, null);
  assert.equal(s.syncedAt, null);
  assert.deepEqual(s.summary, { scout: 'Maya', level: 'qual', match: 14, team: null, position: 'red2', alliance: 'red' });
});

test('two Submissions never share an id', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newSubmission(biobuzz).id));
  assert.equal(ids.size, 500);
});

test('refresh updates the summary and Estimated points after a change', () => {
  const s = newSubmission(biobuzz, { scout: 'Maya', match: 3 });
  s.values['pre.team'] = 23810;
  s.values['auto.hiveTips'] = 2;
  refresh(biobuzz, s);
  assert.equal(s.summary.team, 23810);
  assert.equal(s.estimatedPoints, 40);
});

test('missingRequired lists the empty required fields', () => {
  const s = newSubmission(biobuzz, { scout: 'Maya', match: 3 });
  assert.deepEqual(missingRequired(biobuzz, s).map((m) => m.field.id), ['team', 'position']);
});

test('the next match keeps scout, event, level and position, adds 1 to the match, clears the team', () => {
  const s = newSubmission(biobuzz, { scout: 'Maya', event: 'Sudbury', match: 14, position: 'blue1' });
  s.values['pre.team'] = 23810;
  refresh(biobuzz, s);
  const next = newSubmission(biobuzz, nextMatchCarry(s));
  assert.equal(next.summary.match, 15);
  assert.equal(next.summary.scout, 'Maya');
  assert.equal(next.summary.position, 'blue1');
  assert.equal(next.summary.level, 'qual');
  assert.equal(next.summary.team, null);
  assert.equal(next.event, 'Sudbury');
});

test('only submitted Submissions with unsynced changes need syncing', () => {
  const s = newSubmission(biobuzz, {}, new Date('2026-10-17T10:00:00Z'));
  assert.equal(needsSync(s), false, 'a Draft never syncs');
  s.submittedAt = '2026-10-17T10:05:00Z';
  assert.equal(needsSync(s), true, 'submitted, never synced');
  s.syncedAt = s.updatedAt;
  assert.equal(needsSync(s), false, 'synced');
  refresh(biobuzz, s, new Date('2026-10-17T11:00:00Z'));
  assert.equal(needsSync(s), true, 'edited after syncing');
});

test('Alliance positions come from the config: 2 per alliance in FTC, 3 in FRC', () => {
  assert.deepEqual(alliancePositions(biobuzz), ['red1', 'red2', 'blue1', 'blue2']);
  const frc = { alliance: { colors: ['red', 'blue'], robotsPerAlliance: 3 } };
  assert.deepEqual(alliancePositions(frc), ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3']);
  assert.equal(allianceOf('blue2'), 'blue');
  assert.equal(positionLabel('blue2'), 'Blue 2');
  assert.equal(positionLabel('red'), 'Red'); // Milestone 1 data only knew the colour
});

test('a Milestone 1 entry becomes a Submission without losing anything', () => {
  const old = {
    id: 'mvbnps9n-xfyuc4',
    configId: 'ftc-2026-biobuzz',
    configVersion: 1,
    event: 'Sudbury',
    values: { 'pre.scout': 'Maya', 'pre.match': 14, 'pre.team': 23810, 'pre.alliance': 'red', 'auto.hiveTips': 2 },
    summary: { scout: 'Maya', match: 14, team: 23810, alliance: 'red' },
    points: 40,
    createdAt: '2026-10-17T00:27:04.120Z',
    updatedAt: '2026-10-17T00:31:40.512Z',
    submittedAt: '2026-10-17T00:31:40.512Z',
  };
  const s = fromMilestone1(old);
  assert.match(s.id, UUID);
  assert.equal(s.values['pre.position'], 'red');
  assert.equal('pre.alliance' in s.values, false);
  assert.equal(s.values['pre.level'], 'qual');
  assert.equal(s.values['auto.hiveTips'], 2);
  assert.equal(s.estimatedPoints, 40);
  assert.equal(s.summary.alliance, 'red');
  assert.equal(s.createdAt, old.createdAt);
  assert.equal(s.submittedAt, old.submittedAt);
  assert.equal(s.syncedAt, null);
  assert.equal(needsSync(s), true);
});

test('matches are described as Q18 / P3, and the sync status says where the data is', async () => {
  const { matchCode, syncStatus } = await import('../js/submissions.js');
  assert.equal(matchCode({ level: 'qual', match: 18 }), 'Q18');
  assert.equal(matchCode({ level: 'playoff', match: 3 }), 'P3');
  assert.equal(matchCode({ level: 'qual', match: null }), 'Q—');
  const s = newSubmission(biobuzz, { match: 18 });
  assert.equal(syncStatus(s).state, 'draft');
  s.submittedAt = s.updatedAt;
  assert.equal(syncStatus(s).state, 'local');
  s.syncedAt = s.updatedAt;
  assert.equal(syncStatus(s).state, 'sent');
});
