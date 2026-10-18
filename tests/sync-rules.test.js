import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toServer, fromServer, decide, hasUnsentChanges, claim } from '../js/sync-rules.js';
import { newSubmission, refresh } from '../js/submissions.js';

const biobuzz = JSON.parse(readFileSync(new URL('../configs/ftc-2026-biobuzz.json', import.meta.url)));

function saved(at = '2026-10-19T10:00:00.000Z') {
  const s = newSubmission(biobuzz, { scout: 'Maya', match: 14, position: 'red1' }, new Date(at));
  s.values['pre.team'] = 23810;
  refresh(biobuzz, s, new Date(at));
  s.submittedAt = at;
  s.groupId = 'g1';
  s.scoutId = 'u1';
  return s;
}

test('a Submission survives the trip to the server and back', () => {
  const s = saved();
  const back = fromServer({ ...toServer(s), scout_id: 'u1' });
  assert.equal(back.id, s.id);
  assert.deepEqual(back.values, s.values);
  assert.deepEqual(back.summary, s.summary);
  assert.equal(back.estimatedPoints, s.estimatedPoints);
  assert.equal(back.syncedAt, s.updatedAt, 'what came from the server is in sync');
  assert.equal(hasUnsentChanges(back), false);
});

test('times written by Postgres compare correctly with times written by the phone', () => {
  const row = { ...toServer(saved()), updated_at: '2026-10-19 10:00:00+00', scout_id: 'u1' };
  assert.equal(fromServer(row).updatedAt, '2026-10-19T10:00:00.000Z');
});

test('new rows are added, deleted ones the phone never had are skipped', () => {
  const s = saved();
  assert.equal(decide(undefined, toServer(s)), 'add');
  assert.equal(decide(undefined, { ...toServer(s), deleted_at: '2026-10-19T11:00:00Z' }), 'skip');
});

test('the newer edit wins: a newer server version replaces the phone\'s', () => {
  const local = saved();
  local.syncedAt = local.updatedAt;
  const remote = { ...toServer(local), updated_at: '2026-10-19T12:00:00Z', values: { 'auto.hiveTips': 9 } };
  assert.equal(decide(local, remote), 'replace');
});

test('the newer edit wins: an unsent newer phone edit is kept, then sent', () => {
  const local = saved();
  local.syncedAt = '2026-10-19T10:00:00.000Z';
  local.updatedAt = '2026-10-19T13:00:00.000Z'; // edited offline, later
  const remote = { ...toServer(local), updated_at: '2026-10-19T12:00:00Z' };
  assert.equal(decide(local, remote), 'keep');
});

test('a delete from another phone removes the match here (unless edited here since)', () => {
  const local = saved();
  local.syncedAt = local.updatedAt;
  const remote = { ...toServer(local), updated_at: '2026-10-19T12:00:00Z', deleted_at: '2026-10-19T12:00:00Z' };
  assert.equal(decide(local, remote), 'remove');
});

test('drafts never sync; saved matches with new edits do', () => {
  const draft = newSubmission(biobuzz, {});
  assert.equal(hasUnsentChanges(draft), false);
  const s = saved();
  assert.equal(hasUnsentChanges(s), true);
});

test('matches made before joining a group are claimed by whoever syncs them', () => {
  const s = { ...saved(), groupId: undefined, scoutId: undefined };
  const c = claim(s, { userId: 'me', groupId: 'g9' });
  assert.equal(c.scoutId, 'me');
  assert.equal(c.groupId, 'g9');
  const already = claim(saved(), { userId: 'me', groupId: 'g9' });
  assert.equal(already.groupId, 'g1', 'never moves a match that already has a group');
});
