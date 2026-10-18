// Home: "Now scouting". The top of the screen is the match you're on (or the
// next one) in your alliance colour, the way a music app shows what's playing.
// Below it: your matches, your Scouting group, and the event.

import { h, icon, formField, setThemeColor, confirmDialog } from '../ui.js';
import { getSetting, setSetting, listSubmissions, clearDraft } from '../db.js';
import { listConfigs } from '../config.js';
import { currentGroup } from '../account.js';
import { groupLabel, isLead } from '../group-rules.js';
import { positionLabel, needsSync } from '../submissions.js';
import { whatsNext } from '../now-scouting.js';
import { submissionRow } from './saved.js';

export async function renderHome() {
  const [eventName, submissions, group, next, configs] = await Promise.all([
    getSetting('eventName'), listSubmissions(), currentGroup(), whatsNext(), listConfigs(),
  ]);
  const game = configs.find((c) => c.id === group.game_config_id) ?? configs[0];
  const mismatch = !game.name.startsWith(group.program);
  const unsent = submissions.filter(needsSync).length;
  const lead = isLead(group);

  const el = h('div', { class: 'screen home-screen' },
    nowBlock(next),
    h('main', { class: 'content' },
      h('ul', { class: 'rows home-rows' },
        h('li', {}, h('a', { class: 'row', href: '#saved' },
          h('div', {},
            h('div', { class: 'title' }, 'My matches'),
            h('div', { class: 'sub' }, submissions.length
              ? `${submissions.length} on this phone${unsent ? ' · not sent yet' : ''}`
              : 'None yet. Matches you save show up here.')),
          h('span', { class: 'row-end' }, h('span', { class: 'num row-count' }, submissions.length), icon('next', 20)))),
        h('li', {}, h('a', { class: 'row', href: '#group' },
          h('div', {},
            h('div', { class: 'title' }, group.name),
            h('div', { class: 'sub' }, `${groupLabel(group)} · You’re a ${lead ? 'Lead' : 'Scout'} · ${game.name}`)),
          icon('next', 20))),
        h('li', {}, eventRow(eventName, lead)),
      ),
      mismatch ? h('p', { class: 'notice' },
        `Your group is ${group.program}, so ${group.program} positions and scoring arrive with the ${group.program} game after kickoff. Until then, matches use ${game.name}.`) : null,
      submissions.length ? h('section', {},
        h('h2', { class: 'section-h' }, 'Recent'),
        h('ul', { class: 'submission-list' }, submissions.slice(0, 3).map((s) => h('li', {}, submissionRow(s, submissions))))) : null,
    ),
    h('footer', { class: 'bottombar' },
      h('p', { class: 'status' }, icon('device', 18),
        h('span', {}, 'Works with no signal'))),
  );

  // The phone's status bar matches the block's colour.
  queueMicrotask(() => setThemeColor(getComputedStyle(el.querySelector('.now')).backgroundColor));
  return { el };
}

// The big block at the top.
function nowBlock(next) {
  const settings = h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings and account' }, icon('account'));
  const top = h('div', { class: 'now-top' }, h('span', { class: 'wordmark' }, 'Offline Scout'), settings);

  if (next.kind === 'draft') {
    return h('section', { class: 'now', 'data-alliance': next.alliance ?? 'none' },
      top,
      h('h1', { class: `now-hero${next.team || next.code ? ' num' : ''}`, tabindex: '-1' }, next.team ?? next.code ?? 'Unfinished match'),
      h('p', { class: 'now-sub' }, [
        next.team ? next.code : null,
        next.position && positionLabel(next.position),
        `started ${next.started}`,
        next.points ? `${next.points} est. pts so far` : null,
      ].filter(Boolean).join(' · ')),
      h('a', { class: 'pill big block now-go', href: '#match' }, next.code ? `Resume ${next.code}` : 'Resume this match', icon('next', 22)),
      discardLink());
  }
  if (next.kind === 'next') {
    return h('section', { class: 'now', 'data-alliance': next.alliance ?? 'none' },
      top,
      h('p', { class: 'now-meta num' }, next.position ? `Next · ${positionLabel(next.position)}` : 'Next'),
      h('h1', { class: 'now-hero num', tabindex: '-1' }, next.code),
      h('p', { class: 'now-sub' }, 'You’ll enter the team number on the next screen.'),
      h('a', { class: 'pill big block now-go', href: '#match' }, `Scout ${next.code}`, icon('next', 22)));
  }
  return h('section', { class: 'now', 'data-alliance': 'none' },
    top,
    h('h1', { class: 'now-hero', tabindex: '-1' }, 'First match'),
    h('a', { class: 'pill big block now-go', href: '#match' }, 'Scout a match', icon('next', 22)));
}

function discardLink() {
  const btn = h('button', { class: 'now-discard', type: 'button' }, 'Discard this match');
  btn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Discard this match?',
      body: 'Everything tapped for it is removed from this phone. Matches you already saved are not affected.',
      confirmLabel: 'Discard',
    });
    if (!ok) return;
    await clearDraft();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  return btn;
}

// The event: Leads can change it; Scouts just see it.
// (In Milestone 4 the Current event comes from FIRST's schedule instead.)
function eventRow(eventName, lead) {
  const view = h('div', { class: 'row' },
    h('div', {},
      h('div', { class: 'title' }, eventName || 'No event set'),
      h('div', { class: 'sub' }, lead ? 'Event · set by Leads' : 'Event · your Lead sets this')),
    lead ? h('button', { class: 'small-btn', type: 'button' }, eventName ? 'Change' : 'Set event') : null);
  if (!lead) return view;

  view.querySelector('button').addEventListener('click', () => {
    const f = formField('Event name', { type: 'text', autocapitalize: 'words', maxlength: 80, placeholder: 'e.g. Northern Ontario Qualifier' });
    f.input.value = eventName ?? '';
    const saveBtn = h('button', { class: 'pill', type: 'submit' }, 'Save event');
    const form = h('form', { class: 'form event-form' }, f.el, h('div', { class: 'actions' }, saveBtn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await setSetting('eventName', f.input.value.trim());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    view.replaceWith(form);
    f.input.focus();
  });
  return view;
}
