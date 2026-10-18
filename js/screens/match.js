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
import { currentGroup, cachedProfile, currentUser } from '../account.js';
import { syncNow } from '../sync.js';
import { isLead } from '../group-rules.js';

export async function renderMatch({ param }) {
  const editing = Boolean(param);
  let submission = editing ? await db.getSubmission(param) : await db.getDraft();

  if (editing && !submission) return { el: notFound() };
  if (!submission) submission = await startNewMatch();

  // Remember whether this Draft is brand new (nothing typed yet), before
  // anything below updates it.
  const freshDraft = !editing && submission.createdAt === submission.updatedAt;
  const config = await loadConfig(submission.configId);
  // Fill in the scout from the account if a hidden field still needs it.
  const profile = await cachedProfile();
  if (profile?.display_name && !submission.values['pre.scout']) {
    submission.values['pre.scout'] = profile.display_name;
    refresh(config, submission);
  }

  // Someone else's match: Leads may edit it if the group allows; Scouts only view it.
  const me = await currentUser();
  const group = await currentGroup();
  const othersMatch = editing && submission.scoutId && me && submission.scoutId !== me.id;
  const readOnly = othersMatch && !(isLead(group) && (group.settings?.leadsCanEdit ?? true));

  // Tabs: sections that aren't shown inside another one.
  const tabSections = config.sections.filter((s) => !s.showWith);
  const guestsOf = (section) => config.sections.filter((s) => s.showWith === section.id);
  const tabOf = (section) => tabSections.find((t) => t.id === (section.showWith ?? section.id));

  const screen = h('div', { class: 'screen' });

  // A Draft nobody typed anything into is thrown away when you leave.
  let touched = editing;

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

  const panel = h('main', { class: `content period${readOnly ? ' read-only' : ''}`, role: 'tabpanel', id: 'period-panel', inert: readOnly });
  const bottombar = h('footer', { class: 'bottombar' });
  screen.append(header, panel, bottombar);

  function updateHeader() {
    const { match, team, position, alliance } = submission.summary;
    screen.dataset.alliance = alliance ?? 'none';
    teamEl.textContent = team ?? 'Which team?';
    teamEl.classList.toggle('empty', !team);
    metaEl.textContent = `${match ? matchCode(submission.summary) : 'Q?'} · ${position ? positionLabel(position) : 'pick a position'}`;
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
    touched = true;
    if (field.role === 'noShow') queueMicrotask(renderBottombar);
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
    // On Setup the tab already says "Setup", so its heading is for screen readers only.
    const sameAsTab = !isGuest && !section.durationSec && (section.title ?? section.label) === section.label;
    const title = isGuest
      ? h('h3', { class: 'section-title sub', id: `guest-${section.id}` }, section.title ?? section.label, duration)
      : h('h2', { class: `section-title${sameAsTab ? ' visually-hidden' : ''}` }, section.title ?? section.label, duration);
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
    const guests = guestsOf(section);
    const host = sectionBlock(section, false);
    // A pointer under the title, so nobody misses a section further down.
    if (guests.length) {
      const pointer = h('a', { class: 'guest-link', href: `#guest-${guests[0].id}`, onclick: (e) => {
        e.preventDefault();
        panel.querySelector(`#guest-${guests[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } }, `${guests.map((g) => g.label).join(', ')} is further down`, icon('next', 16));
      host.splice(section.note ? 2 : 1, 0, pointer);
    }
    panel.replaceChildren(...host, ...guests.flatMap((g) => sectionBlock(g, true)));
    if (i === 0 && submission.summary.scout) {
      panel.append(h('p', { class: 'plain scouting-as' }, `Scouting as ${submission.summary.scout}`));
    }
    if (readOnly) {
      panel.prepend(h('p', { class: 'notice' }, `View only: ${submission.summary.scout ?? 'another scout'} scouted this match.`));
    } else if (editing && i === tabSections.length - 1) {
      panel.append(deleteButton());
    }
    if (!editing && i === 0) panel.append(discardButton());
    screen.dataset.firstTab = String(i === 0); // points are hidden on Setup
    watchGuests(section);
    renderBottombar();
    window.scrollTo({ top: 0 });
  }

  // Sections shown inside this tab (Endgame inside Teleop) sit lower down.
  // "Next" scrolls to them first, so nobody skips Endgame by accident.
  const seenGuests = new Set();
  let observer;
  function watchGuests(section) {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !seenGuests.has(e.target.id)) {
          seenGuests.add(e.target.id);
          renderBottombar();
        }
      }
    }, {
      // Only counts as seen once it's above the bottom bar (not hidden behind it)
      // and the first fields under the heading are visible too.
      rootMargin: `0px 0px -${bottombar.offsetHeight + 120}px 0px`,
    });
    for (const g of guestsOf(section)) {
      const el = panel.querySelector(`#guest-${g.id}`);
      if (el) observer.observe(el);
    }
  }
  const unseenGuest = () => guestsOf(tabSections[current]).find((g) => !seenGuests.has(`guest-${g.id}`));

  function renderBottombar() {
    const last = current === tabSections.length - 1;
    const code = matchCode(submission.summary);
    const noShow = config.sections.some((sec) => sec.fields.some((f) => f.role === 'noShow'
      && submission.values[`${sec.id}.${f.id}`] === true));
    const guest = unseenGuest();
    let action;
    if (readOnly) {
      action = last
        ? h('a', { class: 'pill', href: '#saved' }, 'Back to matches')
        : h('button', { class: 'pill', type: 'button', onclick: () => showSection(current + 1) },
            `Next: ${tabSections[current + 1].label}`, icon('next', 20));
    } else if (last || (noShow && !editing)) {
      // A robot that didn't show up has nothing more to record: save straight away.
      action = h('button', { class: 'pill', type: 'button', onclick: submit },
        editing ? 'Save changes' : noShow && !last ? `Save ${code} (no-show)` : `Save ${code}`);
    } else if (guest) {
      action = h('button', { class: 'pill', type: 'button', onclick: () => {
        seenGuests.add(`guest-${guest.id}`);
        panel.querySelector(`#guest-${guest.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        renderBottombar();
      } }, `Next: ${guest.label}`, icon('next', 20));
    } else {
      action = h('button', { class: 'pill', type: 'button', onclick: () => showSection(current + 1) },
        `Next: ${tabSections[current + 1].label}`, icon('next', 20));
    }
    bottombar.replaceChildren(savedStatus('Saved'), action);
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
      syncNow();
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
    // Starts as "On this phone"; becomes "Sent to your group" once the server has it.
    const statusEl = h('p', { class: 'finish-status', role: 'status' }, icon('device', 18), h('span', {}, syncStatus(submission).text));
    syncNow().then(async () => {
      const latest = await db.getSubmission(submission.id);
      if (!latest) return;
      const st = syncStatus(latest);
      statusEl.replaceChildren(icon(st.state === 'sent' ? 'check' : 'device', 18),
        h('span', {}, st.state === 'sent' ? 'Sent to your group' : `${st.text} · sends when you have signal`));
    });
    const nextCode = carry.match ? matchCode({ level: carry.level, match: carry.match }) : null;
    const parts = pointsBySection(config, submission.values);
    const breakdown = config.sections
      .filter((s) => s.fields.some((f) => f.points))
      .map((s) => h('div', { class: 'part' },
        h('span', { class: 'part-value num' }, parts[s.id]),
        h('span', { class: 'part-label' }, s.label)));
    tabs.hidden = true;
    backBtn.hidden = true; // the buttons below say where to go next
    metaEl.textContent = positionLabel(submission.summary.position ?? ''); // "Q18" is in the result below
    screen.classList.add('finished');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    panel.replaceChildren(
      h('section', { class: 'finish' },
        h('h2', { class: 'finish-title', tabindex: '-1' }, `${code} saved`),
        h('div', { class: 'finish-total' },
          h('span', { class: 'num' }, submission.estimatedPoints), h('span', {}, 'est. pts')),
        h('div', { class: 'parts' }, breakdown),
        h('p', { class: 'finish-note' }, 'Estimated from your taps, not the official score.'),
        statusEl),
      h('div', { class: 'finish-actions' },
        h('button', { class: 'pill big block', type: 'button', onclick: startNext },
          nextCode ? `Scout ${nextCode}` : 'Scout the next match', icon('next', 22)),
        h('div', { class: 'two' },
          h('a', { class: 'pill secondary block', href: `#match/${submission.id}` }, `Edit ${code}`),
          h('a', { class: 'pill secondary block', href: '#saved' }, 'My matches'))),
    );
    bottombar.remove(); // the status is in the result above
    panel.querySelector('h2').focus();
  }

  async function startNext() {
    await startNewMatch();
    // Same URL (#match), so re-render this screen by hand.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function discardButton() {
    const btn = h('button', { class: 'text-btn danger', type: 'button' },
      h('span', { class: 'icon-label' }, icon('trash', 20), 'Discard this match'));
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Discard this match?',
        body: 'Everything tapped for it is removed from this phone. Matches you already saved are not affected.',
        confirmLabel: 'Discard',
      });
      if (!ok) return;
      await db.clearDraft();
      location.hash = '#home';
    });
    return h('div', { class: 'danger-zone' }, btn);
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
  return {
    el: screen,
    cleanup: () => {
      observer?.disconnect();
      // Opened by mistake and left without typing anything: don't keep it.
      if (freshDraft && !touched && !submission.submittedAt) db.clearDraft();
    },
  };
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
  // Whose match this is and which group it's for (used when it syncs).
  submission.groupId = group?.id;
  submission.scoutId = profile?.id;
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
