// Settings: your account, the game your group scouts, light/dark theme, and storage info.

import { h, icon, applyTheme, formField, formMessage, busy, confirmDialog } from '../ui.js';
import { cachedProfile, updateDisplayName, signOut, currentGroup, setGroupGame } from '../account.js';
import { isLead } from '../group-rules.js';
import { nowScoutingBar } from '../now-scouting.js';
import { listSubmissions } from '../db.js';
import { needsSync } from '../submissions.js';
import { friendlyError, isOnline } from '../supabase.js';
import { getSetting, setSetting, countSubmissions } from '../db.js';
import { listConfigs } from '../config.js';

export async function renderSettings() {
  const [configs, configId, theme, count, persisted, profile] = await Promise.all([
    listConfigs(), getSetting('configId'), getSetting('theme'), countSubmissions(),
    navigator.storage?.persisted?.() ?? Promise.resolve(false), cachedProfile(),
  ]);

  // Account: change your name (shown to your group), sign out.
  const message = formMessage();
  const name = formField('Your name', { type: 'text', autocomplete: 'nickname', autocapitalize: 'words', maxlength: 40 },
    profile?.email ? `Signed in as ${profile.email}` : null);
  name.input.value = profile?.display_name ?? '';
  // Save only lights up once the name has actually changed.
  const saveName = h('button', { class: 'pill block', type: 'submit', hidden: true }, 'Save name');
  name.input.addEventListener('input', () => { saveName.hidden = name.input.value.trim() === (profile?.display_name ?? ''); });
  const nameForm = h('form', { class: 'form', novalidate: true }, message.el, name.el, h('div', { class: 'actions' }, saveName));
  nameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = name.input.value.trim();
    if (!value) return name.setError('Enter your name, as your team knows you.');
    if (!isOnline()) return message.show('No connection right now. Changing your name needs signal.', 'error');
    await busy(saveName, 'Saving…', async () => {
      try {
        await updateDisplayName(value);
        message.show('Name saved.', 'info');
      } catch (err) { message.show(friendlyError(err), 'error'); }
    });
  });
  const signOutBtn = h('button', { class: 'pill secondary block', type: 'button' }, 'Sign out');
  signOutBtn.addEventListener('click', async () => {
    const unsent = (await listSubmissions()).filter(needsSync).length;
    const ok = await confirmDialog({
      title: 'Sign out?',
      body: `${unsent ? `${unsent} ${unsent === 1 ? 'match hasn’t' : 'matches haven’t'} been sent to your group yet. They stay on this phone. ` : 'Matches saved on this phone stay on it. '}Signing back in needs signal.`,
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await signOut();
    location.hash = '#auth';
  });

  const group = await currentGroup();
  const game = configs.find((c) => c.id === (group?.game_config_id ?? configId)) ?? configs[0];

  // The game the group scouts: Leads choose it, Scouts see it.
  const gameMessage = formMessage();
  const programMismatch = Boolean(group) && !game.name.startsWith(group.program);
  const gameSection = isLead(group) && configs.length > 1
    ? configs.map((c) => {
        const input = h('input', { type: 'radio', name: 'game', value: c.id, checked: c.id === game.id });
        input.addEventListener('change', async () => {
          try {
            await setGroupGame(group.id, c.id);
            gameMessage.show('Game changed for the whole group. New matches use it.', 'info');
          } catch (err) { gameMessage.show(friendlyError(err), 'error'); }
        });
        return h('label', { class: 'radio-row' }, input, c.name);
      })
    : [h('p', { class: 'setting-value' }, game.name)];

  const themes = [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
  const themeGroup = h('div', { class: 'segmented wide', role: 'group', 'aria-labelledby': 'theme-h' });
  const themeButtons = themes.map(([value, label]) => {
    const btn = h('button', { type: 'button', 'aria-pressed': String((theme ?? 'system') === value) }, label);
    btn.addEventListener('click', () => {
      themeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      setSetting('theme', value);
      applyTheme(value);
    });
    return btn;
  });
  themeGroup.append(...themeButtons);

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Settings')),
    h('main', { class: 'content' },
      h('section', { class: 'group' }, h('h2', {}, 'Account'), nameForm),
      h('section', { class: 'group' },
        h('h2', {}, 'Game'),
        gameMessage.el,
        ...gameSection,
        programMismatch
          ? h('p', { class: 'plain', style: 'margin-top:8px' }, `This is an ${game.name.split(' ')[0]} game and your group is ${group.program}. The ${group.program} game is added after its kickoff.`)
          : h('p', { class: 'plain', style: 'margin-top:8px' }, 'Set by your group’s Leads, so everyone scouts the same game.')),
      h('section', { class: 'group' }, h('h2', { id: 'theme-h' }, 'Theme'), themeGroup,
        h('p', { class: 'plain', style: 'margin-top:8px' }, 'Light is easiest to read in sunlight. Auto follows your phone’s setting.')),
      h('section', { class: 'group' },
        h('h2', {}, 'Storage'),
        h('p', { class: 'setting-value' }, `${count} ${count === 1 ? 'match' : 'matches'} saved on this phone`),
        h('p', { class: 'plain', style: 'margin-top:4px' }, persisted
          ? 'Protected: the browser will not clear it to free up space.'
          : 'Add Offline Scout to your home screen so the phone keeps your matches safe, even when it’s low on space.')),
      h('section', { class: 'group danger-zone' }, signOutBtn),
    ),
    await nowScoutingBar(),
  );
  return { el };
}
