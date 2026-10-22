// QR backup (docs/adr/0004), the rules: turning one Submission into the short
// text inside a QR code, and back. No network, no camera; tested in
// tests/qr-rules.test.js.
//
// The text is "OS1:" followed by a JSON array. To keep each code small enough
// to scan off a phone screen, field names aren't sent: the answers are listed
// in the Game config's own order, so both phones must have the same config
// version (checked when scanning). Times are milliseconds in base 36.
//
//   [format, id, groupId, eventId, scoutId, scoutName, event, configId,
//    configVersion, createdAt, updatedAt, submittedAt, deletedAt,
//    [answers in config order], { answers not in the config, e.g. Custom questions }]

import { fieldKey } from './scoring.js';
import { refresh } from './submissions.js';

export const PREFIX = 'OS1:';
const FORMAT = 1;

const toTime = (iso) => (iso ? Date.parse(iso).toString(36) : 0);
const fromTime = (t) => (t ? new Date(parseInt(t, 36)).toISOString() : null);
const configKeys = (config) => config.sections.flatMap((s) => s.fields.map((f) => fieldKey(s.id, f.id)));

// One Submission → the text for one QR code.
export function pack(config, sub) {
  const keys = configKeys(config);
  const answers = keys.map((k) => sub.values?.[k] ?? null);
  while (answers.length && answers.at(-1) === null) answers.pop(); // trailing blanks cost bytes
  const extra = Object.fromEntries(Object.entries(sub.values ?? {}).filter(([k, v]) => !keys.includes(k) && v != null));
  // Plain ASCII only: any other character (’, é, emoji) becomes a \uXXXX
  // escape that JSON reads back exactly, so every scanner gets the same text.
  return PREFIX + JSON.stringify([
    FORMAT, sub.id, sub.groupId ?? null, sub.eventId ?? null, sub.scoutId ?? null, sub.summary?.scout ?? '',
    sub.event ?? '', sub.configId, sub.configVersion,
    toTime(sub.createdAt), toTime(sub.updatedAt), toTime(sub.submittedAt), toTime(sub.deletedAt),
    answers, extra,
  ]).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The text from a QR code → { sub } or { error } (words for the Lead).
// configs: the Game configs this phone has, by id.
export function unpack(text, configs) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return { error: 'That isn’t an Offline Scout code.' };
  let a;
  try { a = JSON.parse(text.slice(PREFIX.length)); } catch { return { error: 'That code didn’t read fully. Hold steady and try again.' }; }
  if (!Array.isArray(a) || a[0] !== FORMAT) return { error: 'That code comes from a newer version of Offline Scout. Update this phone.' };
  const [, id, groupId, eventId, scoutId, scoutName, event, configId, configVersion, created, updated, submitted, deleted, answers, extra] = a;
  if (!UUID.test(id ?? '')) return { error: 'That code didn’t read fully. Hold steady and try again.' };
  const config = configs[configId];
  if (!config) return { error: 'That match is for a game this phone doesn’t have.' };
  if (config.version !== configVersion) {
    return { error: 'The two phones have different versions of the game. Open Offline Scout on both with signal once, then try again.' };
  }
  const values = {};
  configKeys(config).forEach((k, i) => { if (answers?.[i] != null) values[k] = answers[i]; });
  Object.assign(values, extra ?? {});
  const sub = {
    id, groupId, eventId, scoutId, event, configId, configVersion, values,
    createdAt: fromTime(created), updatedAt: fromTime(updated), submittedAt: fromTime(submitted), deletedAt: fromTime(deleted),
    syncedAt: null, // the Lead's phone uploads it when it has signal
    viaQr: true,
  };
  refresh(config, sub, new Date(sub.updatedAt));
  sub.updatedAt = fromTime(updated); // refresh() stamps the time; keep the Scout's
  if (scoutName && !sub.summary.scout) sub.summary.scout = scoutName;
  return { sub };
}

// What to do with a scanned Submission, given this phone's copy (if any):
//   'add'     – new to this phone
//   'replace' – the scanned one is a newer edit
//   'have'    – this phone already has it (or a newer edit)
export function mergeAction(local, scanned) {
  if (!local) return 'add';
  return Date.parse(scanned.updatedAt) > Date.parse(local.updatedAt) ? 'replace' : 'have';
}
