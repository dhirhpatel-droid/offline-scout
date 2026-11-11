import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimatePoints, pointsBySection } from '../js/scoring.js';

const biobuzz = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));

test('an empty match scores 0', () => {
  assert.equal(estimatePoints(biobuzz, {}), 0);
});

test('a full BIOBUZZ match adds up every point value', () => {
  const values = {
    'auto.leave': true, //            3
    'auto.hiveTips': 1, //           20
    'auto.park': true, //             5
    'teleop.hiveTips': 2, //         40
    'end.flower': 5, //           10
    'teleop.garden': 3, //            3
    'teleop.cell': 4, //              8
    'teleop.defense': 'heavy', //     0
    'end.park': true, //              5
    'post.minorFouls': 2, //          0 (fouls give points to the other alliance)
    'post.driverSkill': 4, //         0
  };
  assert.equal(estimatePoints(biobuzz, values), 94);
});

test('toggles set to No score nothing', () => {
  assert.equal(estimatePoints(biobuzz, { 'auto.leave': false, 'end.park': false }), 0);
});

test('a no-show robot scores 0 even if buttons were tapped', () => {
  const values = { 'pre.noShow': true, 'auto.hiveTips': 3, 'end.park': true };
  assert.equal(estimatePoints(biobuzz, values), 0);
});

test('negative or broken counter values never subtract points', () => {
  assert.equal(estimatePoints(biobuzz, { 'end.flower': -4, 'teleop.cell': 'abc' }), 0);
});

test('choice options can carry points (for future games)', () => {
  const config = {
    sections: [{
      id: 'end',
      fields: [{
        id: 'climb', type: 'choice', label: 'Climb',
        options: [{ value: 'none', label: 'None' }, { value: 'deep', label: 'Deep', points: 12 }],
      }],
    }],
  };
  assert.equal(estimatePoints(config, { 'end.climb': 'deep' }), 12);
});

test('points are broken down by section and add up to the total', () => {
  const values = { 'auto.leave': true, 'auto.hiveTips': 1, 'end.flower': 3, 'end.park': true };
  const parts = pointsBySection(biobuzz, values);
  assert.deepEqual(parts, { pre: 0, auto: 23, teleop: 0, end: 11, post: 0 }); // FLOWERS score in the last minute
  assert.equal(Object.values(parts).reduce((a, b) => a + b, 0), estimatePoints(biobuzz, values));
  assert.equal(pointsBySection(biobuzz, { ...values, 'pre.noShow': true }).auto, 0);
});

test('a counter with a "max" never counts past it (4 FLOWERS, 4 Bottom NECTAR bonuses)', () => {
  assert.equal(estimatePoints(biobuzz, { 'end.bottomNectar': 9 }), 20);
});
