import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimatePoints } from '../js/scoring.js';

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
    'teleop.flower': 5, //           10
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
  assert.equal(estimatePoints(biobuzz, { 'teleop.flower': -4, 'teleop.cell': 'abc' }), 0);
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
