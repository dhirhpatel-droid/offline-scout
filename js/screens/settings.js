// Settings: your account, the game your group scouts, light/dark theme, and storage info.

import { backHref } from '../nav.js';
import { h, icon, applyTheme, formField, formMessage, busy, confirmDialog, topbar } from '../ui.js';
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
    if (!isOnline()) return message.show('This phone has no signal right now. Changing your name needs signal.', 'error');
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
    topbar('Settings', backHref('#home')),
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
      helpSection(),
      h('section', { class: 'group danger-zone' }, signOutBtn),
    ),
    await nowScoutingBar(),
  );
  return { el };
}

// Short answers to what scouts ask in the stands. Each one opens in place
// (no extra screen to get lost in) and works offline like everything else.
const HELP = [
  ['What are “est. pts”?',
    'Points worked out from your taps, using the point values in this season’s game. It isn’t the official score: '
    + 'fouls are recorded but not taken off, because in FTC a foul gives points to the other alliance.'],
  ['What if there’s no signal?',
    'Nothing changes while you scout. Every tap is saved on this phone straight away, even if the app closes. '
    + 'Your matches go to your group the next time the phone has signal, usually before you go in or after you leave the gym.'],
  ['Where does the schedule come from?',
    'Your Lead picks the event, and its teams and match schedule download from FIRST’s public results (through FTCScout). '
    + 'Team numbers then fill in by themselves when you enter the match and position.'],
  ['What is an Assignment?',
    'Your Lead’s plan for who watches what: a position for some matches (“Red 1, Q1–Q20”) or one team in every match it plays. '
    + 'Your next one is at the top of Home. You can still scout any other match; it counts too.'],
  ['Watching two teams at once?',
    'If your Lead gives you two teams in one match, both team numbers show at the top of the match screen. '
    + 'Tap one to switch; each keeps its own taps. After you save the first, the second opens.'],
  ['Made a mistake?',
    'Tap minus to undo a count. Saved matches can be opened from My matches and edited; every change is kept.'],
];

function helpSection() {
  return h('section', { class: 'group help' },
    h('h2', {}, 'How it works'),
    HELP.map(([q, a]) => h('details', { class: 'help-item' },
      h('summary', {}, h('span', {}, q), icon('next', 18)),
      h('p', {}, a))));
}
