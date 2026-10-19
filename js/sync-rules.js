// The rules for syncing Submissions, without any network or storage, so they
// are easy to test (tests/sync-rules.test.js). js/sync.js uses them.
//
// A phone's copy and the server's copy can differ. The rule (docs/adr/0001):
// the edit made LATER wins, judged by when it was made on a phone
// (updatedAt), not by when it reached the server.

import { allianceOf, needsSync } from './submissions.js';

// Phone Submission → the JSON the server's save_submission() expects.
export function toServer(sub) {
  const s = sub.summary ?? {};
  return {
    id: sub.id,
    group_id: sub.groupId,
    scout_name: s.scout ?? 'Scout',
    event: sub.event ?? '',
    event_id: sub.eventId ?? null,
    config_id: sub.configId,
    config_version: sub.configVersion,
    match_level: s.level ?? null,
    match_number: s.match ?? null,
    team_number: s.team ?? null,
    alliance_position: s.position ?? null,
    values: sub.values,
    estimated_points: sub.estimatedPoints ?? 0,
    created_at: sub.createdAt,
    updated_at: sub.updatedAt,
    submitted_at: sub.submittedAt,
    deleted_at: sub.deletedAt ?? null,
  };
}

// A server row → a phone Submission (marked as in sync with the server).
export function fromServer(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    scoutId: row.scout_id,
    configId: row.config_id,
    configVersion: row.config_version,
    event: row.event ?? '',
    eventId: row.event_id ?? null,
    values: row.values ?? {},
    summary: {
      scout: row.scout_name,
      level: row.match_level,
      match: row.match_number,
      team: row.team_number,
      position: row.alliance_position,
      alliance: allianceOf(row.alliance_position),
    },
    estimatedPoints: row.estimated_points ?? 0,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    submittedAt: row.submitted_at ? iso(row.submitted_at) : null,
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
    syncedAt: iso(row.updated_at),
  };
}

// Postgres and JavaScript write times differently ("…+00:00" vs "…Z");
// store them one way so comparing them as text works.
const iso = (t) => new Date(t).toISOString();

// Does the phone have changes the server hasn't got? (Drafts never sync.)
export const hasUnsentChanges = needsSync;

// What to do with a row that came from the server, given the phone's copy:
//   'add'     – the phone doesn't have it yet
//   'replace' – the server's version is the one to keep
//   'remove'  – it was deleted (and the phone has no newer edit)
//   'keep'    – the phone's own edit is newer; it will be sent next
//   'skip'    – deleted, and the phone never had it
export function decide(local, remoteRow) {
  const remote = fromServer(remoteRow);
  if (!local) return remote.deletedAt ? 'skip' : 'add';
  if (hasUnsentChanges(local) && local.updatedAt > remote.updatedAt) return 'keep';
  return remote.deletedAt ? 'remove' : 'replace';
}

// Matches made before an account or group existed get claimed by the person
// syncing them, for their current group.
export function claim(sub, { userId, groupId }) {
  return { ...sub, scoutId: sub.scoutId ?? userId, groupId: sub.groupId ?? groupId };
}
