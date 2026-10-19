// Custom questions (GLOSSARY.md), the rules (no network; tested in
// tests/custom-rules.test.js): extra questions a Lead adds for their own
// Scouting group, shown in a period of the match next to the game's fields.
//
// The phone keeps a copy as questions:<groupId>, so they show offline.
// Answers live in the Submission's values like any other answer, under
// "<section>.custom-<question id>". Scoring only reads the Game config's
// fields, so a Custom question can never add to Estimated points.

// The kinds a Lead can pick, with the words the editor shows.
export const QUESTION_TYPES = [
  ['toggle', 'Yes / No'],
  ['counter', 'Count'],
  ['choice', 'Pick one'],
  ['rating', 'Rating 1–5'],
  ['text', 'Short note'],
];

// The key an answer is saved under, e.g. "teleop.custom-1f2e…".
export const customKey = (q) => `${q.section}.custom-${q.id}`;

// Checks a new question before it's sent (the database checks again).
// Returns { field: message } for anything wrong.
export function checkQuestion({ label, type, options }) {
  const errors = {};
  if (!label?.trim()) errors.label = 'Write the question.';
  else if (label.trim().length > 80) errors.label = 'Keep it under 80 characters.';
  if (!QUESTION_TYPES.some(([t]) => t === type)) errors.type = 'Pick what kind of answer it takes.';
  if (type === 'choice') {
    const list = parseOptions(options);
    if (list.length < 2 || list.length > 6) errors.options = 'Give 2 to 6 answers, separated by commas.';
  }
  return errors;
}

// "Left, Right , ,Middle" → ["Left", "Right", "Middle"]
export function parseOptions(text) {
  return [...new Set(String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
}

// One Custom question as a Game config field, so the match screen and the
// Team page can treat it like any other field. No "points": ever.
export function toField(q) {
  const field = { id: `custom-${q.id}`, type: q.type, label: q.label, custom: true, hint: 'Your group’s question · no points' };
  if (q.type === 'choice') field.options = (q.options ?? []).map((o) => ({ value: o, label: o }));
  if (q.type === 'rating') Object.assign(field, { min: 1, max: 5 });
  return field;
}

// The Game config with the group's Custom questions added to their sections.
// Hidden questions are left out, unless this Submission already answered one
// (so old answers can still be seen and edited). A question for a section the
// game doesn't have goes in the last section.
export function withCustom(config, questions = [], values = {}) {
  const sections = config.sections.map((s) => ({ ...s, fields: [...s.fields] }));
  const sorted = [...questions].sort((a, b) => a.position - b.position || a.created_at?.localeCompare?.(b.created_at ?? '') || 0);
  for (const q of sorted) {
    const section = sections.find((s) => s.id === q.section) ?? sections.at(-1);
    const answered = values[`${section.id}.custom-${q.id}`] !== undefined;
    if (q.hidden_at && !answered) continue;
    section.fields.push(toField(q));
  }
  return { ...config, sections };
}

