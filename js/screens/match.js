// The match scouting screen.
//
//   #match       – the match being scouted now (the Draft). Created if needed.
//   #match/<id>  – view or edit a saved Submission.
//
// Every tap updates the Submission and saves it straight away (Draft or saved
// Submission), so closing the tab or a phone dying mid-match loses nothing.
//
// Tabs come from the game config's sections. A section with "showWith" (e.g.
// Endgame) appears inside another section's tab, so there are fewer steps.

import { h, icon, savedStatus, confirmDialog, setThemeColor } from '../ui.js';
import { renderField } from '../fields.js';
import { loadConfig } from '../config.js';
import { pointsBySection } from '../scoring.js';
import {
  newSubmission, refresh, missingRequired, nextMatchCarry, positionLabel, matchCode, syncStatus,
} from '../submissions.js';
import * as db from '../db.js';
import { currentGroup, cachedProfile } from '../account.js';

export async function renderMatch({ param }) {
  const editing = Boolean(param);
  let submission = editing ? await db.getSubmission(param) : await db.getDraft();

  if (editing && !submission) return { el: notFound() };
  if (!submission) submission = await startNewMatch();

  const config = await loadConfig(submission.configId);
  // Fill in the scout from the account if a hidden field still needs it.
  const profile = await cachedProfile();
  if (profile?.display_name && !submission.values['pre.scout']) {
    submission.values['pre.scout'] = profile.display_name;
    refresh(config, submission);
  }

  // Tabs: sections that aren't shown inside another one.
  const tabSections = config.sections.filter((s) => !s.showWith);
  const guestsOf = (section) => config.sections.filter((s) => s.showWith === section.id);
  const tabOf = (section) => tabSections.find((t) => t.id === (section.showWith ?? section.id));

  const screen = h('div', { class: 'screen' });

  // Start on Setup if something needed there is still empty (the team, on a
  // fresh match); otherwise on the first period.
  let current = missingRequired(config, submission).length ? 0 : Math.min(1, tabSections.length - 1);

  // ---------- header ----------
  const backBtn = h('a', {
    class: 'icon-btn', href: editing ? '#saved' : '#home',
    'aria-label': editing ? 'Back to my matches' : 'Back to home (this match stays saved)',
  }, icon('back'));
  const metaEl = h('div', { class: 'meta' });
  const pointsEl = h('span', { class: 'value num' });
  const teamEl = h('h1', { class: 'team num', tabindex: '-1' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Match periods' });
  const header = h('header', { class: 'match-head' },
    h('div', { class: 'row1' },
      backBtn, metaEl,
      h('div', { class: 'points', 'aria-live': 'polite' },
        pointsEl, h('div', { class: 'label' }, 'est. pts')),
    ),
    teamEl,
    tabs,
  );

  const panel = h('main', { class: 'content period', role: 'tabpanel', id: 'period-panel' });
  const bottombar = h('footer', { class: 'bottombar' });
  screen.append(header, panel, bottombar);

  function updateHeader() {
    const { match, team, position, alliance } = submission.summary;
    screen.dataset.alliance = alliance ?? 'none';
    teamEl.textContent = team ?? 'Which team?';
    teamEl.classList.toggle('empty', !team);
    metaEl.textContent = match || position
      ? `${matchCode(submission.summary)} · ${position ? positionLabel(position) : 'pick a position'}`
      : 'Pick the match and position';
    // When the estimate goes up, the header number jumps too.
    // (Not on first draw, when the number is still empty.)
    if (pointsEl.textContent !== '' && Number(pointsEl.textContent) < submission.estimatedPoints) {
      pointsEl.classList.remove('jump');
      void pointsEl.offsetWidth;
      pointsEl.classList.add('jump');
    }
    pointsEl.textContent = submission.estimatedPoints;
    // Tint the phone's status bar with the alliance colour.
    setThemeColor(getComputedStyle(screen).getPropertyValue('--alliance').trim());
  }

  async function save() {
    refresh(config, submission);
    if (editing) await db.putSubmission(submission);
    else await db.putDraft(submission);
  }

  function onFieldChange(section, field, value) {
    submission.values[`${section.id}.${field.id}`] = value;
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
    frame = requestAnimationFrame(() => { refresh(config, submission); updateHeader(); });
  }

  // ---------- tabs + panel ----------
  const tabButtons = tabSections.map((section, i) => {
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
    const next = (current + step + tabSections.length) % tabSections.length;
    showSection(next);
    tabButtons[next].focus();
  });

  function sectionBlock(section, isGuest) {
    const duration = section.durationSec ? h('span', { class: 'duration' }, formatDuration(section.durationSec)) : null;
    const title = isGuest
      ? h('h3', { class: 'section-title sub' }, section.title ?? section.label, duration)
      : h('h2', { class: 'section-title' }, section.title ?? section.label, duration);
    return [
      title,
      section.note ? h('p', { class: 'section-note' }, section.note) : null,
      ...section.fields.filter((f) => !f.hidden).map((field) =>
        renderField(field, submission.values[`${section.id}.${field.id}`], (v) => onFieldChange(section, field, v), config)),
    ].filter(Boolean);
  }

  function showSection(i) {
    current = i;
    const section = tabSections[i];
    tabButtons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${section.id}`);
    panel.replaceChildren(
      ...sectionBlock(section, false),
      ...guestsOf(section).flatMap((g) => sectionBlock(g, true)),
    );
    if (i === 0 && submission.summary.scout) {
      panel.append(h('p', { class: 'plain scouting-as' }, `Scouting as ${submission.summary.scout}`));
    }
    if (editing && i === tabSections.length - 1) panel.append(deleteButton());
    renderBottombar();
    window.scrollTo({ top: 0 });
  }

  function renderBottombar() {
    const last = current === tabSections.length - 1;
    const code = matchCode(submission.summary);
    const action = last
      ? h('button', { class: 'pill', type: 'button', onclick: submit }, editing ? 'Save changes' : `Save ${code}`)
      : h('button', { class: 'pill', type: 'button', onclick: () => showSection(current + 1) },
          `Next: ${tabSections[current + 1].label}`, icon('next', 20));
    bottombar.replaceChildren(savedStatus('Saved on this phone'), action);
  }

  // ---------- submit / next match ----------
  async function submit() {
    refresh(config, submission);
    const missing = missingRequired(config, submission);
    if (missing.length) {
      showMissing(missing);
      return;
    }
    submission.submittedAt ??= new Date().toISOString();
    await db.putSubmission(submission);

    if (editing) {
      location.hash = '#saved';
      return;
    }
    await db.clearDraft();
    await db.setSetting('nextCarry', nextMatchCarry(submission));
    showFinish();
  }

  function showMissing(missing) {
    const tabIndex = tabSections.indexOf(tabOf(missing[0].section));
    showSection(tabIndex);
    for (const { section, field } of missing) {
      if (tabOf(section) !== tabSections[tabIndex]) continue;
      const row = panel.querySelector(`[data-field-id="${field.id}"]`);
      if (!row) continue;
      row.classList.add('invalid');
      row.append(h('p', { class: 'error-text', role: 'alert' }, `Needed before saving: ${field.label.toLowerCase()}`));
    }
    panel.querySelector('.invalid input, .invalid button')?.focus();
  }

  // The finish: the alliance colour carries on from the header into a result
  // block (the moment the match is done), then the one-tap next match.
  function showFinish() {
    const code = matchCode(submission.summary);
    const carry = nextMatchCarry(submission);
    const nextCode = carry.match ? matchCode({ level: carry.level, match: carry.match }) : null;
    const parts = pointsBySection(config, submission.values);
    const breakdown = config.sections
      .filter((s) => s.fields.some((f) => f.points))
      .map((s) => h('div', { class: 'part' },
        h('span', { class: 'part-value num' }, parts[s.id]),
        h('span', { class: 'part-label' }, s.label)));
    tabs.hidden = true;
    screen.classList.add('finished');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    panel.replaceChildren(
      h('section', { class: 'finish' },
        h('h2', { class: 'finish-title', tabindex: '-1' }, `${code} saved`),
        h('div', { class: 'finish-total' },
          h('span', { class: 'num' }, submission.estimatedPoints), h('span', {}, 'est. pts')),
        h('div', { class: 'parts' }, breakdown),
        h('p', { class: 'finish-status' }, icon('device', 18), syncStatus(submission).text)),
      h('div', { class: 'finish-actions' },
        h('button', { class: 'pill big block', type: 'button', onclick: startNext },
          nextCode ? `Scout ${nextCode}` : 'Scout the next match', icon('next', 22)),
        h('div', { class: 'two' },
          h('a', { class: 'pill secondary block', href: `#match/${submission.id}` }, `Edit ${code}`),
          h('a', { class: 'pill secondary block', href: '#saved' }, 'My matches'))),
    );
    bottombar.replaceChildren(savedStatus('Saved on this phone'));
    panel.querySelector('h2').focus();
  }

  async function startNext() {
    await startNewMatch();
    // Same URL (#match), so re-render this screen by hand.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function deleteButton() {
    return h('div', { class: 'danger-zone' },
      h('button', { class: 'text-btn danger', type: 'button', onclick: onDelete },
        h('span', { class: 'icon-label' }, icon('trash', 20), `Delete ${matchCode(submission.summary)}`)));
  }

  async function onDelete() {
    const { team } = submission.summary;
    const ok = await confirmDialog({
      title: `Delete ${matchCode(submission.summary)}?`,
      body: `${matchCode(submission.summary)}, team ${team ?? '—'} will be removed from this phone. This can't be undone.`,
      confirmLabel: 'Delete match',
    });
    if (!ok) return;
    await db.deleteSubmission(submission.id);
    location.hash = '#saved';
  }

  updateHeader();
  showSection(current);
  return { el: screen };
}

// Creates and saves a fresh Draft, pre-filled from the last match.
// The scout's name comes from their account; the game config from their group.
export async function startNewMatch() {
  const [group, profile, configId, event, carry] = await Promise.all([
    currentGroup(), cachedProfile(), db.getSetting('configId'), db.getSetting('eventName'), db.getSetting('nextCarry'),
  ]);
  const config = await loadConfig(group?.game_config_id ?? configId);
  const scout = profile?.display_name || carry?.scout;
  const submission = newSubmission(config, { ...carry, scout, event: event ?? carry?.event });
  await db.putDraft(submission);
  return submission;
}

function formatDuration(sec) {
  return sec >= 60 ? `${sec / 60} min` : `${sec} s`;
}

function notFound() {
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#saved', 'aria-label': 'Back to my matches' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Match not found')),
    h('main', { class: 'content' },
      h('p', { class: 'plain' }, 'This match is no longer on this phone. It may have been deleted.')));
}
