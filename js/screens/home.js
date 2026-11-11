// Home: "Now scouting". The top of the screen is the match you're on (or the
// next one) in your alliance colour, the way a music app shows what's playing.
// Below it: your matches, your Scouting group, and the event.

import { h, icon, setThemeColor, confirmDialog, bumper, station, lineup } from '../ui.js';
import { getSetting, listSubmissions, finishDraft } from '../db.js';
import { currentGroup, currentUser } from '../account.js';
import { isLead } from '../group-rules.js';
import { positionLabel, needsSync } from '../submissions.js';
import { whatsNext, myPlan } from '../now-scouting.js';
import { startPlannedMatch } from './match.js';
import { cachedAnnouncements, lastSeen } from '../announcements.js';
import { unread, whenLabel } from '../announcement-rules.js';
import { sendStatus, lastResult } from '../sync.js';
import { installTip } from '../install.js';

export async function renderHome() {
  const [all, group, next, me, lastSyncAt] = await Promise.all([
    listSubmissions(), currentGroup(), whatsNext(), currentUser(), getSetting('lastSyncAt'),
  ]);
  // My matches in this group (matches from before accounts existed count as mine).
  const submissions = all.filter((s) => (!s.scoutId || s.scoutId === me?.id) && (!s.groupId || s.groupId === group.id));

  const unsent = submissions.filter(needsSync).length;
  const lead = isLead(group);
  // Announcements: the newest unread one sits right under the cover, so it's
  // seen before scouting. (All of them are on the Group tab.)
  const [news, seenAt] = await Promise.all([cachedAnnouncements(group.id), lastSeen(group.id)]);
  const newNews = unread(news, seenAt, me?.id);
  const newsBlock = newNews.length ? h('a', { class: 'announce-strip', href: '#announcements' },
    h('span', { class: 'announce-strip-head' }, icon('announce', 20),
      h('span', {}, h('span', { class: 'visually-hidden' }, 'Announcement from '),
        `${newNews[0].author_name || 'A Lead'} · ${whenLabel(newNews[0].created_at)}`,
        newNews.length > 1 ? ` · ${newNews.length - 1} more` : ''),
      icon('next', 18)),
    h('span', { class: 'announce-strip-body' }, newNews[0].body)) : null;
  const el = h('div', { class: 'screen home-screen' },
    nowBlock(next),
    newsBlock,
    h('main', { class: 'content' },
      // Still in a browser tab? How to install it (until they say Not now).
      await installTip({ dismissible: true }),
      // What's next for you: your Assignments.
      myAssignments(await myPlan(), next),
      // Everything else is one tap away in the tab bar. Home only adds what
      // needs doing: a Lead with no event yet, or matches waiting for QR.
      !group.currentEvent && lead ? h('ul', { class: 'rows home-rows' }, h('li', {}, h('a', { class: 'row', href: '#event' },
        h('div', {}, h('div', { class: 'title' }, 'Pick your event'),
          h('div', { class: 'sub' }, 'Its teams and schedule load, and you can plan Assignments')),
        icon('next', 20)))) : null,
      group.settings?.qrBackup && unsent ? h('ul', { class: 'rows home-rows' }, h('li', {}, h('a', { class: 'row', href: '#qr' },
        h('div', {}, h('div', { class: 'title' }, 'Show my matches as QR'),
          h('div', { class: 'sub' }, `${unsent} waiting · for your Lead to scan`)),
        icon('next', 20)))) : null,
    ),
    h('footer', { class: 'bottombar' },
      footerStatus(unsent, lastSyncAt)),
  );

  // The phone's status bar matches the block's colour.
  queueMicrotask(() => setThemeColor(getComputedStyle(el.querySelector('.now')).backgroundColor));
  return { el };
}

// The big block at the top.
function nowBlock(next) {
  const settings = h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings, help and account' }, icon('account'));
  const top = h('div', { class: 'now-top' }, h('span', { class: 'wordmark' }, 'Offline Scout'), settings);

  if (next.kind === 'draft') {
    return h('section', { class: 'now', 'data-alliance': next.alliance ?? 'none' },
      top,
      h('h1', { class: `now-hero${next.team || next.code ? ' num' : ''}`, tabindex: '-1' }, next.team ?? next.code ?? 'Unfinished match'),
      h('p', { class: 'now-sub' }, [
        next.team ? next.code : null,
        next.position && positionLabel(next.position),
        `Started ${next.started}`,
        next.points ? `${next.points} est. pts so far` : null,
      ].filter(Boolean).join(' · ')),
      h('a', { class: 'pill big block now-go', href: '#match' }, next.code ? `Resume ${next.code}` : 'Resume this match', icon('next', 22)),
      discardLink());
  }
  if (next.kind === 'assigned') {
    const two = next.items.length > 1;
    const go = h('button', { class: 'pill big block now-go', type: 'button' },
      `Scout ${next.code}${two ? ' · both teams' : ''}`, icon('next', 22));
    go.addEventListener('click', () => startPlannedMatch(next.items));
    return h('section', { class: 'now', 'data-alliance': next.alliance ?? 'none' },
      top,
      h('h1', { class: `now-hero num${two ? ' two' : ''}`, tabindex: '-1' }, next.team ?? next.code),
      h('p', { class: 'now-sub' }, [
        next.team ? next.code : null,
        next.items.map((a) => positionLabel(a.position)).join(' and '),
        next.time,
        two ? null : 'your next assignment',
      ].filter(Boolean).join(' · ')),
      lineup(next.match, next.items.map((a) => a.team)),
      go,
      // The plan is a plan: any other match can still be scouted.
      h('a', { class: 'link-btn on-alliance now-other', href: '#match' }, 'Scout a different match'));
  }
  if (next.kind === 'all-done') {
    return h('section', { class: 'now', 'data-alliance': 'none' },
      top,
      h('h1', { class: 'now-hero', tabindex: '-1' }, 'All done'),
      h('p', { class: 'now-sub' }, `You’ve saved a match for all ${next.total} of your assignments. Extra matches still count.`),
      h('a', { class: 'pill big block now-go', href: '#match' }, 'Scout another match', icon('next', 22)));
  }
  if (next.kind === 'next') {
    return h('section', { class: 'now', 'data-alliance': next.alliance ?? 'none' },
      top,
      h('h1', { class: 'now-hero num', tabindex: '-1' }, next.team ?? next.code),
      h('p', { class: 'now-sub' }, next.team
        ? [next.code, next.position && `${positionLabel(next.position)}, same as last match`, next.time].filter(Boolean).join(' · ')
        : [next.position && positionLabel(next.position), 'you’ll enter the team on the next screen']
          .filter(Boolean).join(' · ').replace(/^y/, 'Y')),
      lineup(next.match, [next.team]),
      h('a', { class: 'pill big block now-go', href: '#match' }, `Scout ${next.code}`, icon('next', 22)));
  }
  return h('section', { class: 'now', 'data-alliance': 'none' },
    top,
    h('h1', { class: 'now-hero', tabindex: '-1' }, 'First match'),
    h('a', { class: 'pill big block now-go', href: '#match' }, 'Scout a match', icon('next', 22)));
}

// Every one of your Assignments, in match order: To do or Saved. Tap one to
// scout it (Saved ones too, to scout it again). Nothing is assumed: it says
// Saved only when this phone has your saved match for it at this event.
function myAssignments(plan, next) {
  if (!plan.assigned) return null;
  const todo = plan.groups.filter((g) => !g.saved);
  const saved = plan.groups.filter((g) => g.saved);
  const row = (g) => {
    const go = h('button', { class: 'coming-row', type: 'button',
      'aria-label': `${g.saved ? 'Saved' : 'To do'}: ${g.code}, ${g.items.map((a) => `${positionLabel(a.position)}${a.team ? ` team ${a.team}` : ''}`).join(' and ')}. Scout it.` },
      h('span', { class: 'coming-when' },
        h('span', { class: 'num coming-code' }, g.code),
        h('span', { class: 'coming-time' }, next.kind === 'assigned' && g.code === next.code ? 'Next' : g.played && !g.saved ? 'Played' : g.time ?? '')),
      h('span', { class: 'coming-what' }, g.items.map((a) => h('span', { class: 'coming-item' },
        station(positionLabel(a.position), a.position.replace(/\d/, '')),
        a.team ? bumper(a.team, a.position.replace(/\d/, ''), { mine: true }) : h('span', { class: 'coming-tbd' }, 'team not out yet')))),
      h('span', { class: `coming-state${g.saved ? ' saved' : ''}` }, g.saved ? [icon('check', 18), 'Saved'] : 'To do', icon('next', 18)));
    go.addEventListener('click', async () => {
      // An unfinished match would be replaced: ask first.
      if (next.kind === 'draft') {
        const ok = await confirmDialog({
          title: `Start ${g.code} instead?`,
          body: `Your unfinished match ${next.code ?? ''} is discarded. Matches you already saved are not affected.`,
          confirmLabel: `Start ${g.code}`,
        });
        if (!ok) return;
      }
      await startPlannedMatch(g.items);
    });
    return h('li', {}, go);
  };
  return h('section', {},
    h('h2', { class: 'section-h' }, `Your assignments (${todo.length} to do)`),
    todo.length ? h('ol', { class: 'coming-up' }, todo.map(row)) : null,
    saved.length ? h('details', { class: 'team-list' },
      h('summary', {}, `Saved (${saved.length})`, icon('next', 18)),
      h('ol', { class: 'coming-up' }, saved.map(row))) : null);
}

function discardLink() {
  const btn = h('button', { class: 'now-discard', type: 'button' }, h('span', { class: 'icon-label' }, icon('trash', 20), 'Discard this match'));
  btn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Discard this match?',
      body: 'Everything tapped for it is removed from this phone. Matches you already saved are not affected.',
      confirmLabel: 'Discard',
    });
    if (!ok) return;
    await finishDraft();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  return btn;
}

// The group's Current event; tapping it opens the Event screen.
// The footer says where your matches are (sending is the one thing it reports).
function footerStatus(unsent, lastSyncAt) {
  const st = sendStatus({ unsent, lastSyncAt, result: lastResult });
  return h('p', { class: `status ${st.state}`, role: 'status' }, icon(st.state === 'sent' ? 'check' : 'device', 18),
    h('span', {}, st.text));
}
