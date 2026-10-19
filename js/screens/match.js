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

import { h, icon, savedStatus, confirmDialog, setThemeColor, lineup, station } from '../ui.js';
import { renderField } from '../fields.js';
import { loadConfig } from '../config.js';
import { pointsBySection } from '../scoring.js';
import {
  newSubmission, refresh, missingRequired, nextMatchCarry, positionLabel, matchCode, syncStatus,
} from '../submissions.js';
import * as db from '../db.js';
import { currentGroup, cachedProfile, currentUser } from '../account.js';
import { syncNow } from '../sync.js';
import { listenFor } from '../ui.js';
import { isLead } from '../group-rules.js';
import { findRole } from '../config.js';
import { cachedEvent } from '../events.js';
import { findMatch, teamAt, timeOf, isAtEvent } from '../schedule.js';
import { myPlan } from '../now-scouting.js';

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

  // The Event's schedule (saved on this phone), so the team can fill itself in.
  const eventData = await cachedEvent(submission.eventId ?? (!editing ? group?.currentEvent?.id : null));
  const teamKey = findRole(config, 'teamNumber')?.key;
  const scheduled = () => findMatch(eventData?.matches, submission.summary.level, submission.summary.match);
  // The team the schedule filled in (replaced if the match or position changes).
  let autoTeam = null;
  {
    const fromSchedule = teamAt(scheduled(), submission.summary.position);
    if (fromSchedule && fromSchedule === submission.values[teamKey]) autoTeam = fromSchedule;
  }

  // Tabs: sections that aren't shown inside another one.
  const tabSections = config.sections.filter((s) => !s.showWith);
  const guestsOf = (section) => config.sections.filter((s) => s.showWith === section.id);
  const tabOf = (section) => tabSections.find((t) => t.id === (section.showWith ?? section.id));

  const screen = h('div', { class: 'screen' });

  // A Draft nobody typed anything into is thrown away when you leave.
  let touched = editing;
  let stopListening = null;
  let nextUp = null; // my remaining Assignments, worked out after saving

  // Start on Setup if something needed there is still empty (the team, on a
  // fresh match); otherwise on the first period. (Set again below when
  // switching between two Teams, to stay on the same period.)
  let current = missingRequired(config, submission).length ? 0 : Math.min(1, tabSections.length - 1);

  // ---------- header ----------
  const backBtn = h('a', {
    class: 'icon-btn', href: editing ? '#saved' : '#home',
    'aria-label': editing ? 'Back to my matches' : 'Back to home (this match stays saved)',
  }, icon('back'));
  const metaEl = h('div', { class: 'meta' });
  const pointsEl = h('span', { class: 'value num' });
  const pointsLabel = h('div', { class: 'label' }, 'est. pts');
  const teamEl = h('h1', { class: 'team num', tabindex: '-1' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Match periods' });
  // On Setup: the whole match line-up from the schedule, to check the team.
  const lineupEl = h('div', { class: 'head-lineup' });

  // Watching two Teams in this match? A switch between their two Drafts.
  const other = !editing ? await db.getDraft('second') : null;
  const sameMatch = (a, b) => a && b && a.summary?.match === b.summary?.match
    && (a.summary?.level ?? 'qual') === (b.summary?.level ?? 'qual');
  const pair = sameMatch(submission, other) ? other : null;
  // Switching Teams keeps you on the period you were watching.
  const handover = pair ? pairHandover : null;
  pairHandover = null;
  if (handover?.tab) current = Math.max(0, tabSections.findIndex((t) => t.id === handover.tab));
  // The two Teams become the big numbers (the plain team number is then only
  // for screen readers), with the position under each.
  const pill = (sub, active) => h('button', { type: 'button', ...(active ? { 'aria-current': 'true' } : {}),
    'aria-label': active ? `${sub.summary.team ?? 'This team'}, ${positionLabel(sub.summary.position)}, showing now`
      : `Switch to ${sub.summary.team ?? 'the other team'}, ${positionLabel(sub.summary.position)}` },
    h('span', { class: 'num switch-team' }, sub.summary.team ?? '?'),
    h('span', { class: 'switch-pos' }, positionLabel(sub.summary.position)));
  const thisPill = pair ? pill(submission, true) : null;
  const otherPill = pair ? pill(pair, false) : null;
  otherPill?.addEventListener('click', async () => {
    pairHandover = { tab: tabSections[current].id };
    await save();
    await db.swapDrafts();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  const teamSwitch = pair ? h('div', { class: 'team-switch', role: 'group', 'aria-label': 'Switch between your two teams in this match' },
    thisPill, otherPill) : null;
  if (pair) teamEl.classList.add('visually-hidden');
  const header = h('header', { class: 'match-head' },
    h('div', { class: 'row1' },
      backBtn, metaEl,
      h('div', { class: 'points', 'aria-live': 'polite' },
        pointsEl, pointsLabel),
    ),
    teamEl,
    teamSwitch,
    lineupEl,
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
    if (thisPill) thisPill.querySelector('.switch-team').textContent = team ?? '?';
    lineupEl.replaceChildren(lineup(scheduled(), [team, pair?.summary.team].filter(Boolean)) ?? '');
    metaEl.textContent = [
      match ? matchCode(submission.summary) : 'Q?',
      // With two Teams, each pill already says its position.
      pair ? null : position ? positionLabel(position) : 'pick a position',
      timeOf(scheduled()),
    ].filter(Boolean).join(' · ');
    // When the estimate goes up, the header number jumps too.
    // (Not on first draw, when the number is still empty.)
    if (pointsEl.textContent !== '' && Number(pointsEl.textContent) < submission.estimatedPoints) {
      pointsEl.classList.remove('jump');
      void pointsEl.offsetWidth;
      pointsEl.classList.add('jump');
    }
    pointsEl.textContent = submission.estimatedPoints;
    // Two Teams on screen: say whose estimate this is.
    if (pair) pointsLabel.textContent = `${team ?? '?'} est. pts`;
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
    if (['matchLevel', 'matchNumber', 'alliancePosition'].includes(field.role)) fillTeamFromSchedule();
    if (['teamNumber', 'matchNumber', 'matchLevel'].includes(field.role)) queueMicrotask(updateTeamNote);
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

  // Match + position known and in the schedule → the team fills itself in,
  // unless the scout typed a different team themselves.
  function fillTeamFromSchedule() {
    if (!teamKey || !eventData) return;
    refresh(config, submission);
    const team = teamAt(scheduled(), submission.summary.position);
    const current = submission.values[teamKey];
    if (team && (current == null || current === '' || current === autoTeam)) {
      submission.values[teamKey] = team;
      autoTeam = team;
      const input = panel.querySelector(`[data-field-id="${teamKey.split('.')[1]}"] input`);
      if (input) input.value = team;
    }
    queueMicrotask(updateTeamNote);
  }

  // Under the team number: where it came from, or a warning with a one-tap fix.
  function updateTeamNote() {
    const row = teamKey && panel.querySelector(`[data-field-id="${teamKey.split('.')[1]}"]`);
    if (!row) return;
    const team = Number(submission.values[teamKey]) || null;
    const { match, position } = submission.summary;
    const m = scheduled();
    const scheduledTeam = teamAt(m, position);
    const where = position ? positionLabel(position) : '';

    let note = null;
    if (team && autoTeam === team) {
      note = h('p', { class: 'team-note' }, icon('check', 16), 'From the event schedule');
    } else if (team && scheduledTeam && scheduledTeam !== team) {
      const use = h('button', { class: 'small-btn primary', type: 'button' }, `Use ${scheduledTeam}`);
      use.addEventListener('click', () => {
        submission.values[teamKey] = scheduledTeam;
        autoTeam = scheduledTeam;
        row.querySelector('input').value = scheduledTeam;
        touched = true;
        updateHeaderSoon();
        save();
        updateTeamNote();
      });
      note = warning(`The schedule has ${scheduledTeam} in ${matchCode(submission.summary)} ${where}.`, use);
    } else if (team && !isAtEvent(eventData?.teams, team)) {
      note = warning(`${team} isn’t on this event’s team list. Check the number.`);
    } else if (eventData?.matches?.length && match && !m) {
      const quals = eventData.matches.filter((x) => x.level === 'qual').map((x) => x.number);
      note = warning(`${matchCode(submission.summary)} isn’t in the schedule on this phone${
        quals.length ? ` (it has Q${Math.min(...quals)}–Q${Math.max(...quals)})` : ''}. Check the match number.`);
    }
    // Only replace the note when its text changes, so a screen reader
    // announces a warning once, not on every keystroke.
    const old = row.querySelector('.team-note');
    if (old?.textContent === note?.textContent) return;
    old?.remove();
    if (note) row.append(note);
  }

  function warning(text, action = null) {
    return h('div', { class: 'team-note warn', role: 'alert' },
      h('p', {}, h('strong', {}, 'Check this: '), text), action);
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
    }, h('span', {}, section.label),
      // The field clock's time for the period ("0:30", "2:00").
      section.durationSec ? h('span', { class: 'tab-clock num', 'aria-hidden': 'true' }, clock(section.durationSec)) : null);
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
    // On Setup the tab already says "Setup", so its heading is for screen readers only.
    const sameAsTab = !isGuest && !section.durationSec && (section.title ?? section.label) === section.label;
    const title = isGuest
      ? h('h3', { class: 'section-title sub', id: `guest-${section.id}` }, section.title ?? section.label)
      : h('h2', { class: `section-title${sameAsTab ? ' visually-hidden' : ''}` }, section.title ?? section.label);
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
      panel.prepend(h('p', { class: 'notice' }, `${submission.summary.scout ?? 'Another scout'}’s match · view only. ${
        isLead(group) ? 'Lead edits are turned off for this group.' : 'Only the scout who saved it, or a Lead, can change it.'}`));
    } else if (editing && i === tabSections.length - 1) {
      panel.append(deleteButton());
    }
    if (!editing && i === 0) panel.append(discardButton());
    screen.dataset.firstTab = String(i === 0); // points are hidden on Setup
    if (i === 0) queueMicrotask(updateTeamNote);
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
    bottombar.replaceChildren(
      readOnly ? h('p', { class: 'status' }, h('span', {}, `View only · ${submission.summary.scout ?? 'another scout'}`))
        : savedStatus(handover?.note ?? 'Saved'),
      action);
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
    const waiting = await db.finishDraft();
    if (waiting) {
      // The other Team in this match is still to finish: go straight to it.
      pairHandover = { note: `${submission.summary.team ?? 'Team'} saved. Now ${waiting.summary.team ?? 'the other team'}.` };
      syncNow();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    await db.setSetting('nextCarry', nextMatchCarry(submission));
    nextUp = await myPlan();
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
    // Leads with the reassurance ("Saved on this phone"), then changes to
    // "Sent to your group" the moment a sync gets it there, even if signal
    // only comes back while this screen is open.
    const statusEl = h('p', { class: 'finish-status', role: 'status' });
    const showStatus = async (result) => {
      const latest = await db.getSubmission(submission.id);
      if (!latest) return;
      const sent = syncStatus(latest).state === 'sent';
      const failed = !sent && result?.error && !['offline', 'signed-out'].includes(result.error);
      statusEl.classList.toggle('just-sent', sent);
      statusEl.replaceChildren(icon(sent ? 'check' : 'device', 18), h('span', {},
        sent ? 'Sent to your group'
          : failed ? 'Saved on this phone · couldn’t reach your group, will retry'
            : 'Saved on this phone · sends later'));
    };
    showStatus(null);
    syncNow().then(showStatus);
    stopListening = listenFor('scout-sync', (e) => showStatus(e.detail));
    // The next Assignment (if the Lead planned any) beats "this match + 1".
    const planned = nextUp?.todo[0] ?? null;
    const nextCode = planned ? planned.code : carry.match ? matchCode({ level: carry.level, match: carry.match }) : null;
    const nextTeam = planned ? planned.items.map((a) => a.team).filter(Boolean).join(' + ')
      : carry.match ? teamAt(findMatch(eventData?.matches, carry.level, carry.match), carry.position) : null;
    const parts = pointsBySection(config, submission.values);
    const breakdown = config.sections
      .filter((s) => s.fields.some((f) => f.points))
      .map((s) => h('div', { class: 'part' },
        h('dt', { class: 'part-label' }, s.label),
        h('dd', { class: 'part-value num' }, parts[s.id])));
    tabs.hidden = true;
    backBtn.hidden = true; // the buttons below say where to go next
    metaEl.textContent = ''; // match and position are in the result below
    screen.classList.add('finished');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    panel.replaceChildren(
      h('section', { class: 'finish' },
        h('div', { class: 'finish-head' },
          h('h2', { class: 'finish-title', tabindex: '-1' }, `${code} saved`),
          submission.summary.position ? station(positionLabel(submission.summary.position), 'on') : null),
        // Laid out like the results screen after a match: each period, then the total.
        h('dl', { class: 'parts' }, breakdown,
          h('div', { class: 'part total' },
            h('dt', { class: 'part-label' }, 'Estimated total'),
            h('dd', { class: 'part-value num' }, submission.estimatedPoints))),
        h('p', { class: 'finish-note' }, 'Estimated from your taps, not the official score.'),
        statusEl),
      h('div', { class: 'finish-actions' },
        h('button', { class: 'pill big block', type: 'button', onclick: () => (planned ? startPlannedMatch(planned.items) : startNext()) },
          nextCode ? `Scout ${nextCode}${nextTeam ? ` · ${nextTeam}` : ''}` : 'Scout the next match', icon('next', 22)),
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
      await db.finishDraft();
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
      stopListening?.();
      // Opened by mistake and left without typing anything: don't keep it.
      if (freshDraft && !touched && !submission.submittedAt && !pair) db.finishDraft();
    },
  };
}

// Creates and saves a fresh Draft, pre-filled from the last match.
// The scout's name comes from their account; the game config from their group.
// Passed from one render to the next when switching between two Teams:
// { tab } = the period to stay on, { note } = what just happened.
let pairHandover = null;

export async function startNewMatch(planned = null, slot = 'current') {
  const [group, profile, configId, event, savedCarry] = await Promise.all([
    currentGroup(), cachedProfile(), db.getSetting('configId'), db.getSetting('eventName'), db.getSetting('nextCarry'),
  ]);
  // A planned match (from an Assignment) beats the "last match + 1" guess.
  const carry = planned ? { ...savedCarry, ...planned } : savedCarry;
  const config = await loadConfig(group?.game_config_id ?? configId);
  const scout = profile?.display_name || carry?.scout;
  const submission = newSubmission(config, { ...carry, scout, event: event ?? carry?.event });
  // Whose match this is, which group and Event it's for (used when it syncs).
  submission.groupId = group?.id;
  submission.scoutId = profile?.id;
  if (group?.currentEvent) {
    submission.eventId = group.currentEvent.id;
    submission.event = group.currentEvent.name;
    // Next match carried over with a position: the schedule knows the team.
    const data = await cachedEvent(group.currentEvent.id);
    const team = teamAt(findMatch(data?.matches, submission.summary.level, submission.summary.match), submission.summary.position);
    const key = findRole(config, 'teamNumber')?.key;
    if (team && key) {
      submission.values[key] = team;
      refresh(config, submission);
    }
  }
  if (planned?.team) {
    const key = findRole(config, 'teamNumber')?.key;
    if (key) submission.values[key] = planned.team;
    refresh(config, submission);
  }
  await db.putDraft(submission, slot);
  return submission;
}

// Start an assigned match. Two Assignments in the same match (two Teams at
// once) become two Drafts, with a switch on the match screen.
export async function startPlannedMatch(items) {
  await db.clearDraft('second');
  const [first, second] = items;
  await startNewMatch({ level: first.level, match: first.number, position: first.position, team: first.team });
  if (second) {
    await startNewMatch({ level: second.level, match: second.number, position: second.position, team: second.team }, 'second');
  }
  if (location.hash === '#match') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#match';
}

// 30 → "0:30", 120 → "2:00", like the match clock on the field display.
function clock(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function notFound() {
  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#saved', 'aria-label': 'Back to my matches' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Match not found')),
    h('main', { class: 'content' },
      h('p', { class: 'plain' }, 'This match is no longer on this phone. It may have been deleted.')));
}
