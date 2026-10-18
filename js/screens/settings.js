// Settings: your account, the game your group scouts, light/dark theme, and storage info.

import { h, icon, applyTheme, formField, formMessage, busy, confirmDialog } from '../ui.js';
import { cachedProfile, updateDisplayName, signOut, currentGroup } from '../account.js';
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
  const saveName = h('button', { class: 'small-btn', type: 'submit' }, 'Save name');
  const nameForm = h('form', { class: 'form', novalidate: true }, message.el, name.el, h('div', {}, saveName));
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
  const signOutBtn = h('button', { class: 'text-btn danger', type: 'button' }, 'Sign out');
  signOutBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Sign out?',
      body: 'Matches saved on this phone stay on it. Signing back in needs signal.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await signOut();
    location.hash = '#auth';
  });

  const group = await currentGroup();
  const game = configs.find((c) => c.id === (group?.game_config_id ?? configId)) ?? configs[0];

  const themes = [['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']];
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
      h('section', { class: 'group' }, h('h2', {}, 'Account'), nameForm, signOutBtn),
      h('section', { class: 'group' },
        h('h2', {}, 'Game'),
        h('p', {}, game.name),
        h('p', { class: 'plain', style: 'margin-top:4px' }, 'Set by your Scouting group, so everyone scouts the same game.')),
      h('section', { class: 'group' }, h('h2', { id: 'theme-h' }, 'Theme'), themeGroup,
        h('p', { class: 'plain', style: 'margin-top:8px' }, 'Light is easiest to read in bright light.')),
      h('section', { class: 'group' },
        h('h2', {}, 'Storage'),
        h('p', {}, `${count} ${count === 1 ? 'match' : 'matches'} saved on this device.`),
        h('p', { class: 'plain', style: 'margin-top:4px' }, persisted
          ? 'Protected: the browser will not clear it to free up space.'
          : 'If the phone gets very low on space, the browser could clear it. Adding the app to your home screen helps protect it.')),
    ),
  );
  return { el };
}
