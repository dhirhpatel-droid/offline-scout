// The match scouting screen.
//
//   #match       – the match being scouted now (the draft). Created if needed.
//   #match/<id>  – view or edit a saved match.
//
// Every tap updates the entry and saves it straight away (draft or saved
// match), so closing the tab or a phone dying mid-match loses nothing.

import { h, icon, savedStatus, confirmDialog, setThemeColor } from '../ui.js';
import { renderField } from '../fields.js';
import { loadConfig } from '../config.js';
import { newEntry, refresh, missingRequired, nextMatchCarry } from '../entries.js';
import * as db from '../db.js';

export async function renderMatch({ param }) {
  const editing = Boolean(param);
  let entry = editing ? await db.getEntry(param) : await db.getDraft();

  if (editing && !entry) {
    return { el: notFound() };
  }
  if (!entry) entry = await startNewMatch();

  const config = await loadConfig(entry.configId);
  const screen = h('div', { class: 'screen' });

  // Start on Pre-match if something needed there is still empty
  // (the team number, on a fresh match); otherwise on Auto.
  let current = missingRequired(config, entry).length ? 0 : Math.min(1, config.sections.length - 1);

  // ---------- header ----------
  const backBtn = h('a', {
    class: 'icon-btn', href: editing ? '#saved' : '#home',
    'aria-label': editing ? 'Back to saved matches' : 'Back to home (this match stays saved)',
  }, icon('back'));
  const metaEl = h('div', { class: 'meta' });
  const pointsEl = h('span', { class: 'value num' });
  const teamEl = h('h1', { class: 'team num', tabindex: '-1' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Match periods' });
  const header = h('header', { class: 'match-head' },
    h('div', { class: 'row1' },
      backBtn, metaEl,
      h('div', { class: 'points', 'aria-live': 'polite' },
        pointsEl, h('div', { class: 'label' }, 'est. points')),
    ),
    teamEl,
    tabs,
  );

  const panel = h('main', { class: 'content period', role: 'tabpanel', id: 'period-panel' });
  const bottombar = h('footer', { class: 'bottombar' });
  screen.append(header, panel, bottombar);

  function updateHeader() {
    const { match, team, alliance } = entry.summary;
    screen.dataset.alliance = alliance ?? 'none';
    teamEl.textContent = team ?? 'Team —';
    teamEl.classList.toggle('empty', !team);
    const allianceText = alliance ? `${alliance[0].toUpperCase()}${alliance.slice(1)} alliance` : 'No alliance yet';
    metaEl.textContent = `${match ? `Match ${match}` : 'Match —'} · ${allianceText}`;
    // When the estimate goes up, the header number jumps too.
    if (Number(pointsEl.textContent) < entry.points) {
      pointsEl.classList.remove('jump');
      void pointsEl.offsetWidth;
      pointsEl.classList.add('jump');
    }
    pointsEl.textContent = entry.points;
    // Tint the phone's status bar with the alliance colour.
    setThemeColor(getComputedStyle(screen).getPropertyValue('--alliance').trim());
  }

  async function save() {
    refresh(config, entry);
    if (editing) await db.putEntry(entry);
    else await db.putDraft(entry);
  }

  function onFieldChange(section, field, value) {
    entry.values[`${section.id}.${field.id}`] = value;
    // Remember the scout's name for next time.
    if (field.role === 'scoutName') db.setSetting('scoutName', value);
    // Clear the "needed" message once the field is filled in.
    const row = panel.querySelector(`[data-field-id="${field.id}"]`);
    if (row?.classList.contains('invalid') && value !== '' && value !== null) {
      row.classList.remove('invalid');
      row.querySelector('.error-text')?.remove();
    }
    updateHeaderSoon();
    save();
  }

  // Header + points update on the next frame (keeps fast tapping smooth).
  let frame = 0;
  function updateHeaderSoon() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { refresh(config, entry); updateHeader(); });
  }

  // ---------- tabs + panel ----------
  const tabButtons = config.sections.map((section, i) => {
    const btn = h('button', {
      type: 'button', role: 'tab', id: `tab-${section.id}`, 'aria-controls': 'period-panel',
    }, section.label);
    btn.addEventListener('click', () => showSection(i));
    return btn;
  });
  tabs.append(...tabButtons);

  // Left/right arrow keys move between tabs (standard tab keyboard behaviour).
  tabs.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = (current + step + config.sections.length) % config.sections.length;
    showSection(next);
    tabButtons[next].focus();
  });

  function showSection(i) {
    current = i;
    const section = config.sections[i];
    tabButtons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${section.id}`);

    const duration = section.durationSec
      ? h('span', { class: 'duration' }, formatDuration(section.durationSec))
      : null;
    panel.replaceChildren(
      h('h2', { class: 'section-title' }, section.title ?? section.label, duration),
      section.note ? h('p', { class: 'section-note' }, section.note) : '',
      ...section.fields.map((field) =>
        renderField(field, entry.values[`${section.id}.${field.id}`], (v) => onFieldChange(section, field, v))),
    );
    if (editing && i === config.sections.length - 1) panel.append(deleteButton());
    renderBottombar();
    window.scrollTo({ top: 0 });
  }

  function renderBottombar() {
    const last = current === config.sections.length - 1;
    const action = last
      ? h('button', { class: 'pill', type: 'button', onclick: submit }, editing ? 'Done' : 'Save match')
      : h('button', { class: 'pill', type: 'button', onclick: () => showSection(current + 1) },
          `Next: ${config.sections[current + 1].label}`, icon('next', 20));
    bottombar.replaceChildren(savedStatus(), action);
  }

  // ---------- submit / next match ----------
  async function submit() {
    refresh(config, entry);
    const missing = missingRequired(config, entry);
    if (missing.length) {
      showMissing(missing);
      return;
    }
    entry.submittedAt ??= new Date().toISOString();
    await db.putEntry(entry);

    if (editing) {
      location.hash = '#saved';
      return;
    }
    await db.clearDraft();
    await db.setSetting('nextCarry', nextMatchCarry(entry));
    showDone();
  }

  function showMissing(missing) {
    const sectionIndex = config.sections.indexOf(missing[0].section);
    showSection(sectionIndex);
    for (const { section, field } of missing) {
      if (section !== config.sections[sectionIndex]) continue;
      const row = panel.querySelector(`[data-field-id="${field.id}"]`);
      row.classList.add('invalid');
      row.append(h('p', { class: 'error-text', role: 'alert' }, `Needed before saving: ${field.label.toLowerCase()}`));
    }
    panel.querySelector('.invalid input, .invalid button')?.focus();
  }

  function showDone() {
    const { match, team } = entry.summary;
    const carry = nextMatchCarry(entry);
    tabs.hidden = true;
    panel.removeAttribute('role');
    panel.replaceChildren(h('section', { class: 'done' },
      h('h2', { tabindex: '-1' }, `Match ${match} saved`),
      h('p', {}, `Team ${team} · ${entry.points} estimated points.`),
      h('div', { class: 'actions' },
        h('button', { class: 'pill big block', type: 'button', onclick: startNext },
          carry.match ? `Scout match ${carry.match}` : 'Scout next match'),
        h('a', { class: 'pill secondary block', href: '#saved' }, 'Saved matches'),
        h('a', { class: 'pill secondary block', href: '#home' }, 'Home'),
      ),
    ));
    bottombar.replaceChildren(savedStatus());
    panel.querySelector('h2').focus();
  }

  async function startNext() {
    await startNewMatch();
    // Same URL (#match), so re-render this screen by hand.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function deleteButton() {
    return h('div', { style: 'padding-top: 24px' },
      h('button', { class: 'text-btn danger', type: 'button', onclick: onDelete },
        h('span', { style: 'display:inline-flex;gap:8px;align-items:center' }, icon('trash', 20), 'Delete this match')));
  }

  async function onDelete() {
    const { match, team } = entry.summary;
    const ok = await confirmDialog({
      title: 'Delete this match?',
      body: `Match ${match ?? '—'}, team ${team ?? '—'} will be removed from this device. This can't be undone.`,
      confirmLabel: 'Delete match',
    });
    if (!ok) return;
    await db.deleteEntry(entry.id);
    location.hash = '#saved';
  }

  updateHeader();
  showSection(current);
  return { el: screen };
}

// Creates and saves a fresh draft, pre-filled from settings and the last match.
async function startNewMatch() {
  const [configId, scout, event, carry] = await Promise.all([
    db.getSetting('configId'), db.getSetting('scoutName'), db.getSetting('eventName'), db.getSetting('nextCarry'),
  ]);
  const config = await loadConfig(configId);
  const entry = newEntry(config, { ...carry, scout: scout || carry?.scout, event: event ?? carry?.event });
  await db.putDraft(entry);
  return entry;
}

function formatDuration(sec) {
  return sec >= 60 ? `${sec / 60} min` : `${sec} s`;
}

function notFound() {
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#saved', 'aria-label': 'Back to saved matches' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Match not found')),
    h('main', { class: 'content' },
      h('p', { class: 'plain' }, 'This match is no longer on this device. It may have been deleted.')));
}
