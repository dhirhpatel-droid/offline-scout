// What one scouted match looks like when saved (see docs/data-format.md).
// Pure functions (no DOM, no database) so they are easy to test.

import { estimatePoints } from './scoring.js';
import { findRole } from './config.js';

// A new, empty entry for a config. "carry" holds what we already know:
// the scout's name, the event, and (for "next match") match number + alliance.
export function newEntry(config, { scout, event, match, alliance } = {}, now = new Date()) {
  const values = {};
  const set = (role, value) => {
    const found = findRole(config, role);
    if (found && value !== undefined && value !== null && value !== '') values[found.key] = value;
  };
  set('scoutName', scout);
  set('matchNumber', match);
  set('alliance', alliance);

  const entry = {
    id: makeId(now),
    configId: config.id,
    configVersion: config.version,
    event: event ?? '',
    values,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    submittedAt: null,
  };
  return refresh(config, entry, now);
}

// Recompute the parts that are derived from the values: the points estimate
// and a summary used by the header and the saved-matches list.
export function refresh(config, entry, now = new Date()) {
  const get = (role) => {
    const found = findRole(config, role);
    return found ? entry.values[found.key] ?? null : null;
  };
  entry.summary = {
    scout: get('scoutName'),
    match: get('matchNumber'),
    team: get('teamNumber'),
    alliance: get('alliance'),
  };
  entry.points = estimatePoints(config, entry.values);
  entry.updatedAt = now.toISOString();
  return entry;
}

// Fields with "required": true that are still empty. Returns [{ section, field }].
export function missingRequired(config, entry) {
  const missing = [];
  for (const section of config.sections) {
    for (const field of section.fields) {
      const value = entry.values[`${section.id}.${field.id}`];
      if (field.required && (value === undefined || value === null || value === '')) {
        missing.push({ section, field });
      }
    }
  }
  return missing;
}

// What to carry into the next match: same scout, event and alliance,
// match number + 1. The team number changes every match, so it starts empty.
export function nextMatchCarry(entry) {
  const { scout, match, alliance } = entry.summary;
  return {
    scout,
    event: entry.event,
    alliance,
    match: Number.isFinite(match) ? match + 1 : undefined,
  };
}

// Unique enough for one device, and sortable by time. Later, when matches
// move between phones by QR, ids must not collide, so a random part is added.
function makeId(now) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${now.getTime().toString(36)}-${random}`;
}
