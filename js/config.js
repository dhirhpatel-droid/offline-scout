// Game configs: loading them and checking they are valid.
// A config is a JSON file in configs/ that lists the sections (match periods)
// and the fields scouts fill in. The app builds every screen from it, so a new
// season (or FRC) means a new JSON file, not new code.

export const FIELD_TYPES = ['text', 'number', 'choice', 'toggle', 'counter', 'rating', 'notes', 'position'];

// Roles tell the app which fields carry special meaning (the header, the
// "next match" button), so the app never depends on one game's field names.
export const ROLES = ['scoutName', 'matchLevel', 'matchNumber', 'teamNumber', 'alliancePosition', 'noShow'];
const REQUIRED_ROLES = ['scoutName', 'matchLevel', 'matchNumber', 'teamNumber', 'alliancePosition'];

// Returns a list of problems. An empty list means the config is valid.
export function validateConfig(config) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  if (!config || typeof config !== 'object') return ['Config is not an object'];
  if (!config.id) fail('Missing "id"');
  if (!Number.isInteger(config.version)) fail('"version" must be a whole number');
  if (!config.alliance || !Array.isArray(config.alliance.colors) || config.alliance.colors.length < 2) {
    fail('"alliance.colors" must list at least two colours');
  }
  if (!Number.isInteger(config.alliance?.robotsPerAlliance) || config.alliance.robotsPerAlliance < 1) {
    fail('"alliance.robotsPerAlliance" must be a whole number');
  }
  if (!Array.isArray(config.sections) || config.sections.length === 0) {
    fail('"sections" must be a non-empty list');
    return errors;
  }

  const sectionIds = new Set();
  const rolesSeen = new Set();

  for (const section of config.sections) {
    if (!section.id) fail('A section is missing "id"');
    if (sectionIds.has(section.id)) fail(`Section "${section.id}" appears twice`);
    sectionIds.add(section.id);
    if (!section.label) fail(`Section "${section.id}" is missing "label"`);
    if (!Array.isArray(section.fields)) {
      fail(`Section "${section.id}" needs a "fields" list`);
      continue;
    }

    const fieldIds = new Set();
    for (const field of section.fields) {
      const where = `${section.id}.${field.id}`;
      if (!field.id) fail(`A field in "${section.id}" is missing "id"`);
      if (fieldIds.has(field.id)) fail(`Field "${where}" appears twice`);
      fieldIds.add(field.id);
      if (!FIELD_TYPES.includes(field.type)) fail(`Field "${where}" has unknown type "${field.type}"`);
      if (!field.label) fail(`Field "${where}" is missing "label"`);
      if (field.width !== undefined && !['half', 'full'].includes(field.width)) {
        fail(`Field "${where}" has "width" "${field.width}" (use "half" or "full")`);
      }
      if (field.points !== undefined && typeof field.points !== 'number') {
        fail(`Field "${where}" has non-number "points"`);
      }
      if (field.type === 'choice' && (!Array.isArray(field.options) || field.options.length < 2)) {
        fail(`Choice "${where}" needs at least two options`);
      }
      if (field.type === 'rating' && !(field.min < field.max)) {
        fail(`Rating "${where}" needs "min" smaller than "max"`);
      }
      if (field.type === 'rating' && field.labels && field.labels.length !== field.max - field.min + 1) {
        fail(`Rating "${where}" needs one label per step (${field.max - field.min + 1})`);
      }
      if (field.hidden !== undefined && typeof field.hidden !== 'boolean') {
        fail(`Field "${where}" has non-true/false "hidden"`);
      }
      if (field.hidden && field.required && !field.role) {
        fail(`Field "${where}" is hidden and required but has no role to fill it in`);
      }
      if (field.role) {
        if (!ROLES.includes(field.role)) fail(`Field "${where}" has unknown role "${field.role}"`);
        if (rolesSeen.has(field.role)) fail(`Role "${field.role}" is used twice`);
        rolesSeen.add(field.role);
      }
    }
  }

  // "showWith" shows a section inside another section's tab (e.g. Endgame in Teleop).
  for (const section of config.sections) {
    if (section.showWith !== undefined) {
      const host = config.sections.find((x) => x.id === section.showWith);
      if (!host) fail(`Section "${section.id}" has "showWith" "${section.showWith}", which isn't a section`);
      else if (host.showWith) fail(`Section "${section.id}" can't show with "${host.id}", which is itself shown with another`);
    }
  }

  for (const role of REQUIRED_ROLES) {
    if (!rolesSeen.has(role)) fail(`No field has role "${role}"`);
  }

  // The match level field must offer exactly qualification and playoff.
  const levelField = findRole(config, 'matchLevel')?.field;
  if (levelField?.options) {
    const values = levelField.options.map((o) => o.value).sort().join();
    if (values !== 'playoff,qual') fail('Match level options must be "qual" and "playoff"');
  }

  // The Alliance position field draws its buttons from "alliance", so it needs no options.
  const positionField = findRole(config, 'alliancePosition')?.field;
  if (positionField && positionField.type !== 'position') {
    fail('The alliancePosition field must have type "position"');
  }

  return errors;
}

// Finds the field that has a role, e.g. findRole(config, 'teamNumber').
// Returns { section, field, key } or undefined.
export function findRole(config, role) {
  for (const section of config.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.role === role) return { section, field, key: `${section.id}.${field.id}` };
    }
  }
  return undefined;
}

// Browser only: fetch the list of configs, then one config by id.
// Both go through the service worker, so they work offline after the first visit.
export async function listConfigs() {
  const res = await fetch('configs/index.json');
  return res.json();
}

export async function loadConfig(id) {
  const list = await listConfigs();
  const listed = list.find((c) => c.id === id) ?? list[0];
  const config = await (await fetch(listed.file)).json();
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`Config "${listed.id}" is invalid:\n${errors.join('\n')}`);
  return config;
}
