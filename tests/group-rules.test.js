import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNewGroup, checkSignUp, isEmail, normalizeEmail, isLastLead, sortMembers, groupLabel } from '../js/group-rules.js';

test('a new group needs FTC or FRC, a team number and a name', () => {
  assert.deepEqual(checkNewGroup({ program: 'FRC', teamNumber: '4069', name: 'Lo-Ellen Robotics' }), {});
  const errors = checkNewGroup({ program: 'VEX', teamNumber: '0', name: '  ' });
  assert.deepEqual(Object.keys(errors).sort(), ['name', 'program', 'teamNumber']);
});

test('sign-up needs a name, a real email and 8+ character password', () => {
  assert.deepEqual(checkSignUp({ name: 'Maya', email: 'maya@example.com', password: 'longenough' }), {});
  assert.deepEqual(Object.keys(checkSignUp({ name: '', email: 'nope', password: 'short' })).sort(), ['email', 'name', 'password']);
});

test('emails are compared without case or spaces', () => {
  assert.equal(normalizeEmail('  Maya@Example.COM '), 'maya@example.com');
  assert.ok(isEmail(' Maya@Example.com'));
  assert.ok(!isEmail('maya@example'));
});

test('the last Lead is spotted, and Leads are listed first', () => {
  const members = [
    { user_id: 'a', role: 'scout', display_name: 'Zoe' },
    { user_id: 'b', role: 'lead', display_name: 'Dhir' },
    { user_id: 'c', role: 'scout', display_name: 'Ana' },
  ];
  assert.ok(isLastLead(members, 'b'));
  assert.ok(!isLastLead(members, 'a'));
  assert.deepEqual(sortMembers(members).map((m) => m.display_name), ['Dhir', 'Ana', 'Zoe']);
  assert.equal(groupLabel({ program: 'FRC', team_number: 4069 }), 'FRC 4069');
});
