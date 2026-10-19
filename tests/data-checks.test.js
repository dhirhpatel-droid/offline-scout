import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataChecks, disagreements, scoreGaps, impossible, checksFor } from '../js/data-checks.js';

const config = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));

let n = 0;
const sub = (team, match, values = {}, extra = {}) => ({
  id: `s${++n}`, submittedAt: 'x', values,
  summary: { team, match, level: 'qual', scout: extra.scout ?? 'Dhir', position: extra.position ?? null },
});

const event = {
  teams: [1, 2, 3, 4].map((t) => ({ team_number: t })),
  matches: [{ level: 'qual', number: 1, red: [1, 2], blue: [3, 4], played: true, red_score: 60, blue_score: 20 }],
};

test('two Scouts far apart on points disagree; close ones don\'t', () => {
  const far = [sub(1, 1, { 'auto.hiveTips': 1 }), sub(1, 1, { 'auto.hiveTips': 3 }, { scout: 'Maya' })]; // 20 vs 60
  const [c] = disagreements(config, far);
  assert.equal(c.kind, 'disagree');
  assert.match(c.text, /Dhir 20, Maya 60 est\. pts/);
  assert.match(c.text, /Auto: Dhir 20, Maya 60/);
  assert.equal(c.subs.length, 2);
  const close = [sub(1, 1, { 'teleop.garden': 1 }), sub(1, 1, { 'teleop.garden': 3 })]; // 1 vs 3
  assert.equal(disagreements(config, close).length, 0);
});

test('a scoring Yes/No or a no-show disagreement is flagged even when points are close', () => {
  const leave = [sub(1, 1, { 'auto.leave': true }), sub(1, 1, {}, { scout: 'Maya' })];
  assert.match(disagreements(config, leave)[0].text, /LEAVE: Dhir yes, Maya no/);
  const show = [sub(1, 1, { 'pre.noShow': true }), sub(1, 1, {}, { scout: 'Maya' })];
  assert.match(disagreements(config, show)[0].text, /Dhir said it didn’t show up/);
});

test('sensitivity changes how far apart is too far', () => {
  const pair = [sub(1, 1, { 'teleop.flower': 0 }), sub(1, 1, { 'teleop.flower': 5 })]; // 0 vs 10
  assert.equal(disagreements(config, pair, { points: 12 }).length, 0);
  assert.equal(disagreements(config, pair, { points: 6 }).length, 1);
});

test('an alliance total far from the official score is flagged, only when every robot was scouted', () => {
  // Red scored 60; scouts saw 20 + 0 = 20.
  const red = [sub(1, 1, { 'auto.hiveTips': 1 }), sub(2, 1, {})];
  const [c] = scoreGaps(config, red, event.matches);
  assert.equal(c.alliance, 'red');
  assert.match(c.title, /20 scouted, 60 official/);
  assert.deepEqual(c.teams, [1, 2]);
  assert.equal(scoreGaps(config, [red[0]], event.matches).length, 0, 'one robot missing: no check');
  // Close enough: 50 vs 60.
  const near = [sub(1, 1, { 'auto.hiveTips': 2 }), sub(2, 1, { 'teleop.flower': 5 })];
  assert.equal(scoreGaps(config, near, event.matches).length, 0);
});

test('impossible values: not at the event, not in the schedule, not in the match, wrong position', () => {
  const checks = impossible(config, [
    sub(9, 1), sub(1, 7), sub(3, 1, {}, { position: 'red1' }), sub(4, 1, {}, { position: 'blue1' }),
  ], event);
  const titles = checks.map((c) => c.title);
  assert.ok(titles.some((t) => /9 isn’t at this event/.test(t)));
  assert.ok(titles.some((t) => /Q7 isn’t in the schedule/.test(t)));
  assert.ok(titles.some((t) => /3 was at Blue 1, not Red 1/.test(t)));
  assert.ok(titles.some((t) => /4 was at Blue 2, not Blue 1/.test(t)));
});

test('dataChecks sorts by match; checksFor picks one team', () => {
  const all = dataChecks(config, [sub(9, 1), sub(1, 1, { 'auto.hiveTips': 1 }), sub(2, 1, {})], event);
  assert.ok(all.length >= 2);
  assert.ok(checksFor(all, 1).some((c) => c.kind === 'score'));
  assert.ok(checksFor(all, 9).some((c) => c.kind === 'impossible'));
});

test('"Looks right" hides a check until one of its Submissions changes', async () => {
  const { checkKey, openChecks } = await import('../js/data-checks.js');
  const a = { ...sub(1, 1, { 'auto.hiveTips': 1 }), updatedAt: 't1' };
  const b = { ...sub(1, 1, { 'auto.hiveTips': 3 }, { scout: 'Maya' }), updatedAt: 't1' };
  const byId = new Map([[a.id, a], [b.id, b]]);
  const checks = disagreements(config, [a, b]);
  const ok = [checkKey(checks[0], byId)];
  assert.equal(openChecks(checks, ok, byId).length, 0);
  byId.set(b.id, { ...b, updatedAt: 't2' }); // Maya edits her Submission
  assert.equal(openChecks(checks, ok, byId).length, 1);
});
