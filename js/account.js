// Accounts and Scouting groups: talking to Supabase, and keeping a copy on
// the phone so everything still shows offline.
//
// Copies kept in IndexedDB settings (js/db.js):
//   profile        – { id, email, display_name }
//   groups         – [{ id, program, team_number, name, role, game_config_id, settings }]
//   currentGroupId – the group the phone is scouting for

import { sb, APP_URL, isOnline } from './supabase.js';
import { getSetting, setSetting } from './db.js';
import { normalizeEmail, DEFAULT_GAME_CONFIG } from './group-rules.js';

// Throws the Supabase error if there is one, otherwise returns the data.
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---------- signing in ----------

// The signed-in user, or null. Works offline (reads the saved session).
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export function signUp({ name, email, password }) {
  return sb.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: { data: { display_name: name.trim() }, emailRedirectTo: APP_URL },
  }).then(must);
}

export async function signIn({ email, password }) {
  const data = must(await sb.auth.signInWithPassword({ email: normalizeEmail(email), password }));
  await refreshAccount();
  return data;
}

export async function signOut() {
  await sb.auth.signOut({ scope: 'local' }); // works offline too
  for (const key of ['profile', 'groups', 'currentGroupId']) await setSetting(key, null);
}

export const sendPasswordReset = (email) =>
  sb.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: APP_URL }).then(must);

// Used after a password-reset link, and by invited people setting up their account.
export async function setPasswordAndName({ password, name }) {
  must(await sb.auth.updateUser({ password, data: name ? { display_name: name } : undefined }));
  if (name) await updateDisplayName(name);
}

// ---------- the phone's copy ----------

export const cachedProfile = () => getSetting('profile');
export const cachedGroups = async () => (await getSetting('groups')) ?? [];

export async function currentGroup() {
  const [groups, id] = await Promise.all([cachedGroups(), getSetting('currentGroupId')]);
  return groups.find((g) => g.id === id) ?? groups[0] ?? null;
}

export const setCurrentGroup = (id) => setSetting('currentGroupId', id);

// Downloads the profile and the groups you're in, and saves a copy on the
// phone. Quietly does nothing without signal (the saved copy is used instead).
export async function refreshAccount() {
  const user = await currentUser();
  if (!user || !isOnline()) return false;
  try {
    const profile = must(await sb.from('profiles').select('id, display_name').eq('id', user.id).single());
    const rows = must(await sb.from('memberships')
      .select('role, groups (id, program, team_number, name, game_config_id, settings)')
      .eq('user_id', user.id));
    const groups = rows.map((r) => ({ ...r.groups, role: r.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    await setSetting('profile', { ...profile, email: user.email });
    await setSetting('groups', groups);
    // Scout name on new Submissions = your display name.
    await setSetting('scoutName', profile.display_name);
    return true;
  } catch (err) {
    console.warn('Could not refresh account (using the saved copy):', err);
    return false;
  }
}

export async function updateDisplayName(name) {
  const user = await currentUser();
  must(await sb.from('profiles').update({ display_name: name.trim() }).eq('id', user.id));
  await refreshAccount();
}

// ---------- groups ----------

export async function createGroup({ program, teamNumber, name }) {
  const id = must(await sb.rpc('create_group', {
    p_program: program,
    p_team_number: Number(teamNumber),
    p_name: name.trim(),
    p_game_config_id: DEFAULT_GAME_CONFIG[program],
  }));
  await refreshAccount();
  await setCurrentGroup(id);
  return id;
}

// Members of a group, with their names. (Needs signal.)
export async function listMembers(groupId) {
  const rows = must(await sb.from('memberships').select('user_id, role, joined_at').eq('group_id', groupId));
  const ids = rows.map((r) => r.user_id);
  const profiles = ids.length ? must(await sb.from('profiles').select('id, display_name').in('id', ids)) : [];
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
  return rows.map((r) => ({ ...r, display_name: names[r.user_id] ?? 'Member' }));
}

export const setRole = (groupId, userId, role) =>
  sb.from('memberships').update({ role }).eq('group_id', groupId).eq('user_id', userId).then(must);

export async function removeMember(groupId, userId) {
  must(await sb.from('memberships').delete().eq('group_id', groupId).eq('user_id', userId));
  if (userId === (await currentUser())?.id) await refreshAccount(); // you left
}

// ---------- invites ----------

// Open Invites a Lead has sent for a group.
export const listGroupInvites = (groupId) =>
  sb.from('invites').select('id, email, created_at, expires_at')
    .eq('group_id', groupId).is('accepted_at', null).order('created_at').then(must);

export const cancelInvite = (id) => sb.from('invites').delete().eq('id', id).then(must);

// Sends an Invite through the server function (supabase/functions/send-invite).
// Returns { emailed, hasAccount, emailError? }.
export async function sendInvite(groupId, email) {
  const { data, error } = await sb.functions.invoke('send-invite', {
    body: { groupId, email: normalizeEmail(email), redirectTo: APP_URL },
  });
  if (error) {
    // The function's own message (e.g. "Only a Lead...") is in the response body.
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return data;
}

// Invites sent to the signed-in person's email, with the group's label.
export async function myPendingInvites() {
  const user = await currentUser();
  if (!user || !isOnline()) return [];
  const invites = must(await sb.from('invites')
    .select('id, group_id, group_label, invited_by_name, expires_at')
    .eq('email', normalizeEmail(user.email)).is('accepted_at', null));
  return invites.filter((i) => new Date(i.expires_at) > new Date());
}

export async function acceptInvite(inviteId) {
  const groupId = must(await sb.rpc('accept_invite', { p_invite_id: inviteId }));
  await refreshAccount();
  await setCurrentGroup(groupId);
  return groupId;
}
