import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkQuestion, parseOptions, toField, withCustom, customKey } from '../js/custom-rules.js';
import { estimatePoints } from '../js/scoring.js';

const config = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));
const q = (fields) => ({ id: 'q1', section: 'teleop', type: 'toggle', label: 'Cycled from the far side', position: 0, hidden_at: null, ...fields });

test('checkQuestion', () => {
  assert.deepEqual(checkQuestion({ label: 'Fast?', type: 'toggle' }), {});
  assert.ok(checkQuestion({ label: '  ', type: 'toggle' }).label);
  assert.ok(checkQuestion({ label: 'x', type: 'essay' }).type);
  assert.ok(checkQuestion({ label: 'Side', type: 'choice', options: 'Left' }).options);
  assert.deepEqual(checkQuestion({ label: 'Side', type: 'choice', options: 'Left, Right' }), {});
});

test('parseOptions trims, drops blanks and repeats', () => {
  assert.deepEqual(parseOptions('Left, Right , ,Left,Middle'), ['Left', 'Right', 'Middle']);
});

test('toField turns a question into a config field with no points', () => {
  assert.deepEqual(toField(q({ type: 'choice', options: ['L', 'R'] })),
    { id: 'custom-q1', type: 'choice', label: 'Cycled from the far side', custom: true, hint: 'Your group’s question', options: [{ value: 'L', label: 'L' }, { value: 'R', label: 'R' }] });
  assert.equal(toField(q({ type: 'rating' })).max, 5);
});

test('withCustom adds questions to their sections; hidden ones only if answered', () => {
  const merged = withCustom(config, [q(), q({ id: 'q2', hidden_at: '2026-10-19' })]);
  const teleop = merged.sections.find((s) => s.id === 'teleop');
  assert.ok(teleop.fields.some((f) => f.id === 'custom-q1'));
  assert.ok(!teleop.fields.some((f) => f.id === 'custom-q2'));
  const again = withCustom(config, [q({ id: 'q2', hidden_at: '2026-10-19' })], { 'teleop.custom-q2': true });
  assert.ok(again.sections.find((s) => s.id === 'teleop').fields.some((f) => f.id === 'custom-q2'));
  // The original config is untouched.
  assert.ok(!config.sections.find((s) => s.id === 'teleop').fields.some((f) => f.custom));
});

test('questions for another game, or a section this game lacks, are left out', () => {
  const count = (c) => c.sections.flatMap((s) => s.fields).filter((f) => f.custom).length;
  assert.equal(count(withCustom(config, [q({ section: 'nowhere' })])), 0);
  assert.equal(count(withCustom(config, [q({ config_id: 'frc-2027' })])), 0);
  assert.equal(count(withCustom(config, [q({ config_id: config.id })])), 1);
});

test('a cleared answer doesn\'t keep a hidden question showing', () => {
  const merged = withCustom(config, [q({ hidden_at: 'x' })], { 'teleop.custom-q1': null });
  assert.ok(!merged.sections.some((s) => s.fields.some((f) => f.custom)));
});

test('Custom answers never add to Estimated points', () => {
  const merged = withCustom(config, [q({ type: 'counter' })]);
  assert.equal(estimatePoints(merged, { [customKey(q())]: 10 }), 0);
});
