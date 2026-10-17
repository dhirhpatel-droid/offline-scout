import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig, findRole } from '../js/config.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const biobuzz = read('../configs/ftc-2026-biobuzz.json');

test('the BIOBUZZ config is valid', () => {
  assert.deepEqual(validateConfig(biobuzz), []);
});

test('every config listed in configs/index.json exists and is valid', () => {
  for (const entry of read('../configs/index.json')) {
    assert.deepEqual(validateConfig(read(`../${entry.file}`)), [], entry.id);
  }
});

test('the same format works for an FRC game with 3-robot alliances', () => {
  const frc = {
    id: 'frc-test', version: 1, program: 'FRC',
    alliance: { colors: ['red', 'blue'], robotsPerAlliance: 3 },
    sections: [
      { id: 'pre', label: 'Pre', fields: [
        { id: 'scout', type: 'text', label: 'Scout', role: 'scoutName' },
        { id: 'match', type: 'number', label: 'Match', role: 'matchNumber' },
        { id: 'team', type: 'number', label: 'Team', role: 'teamNumber' },
        { id: 'alliance', type: 'choice', label: 'Alliance', role: 'alliance',
          options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] },
      ] },
      { id: 'auto', label: 'Auto', durationSec: 15, fields: [
        { id: 'coral', type: 'counter', label: 'Coral L4', points: 7 },
      ] },
      { id: 'teleop', label: 'Teleop', durationSec: 135, fields: [
        { id: 'climb', type: 'choice', label: 'Climb', options: [
          { value: 'none', label: 'None' }, { value: 'deep', label: 'Deep', points: 12 },
        ] },
      ] },
    ],
  };
  assert.deepEqual(validateConfig(frc), []);
});

test('mistakes in a config are reported clearly', () => {
  const broken = structuredClone(biobuzz);
  broken.sections[1].fields[0].type = 'slider';
  broken.sections[0].fields = broken.sections[0].fields.filter((f) => f.role !== 'teamNumber');
  const errors = validateConfig(broken);
  assert.ok(errors.some((e) => e.includes('unknown type "slider"')));
  assert.ok(errors.some((e) => e.includes('role "teamNumber"')));
});

test('findRole finds the field behind each role', () => {
  assert.equal(findRole(biobuzz, 'teamNumber').key, 'pre.team');
  assert.equal(findRole(biobuzz, 'alliance').field.options.length, 2);
});
