// Estimated points for one robot in one match.
// Pure function: it only reads the config and the values, so it is easy to test
// (see tests/scoring.test.js) and works the same for any game config.

// Values are stored under "section.field", e.g. "auto.hiveTips", so the Auto
// and Teleop HIVE TIP counters never overwrite each other.
export function fieldKey(sectionId, fieldId) {
  return `${sectionId}.${fieldId}`;
}

export function estimatePoints(config, values) {
  let total = 0;

  for (const section of config.sections) {
    for (const field of section.fields) {
      const value = values[fieldKey(section.id, field.id)];

      // A robot that never showed up scored nothing, whatever else was tapped.
      if (field.role === 'noShow' && value === true) return 0;

      total += pointsForField(field, value);
    }
  }

  return total;
}

// Estimated points per section, e.g. { pre: 0, auto: 23, teleop: 26, end: 5, post: 0 }.
// Used for the breakdown on the "saved" screen. A no-show scores 0 everywhere.
export function pointsBySection(config, values) {
  const total = estimatePoints(config, values);
  const result = {};
  for (const section of config.sections) {
    result[section.id] = total === 0 ? 0 : section.fields.reduce(
      (sum, field) => sum + pointsForField(field, values[fieldKey(section.id, field.id)]), 0);
  }
  return result;
}

function pointsForField(field, value) {
  switch (field.type) {
    case 'toggle':
      // "points" on a toggle = points when it is Yes.
      return value === true ? field.points ?? 0 : 0;
    case 'counter':
      // "points" on a counter = points for each one counted.
      return Math.max(0, Number(value) || 0) * (field.points ?? 0);
    case 'choice': {
      // A choice can give points per option (FRC climbs will need this).
      const option = field.options.find((o) => o.value === value);
      return option?.points ?? 0;
    }
    default:
      // text, number, rating and notes never score.
      return 0;
  }
}
