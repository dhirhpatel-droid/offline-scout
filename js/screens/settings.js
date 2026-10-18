// Settings: which game config is active, light/dark theme, and storage info.

import { h, icon, applyTheme } from '../ui.js';
import { getSetting, setSetting, countSubmissions } from '../db.js';
import { listConfigs } from '../config.js';

export async function renderSettings() {
  const [configs, configId, theme, count, persisted] = await Promise.all([
    listConfigs(), getSetting('configId'), getSetting('theme'), countSubmissions(),
    navigator.storage?.persisted?.() ?? Promise.resolve(false),
  ]);
  const activeId = configId ?? configs[0].id;

  const gameRows = configs.map((c) => {
    const input = h('input', { type: 'radio', name: 'config', value: c.id, checked: c.id === activeId });
    input.addEventListener('change', () => setSetting('configId', c.id));
    return h('label', { class: 'radio-row' }, input, c.name);
  });

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
      h('section', { class: 'group' },
        h('h2', {}, 'Game'),
        ...gameRows,
        h('p', { class: 'plain', style: 'margin-top:8px' }, 'Used for new matches. Saved matches keep the game they were scouted with.')),
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
