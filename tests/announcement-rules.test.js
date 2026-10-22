import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBody, unread, whenLabel, MAX_LENGTH } from '../js/announcement-rules.js';

test('checkBody', () => {
  assert.equal(checkBody('Switch to Red 2 after lunch'), null);
  assert.ok(checkBody('   '));
  assert.match(checkBody('x'.repeat(MAX_LENGTH + 1)), /281/);
});

test('unread: newer than last seen, not my own', () => {
  const list = [
    { id: 'c', created_by: 'lead', created_at: '2026-11-21T15:00:00Z' },
    { id: 'b', created_by: 'me', created_at: '2026-11-21T14:00:00Z' },
    { id: 'a', created_by: 'lead', created_at: '2026-11-21T13:00:00Z' },
  ];
  assert.deepEqual(unread(list, null, 'me').map((x) => x.id), ['c', 'a']);
  assert.deepEqual(unread(list, '2026-11-21T13:30:00Z', 'me').map((x) => x.id), ['c']);
  assert.deepEqual(unread(list, '2026-11-21T15:00:00Z', 'me'), []);
});

test('whenLabel: time today, weekday this week, date before', () => {
  const now = new Date('2026-11-21T18:00:00');
  assert.match(whenLabel('2026-11-21T10:42:00', now), /^10:42\sAM$/);
  assert.match(whenLabel('2026-11-19T10:42:00', now), /^Thu 10:42\sAM$/);
  assert.equal(whenLabel('2026-11-01T10:42:00', now), 'Nov 1');
});
