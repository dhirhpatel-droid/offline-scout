// A Submission: one Scout's record of what one Team did in one Match
// (GLOSSARY.md, docs/data-format.md). Pure functions only (no DOM, no database)
// so they are easy to test.

import { estimatePoints } from './scoring.js';
import { findRole } from './config.js';

// A new, empty Submission for a game config. "carry" holds what we already
// know: the scout's name, the event, and (for "next match") the match level,
// match number and Alliance position.
export function newSubmission(config, carry = {}, now = new Date()) {
  const { scout, event, level = 'qual', match, position } = carry;
  const values = {};
  const set = (role, value) => {
    const found = findRole(config, role);
    if (found && value !== undefined && value !== null && value !== '') values[found.key] = value;
  };
  set('scoutName', scout);
  set('matchLevel', level);
  set('matchNumber', match);
  set('alliancePosition', position);

  const submission = {
    // A UUID made on the phone, so Submissions made offline on different
    // phones can never get the same id when they sync (docs/adr/0001).
    id: crypto.randomUUID(),
    configId: config.id,
    configVersion: config.version,
    event: event ?? '',
    values,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    submittedAt: null, // set when the Scout taps Save; null while it's a Draft
    syncedAt: null, // set when the server has this version (Milestone 3)
  };
  return refresh(config, submission, now);
}

// Recompute what is derived from the values: Estimated points and a summary
// used by the header and the saved list (so lists don't need the config).
export function refresh(config, submission, now = new Date()) {
  const get = (role) => {
    const found = findRole(config, role);
    return found ? submission.values[found.key] ?? null : null;
  };
  const position = get('alliancePosition');
  submission.summary = {
    scout: get('scoutName'),
    level: get('matchLevel'),
    match: get('matchNumber'),
    team: get('teamNumber'),
    position,
    alliance: allianceOf(position),
    // Only when the robot didn't show, so lists can say why it has 0 points.
    ...(get('noShow') === true ? { noShow: true } : {}),
  };
  submission.estimatedPoints = estimatePoints(config, submission.values);
  submission.updatedAt = now.toISOString();
  return submission;
}

// True when this phone has a version the server hasn't got yet.
export function needsSync(submission) {
  if (!submission.submittedAt) return false; // Drafts never sync
  return !submission.syncedAt || submission.updatedAt > submission.syncedAt;
}
// (js/sync-rules.js uses the same rule under the name hasUnsentChanges.)

// Fields with "required": true that are still empty. Returns [{ section, field }].
export function missingRequired(config, submission) {
  const missing = [];
  for (const section of config.sections) {
    for (const field of section.fields) {
      const value = submission.values[`${section.id}.${field.id}`];
      if (field.required && (value === undefined || value === null || value === '')) {
        missing.push({ section, field });
      }
    }
  }
  return missing;
}

// What to carry into the next match: same scout, event, match level and
// Alliance position, match number + 1. The team changes every match.
export function nextMatchCarry(submission) {
  const { scout, level, match, position } = submission.summary;
  return {
    scout,
    event: submission.event,
    level: level ?? 'qual',
    position,
    match: Number.isFinite(match) ? match + 1 : undefined,
  };
}

// ---------- Alliance positions: "red1" means Red 1 ----------

// Every position for a config, e.g. FTC: red1 red2 blue1 blue2.
export function alliancePositions(config) {
  const { colors, robotsPerAlliance } = config.alliance;
  return colors.flatMap((color) =>
    Array.from({ length: robotsPerAlliance }, (_, i) => `${color}${i + 1}`));
}

// "red1" → "red". Also accepts a bare colour ("red"), which Milestone 1 saved.
export function allianceOf(position) {
  return position ? position.replace(/\d+$/, '') : null;
}

// "red1" → "Red 1", "red" → "Red".
export function positionLabel(position) {
  if (!position) return '';
  const color = allianceOf(position);
  const number = position.slice(color.length);
  return `${color[0].toUpperCase()}${color.slice(1)}${number ? ` ${number}` : ''}`;
}

// ---------- Milestone 1 data ----------

// Converts an "entry" saved by Milestone 1 into a Submission. Milestone 1 only
// knew the alliance colour, not the position, so "red" is kept as it is (shown
// as "Red"); every Milestone 1 match was a qualification match.
export function fromMilestone1(entry, newId = crypto.randomUUID()) {
  const values = { ...entry.values };
  if ('pre.alliance' in values) {
    values['pre.position'] = values['pre.alliance'];
    delete values['pre.alliance'];
  }
  values['pre.level'] ??= 'qual';
  const position = values['pre.position'] ?? null;
  return {
    id: newId,
    configId: entry.configId,
    configVersion: entry.configVersion,
    event: entry.event ?? '',
    values,
    summary: {
      scout: values['pre.scout'] ?? null,
      level: 'qual',
      match: values['pre.match'] ?? null,
      team: values['pre.team'] ?? null,
      position,
      alliance: allianceOf(position),
    },
    estimatedPoints: entry.points ?? 0,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    submittedAt: entry.submittedAt ?? null,
    syncedAt: null,
  };
}

// ---------- how a Submission is described on screen ----------

// "Q18" for qualification 18, "P3" for playoff 3, "Q—" when not filled in yet.
export function matchCode(summary) {
  const prefix = summary?.level === 'playoff' ? 'P' : 'Q';
  return `${prefix}${summary?.match ?? '—'}`;
}

// Where this Submission's data is: still a Draft, on this phone waiting to
// send, or sent to the group (js/sync.js sets syncedAt when the server has it).
export function syncStatus(submission) {
  if (!submission.submittedAt) return { state: 'draft', text: 'Not saved yet' };
  if (needsSync(submission)) return { state: 'local', text: 'On this phone · not sent yet' };
  return { state: 'sent', text: 'Sent to your group' };
}
