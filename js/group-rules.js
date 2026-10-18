// Rules about Scouting groups that don't need the network (so they're easy to
// test). The database enforces the same rules again (supabase/migrations);
// these just let the app explain problems before sending anything.

export const PROGRAMS = ['FTC', 'FRC'];

// Which game config a new group starts with, per program.
// (FRC gets its own once the FRC 2027 config exists after kickoff.)
export const DEFAULT_GAME_CONFIG = { FTC: 'ftc-2026-biobuzz', FRC: 'ftc-2026-biobuzz' };

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

// Checks the "create a group" form. Returns { field: message } for each problem.
export function checkNewGroup({ program, teamNumber, name }) {
  const errors = {};
  if (!PROGRAMS.includes(program)) errors.program = 'Pick FTC or FRC.';
  const n = Number(teamNumber);
  if (!Number.isInteger(n) || n < 1 || n > 99999) errors.teamNumber = 'Enter your team number (1 to 99999).';
  const trimmed = String(name ?? '').trim();
  if (!trimmed) errors.name = 'Give the group a name, e.g. your team’s name.';
  else if (trimmed.length > 60) errors.name = 'Keep the name under 60 characters.';
  return errors;
}

// Checks the sign-up form.
export function checkSignUp({ name, email, password }) {
  const errors = {};
  const trimmed = String(name ?? '').trim();
  if (!trimmed) errors.name = 'Enter your name, as your team knows you.';
  else if (trimmed.length > 40) errors.name = 'Keep your name under 40 characters.';
  if (!isEmail(email)) errors.email = 'Enter a valid email address.';
  if (String(password ?? '').length < 8) errors.password = 'Use at least 8 characters.';
  return errors;
}

export const isLead = (group) => group?.role === 'lead';

// "FRC 4069"
export const groupLabel = (group) => (group ? `${group.program} ${group.team_number}` : '');

// Can this person be demoted or removed? Not if they're the last Lead.
export function isLastLead(members, userId) {
  const leads = members.filter((m) => m.role === 'lead');
  return leads.length === 1 && leads[0].user_id === userId;
}

// Members sorted for display: Leads first, then by name.
export function sortMembers(members) {
  return [...members].sort((a, b) =>
    (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1)
    || String(a.display_name).localeCompare(String(b.display_name)));
}
