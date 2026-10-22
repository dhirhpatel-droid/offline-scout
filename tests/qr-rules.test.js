import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pack, unpack, mergeAction, PREFIX } from '../js/qr-rules.js';
import { refresh } from '../js/submissions.js';

const config = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));
const configs = { [config.id]: config };

// A saved Submission as the Scout's phone has it.
function scoutsSub() {
  const sub = {
    id: '1f2e3d4c-5b6a-4789-8abc-def012345678', groupId: 'g1', eventId: 'e1', scoutId: 's1', event: 'Sudbury Qualifier',
    configId: config.id, configVersion: config.version,
    values: { 'pre.scout': 'Maya', 'pre.level': 'qual', 'pre.match': 18, 'pre.team': 23810, 'pre.position': 'red2',
      'auto.leave': true, 'auto.hiveTips': 1, 'teleop.flower': 3, 'post.notes': 'Fast cycles', 'teleop.custom-q1': 'Far side' },
    createdAt: '2026-11-21T15:00:00.000Z', submittedAt: '2026-11-21T15:03:00.000Z', deletedAt: null, syncedAt: null,
  };
  refresh(config, sub, new Date('2026-11-21T15:03:00.000Z'));
  return sub;
}

test('pack → unpack gives back the same Submission', () => {
  const sub = scoutsSub();
  const text = pack(config, sub);
  assert.ok(text.startsWith(PREFIX));
  const { sub: back, error } = unpack(text, configs);
  assert.equal(error, undefined);
  assert.deepEqual(back.values, sub.values);
  assert.equal(back.id, sub.id);
  assert.equal(back.scoutId, 's1');
  assert.equal(back.updatedAt, sub.updatedAt);
  assert.equal(back.submittedAt, sub.submittedAt);
  assert.equal(back.estimatedPoints, sub.estimatedPoints);
  assert.equal(back.summary.team, 23810);
  assert.equal(back.syncedAt, null, 'the Lead\'s phone will upload it');
});

test('names and notes with accents or curly quotes survive (the code is plain ASCII)', () => {
  const sub = scoutsSub();
  sub.values['post.notes'] = 'Zoë’s robot — fast';
  const text = pack(config, sub);
  assert.ok(/^[\x20-\x7e]*$/.test(text), 'only plain ASCII');
  assert.equal(unpack(text, configs).sub.values['post.notes'], 'Zoë’s robot — fast');
});

test('the code stays small enough to scan off a phone screen', () => {
  // About 300 bytes keeps the QR around version 10–12: easy to scan.
  assert.ok(pack(config, scoutsSub()).length < 400, `was ${pack(config, scoutsSub()).length}`);
});

test('unpack refuses what it can\'t trust, in words', () => {
  assert.match(unpack('hello', configs).error, /isn’t an Offline Scout code/);
  assert.match(unpack(`${PREFIX}[1,`, configs).error, /didn’t read fully/);
  assert.match(unpack(`${PREFIX}[2]`, configs).error, /newer version/);
  const text = pack(config, scoutsSub());
  assert.match(unpack(text, {}).error, /game this phone doesn’t have/);
  assert.match(unpack(pack(config, { ...scoutsSub(), scoutId: null }), configs).error, /which Scout/);
  assert.match(unpack(text, { [config.id]: { ...config, version: config.version + 1 } }).error, /version \d+ of the game.*stays on the Scout’s phone/);
});

test('a code can say which of the Scout\'s codes it is ("2 of 4")', () => {
  const { part } = unpack(pack(config, scoutsSub(), [2, 4]), configs);
  assert.deepEqual(part, { i: 2, n: 4 });
  assert.equal(unpack(pack(config, scoutsSub()), configs).part, null);
});

test('mergeAction: add new, replace with a newer edit, keep what\'s newer', () => {
  const sub = scoutsSub();
  assert.equal(mergeAction(null, sub), 'add');
  assert.equal(mergeAction({ updatedAt: '2026-11-21T15:00:00Z' }, sub), 'replace');
  assert.equal(mergeAction({ updatedAt: sub.updatedAt }, sub), 'have');
  assert.equal(mergeAction({ updatedAt: '2026-11-21T16:00:00Z' }, sub), 'have');
});

test('a real QR code made from a match reads back to the same match (no camera)', async () => {
  // Draw the code with the same library the app uses, as black and white
  // pixels, then read it with jsQR (what iPhones use) and unpack it.
  const { default: qrcode } = await import('../vendor/qrcode-generator-2.0.4.mjs');
  const { createRequire } = await import('node:module');
  // The npm copy is the same file as vendor/jsqr-1.4.0.js (checked with cmp); it loads in Node.
  const jsQR = createRequire(import.meta.url)('jsqr');
  const sub = scoutsSub();
  sub.values['post.notes'] = 'Zoë’s robot — fast';
  const text = pack(config, sub);
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const scale = 4;
  const margin = 4;
  const size = (qr.getModuleCount() + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - margin;
      const col = Math.floor(x / scale) - margin;
      const dark = row >= 0 && col >= 0 && row < qr.getModuleCount() && col < qr.getModuleCount() && qr.isDark(row, col);
      if (dark) pixels.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
    }
  }
  const found = jsQR(pixels, size, size);
  assert.equal(found?.data, text);
  assert.equal(unpack(found.data, configs).sub.values['post.notes'], 'Zoë’s robot — fast');
});
