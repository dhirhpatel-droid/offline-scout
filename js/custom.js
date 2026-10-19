// Custom questions with signal: download, add, hide (Leads; the database
// checks). The rules (merging into the Game config) are in custom-rules.js.

import { sb } from './supabase.js';
import { getSetting, setSetting } from './db.js';
import { parseOptions } from './custom-rules.js';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function downloadQuestions(groupId) {
  const rows = must(await sb.from('custom_questions')
    .select('id, section, type, label, options, position, created_at, hidden_at')
    .eq('group_id', groupId).order('position').order('created_at'));
  await setSetting(`questions:${groupId}`, rows);
  return rows;
}

export const cachedQuestions = async (groupId) => (groupId && (await getSetting(`questions:${groupId}`))) || [];

// Leads only (the database checks).
export async function addQuestion(group, { section, type, label, options }) {
  const { data: { user } } = await sb.auth.getUser();
  const existing = await cachedQuestions(group.id);
  must(await sb.from('custom_questions').insert({
    group_id: group.id, section, type, label: label.trim(),
    options: type === 'choice' ? parseOptions(options) : null,
    position: existing.filter((q) => q.section === section).length,
    created_by: user.id,
  }));
  return downloadQuestions(group.id);
}

export async function setHidden(group, id, hidden) {
  must(await sb.from('custom_questions').update({ hidden_at: hidden ? new Date().toISOString() : null }).eq('id', id));
  return downloadQuestions(group.id);
}
