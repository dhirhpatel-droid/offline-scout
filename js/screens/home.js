// Home: "Now scouting". The top of the screen is the match you're on (or the
// next one) in your alliance colour, the way a music app shows what's playing.
// Below it: your matches, your Scouting group, and the event.

import { h, icon, setThemeColor, confirmDialog, bumper, station, lineup } from '../ui.js';
import { getSetting, listSubmissions, finishDraft } from '../db.js';
import { currentGroup, currentUser } from '../account.js';
import { groupLabel, isLead } from '../group-rules.js';
import { positionLabel, needsSync } from '../submissions.js';
import { whatsNext, sharedAlliance } from '../now-scouting.js';
import { startPlannedMatch } from './match.js';
import { currentEventData, cachedPlan } from '../events.js';
import { planSummary } from '../assignments.js';
import { forEvent, teamRows } from '../team-stats.js';
import { cachedAnnouncements, lastSeen } from '../announcements.js';
import { unread, whenLabel } from '../announcement-rules.js';
import { dataChecks, openChecks } from '../data-checks.js';
import { loadConfig } from '../config.js';
import { timeOf } from '../schedule.js';
import { sendStatus, lastResult } from '../sync.js';
import { submissionRow } from './saved.js';

export async function renderHome() {
  const [all, group, next, me, lastSyncAt, eventData] = await Promise.all([
    listSubmissions(), currentGroup(), whatsNext(), currentUser(), getSetting('lastSyncAt'), currentEventData(),
  ]);
  // My matches in this group (matches from before accounts existed count as mine).
  const submissions = all.filter((s) => (!s.scoutId || s.scoutId === me?.id) && (!s.groupId || s.groupId === group.id));

  const unsent = submissions.filter(needsSync).length;
  const lead = isLead(group);
  const plan = lead && group.currentEvent ? await cachedPlan(group.id, group.currentEvent.id) : null;
  // Teams (Lead view): how many Teams at the event have been scouted (Coverage).
  let teamsRow = null;
  let checksRow = null;
  if ((lead || group.settings?.scoutsSeeAll === true) && group.currentEvent) {
    const config = await loadConfig(group.game_config_id);
    const eventSubs = forEvent(all, { groupId: group.id, eventId: group.currentEvent.id });
    const rows = teamRows(config, eventSubs, eventData?.teams ?? []);
    // Data checks (Leads): only shown when there's something to look at.
    // Only the ones not marked "Looks right" on this phone.
    const checks = lead ? openChecks(dataChecks(config, eventSubs, eventData ?? {}, group.settings?.checkSensitivity ?? 'normal'),
      (await getSetting(`checksOk:${group.id}`)) ?? [], new Map(eventSubs.map((s) => [s.id, s]))) : [];
    // Always there for Leads (rows that come and go are hard to find).
    checksRow = lead ? h('a', { class: 'row', href: '#checks' },
      h('div', {}, h('div', { class: 'title' }, 'Data checks'),
        h('div', { class: 'sub' }, checks.length ? `First: ${checks[0].title}` : 'Nothing looks off')),
      checks.length ? h('span', { class: 'row-end' }, h('span', { class: 'num row-count', 'aria-label': `${checks.length} to look at` }, checks.length), icon('next', 20))
        : icon('next', 20)) : null;
    const done = rows.filter((r) => r.scouted).length;
    teamsRow = h('a', { class: 'row', href: '#teams' },
      h('div', {}, h('div', { class: 'title' }, 'Teams'),
        h('div', { class: 'sub' }, rows.length ? `${done} of ${rows.length} scouted · averages and notes` : 'Averages and notes, once matches come in')),
      icon('next', 20));
  }

  // Announcements: the newest unread one sits right under the cover, so it's
  // seen before scouting; otherwise a quiet row (Leads always get one, to post).
  const [news, seenAt] = await Promise.all([cachedAnnouncements(group.id), lastSeen(group.id)]);
  const newNews = unread(news, seenAt, me?.id);
  const newsBlock = newNews.length ? h('a', { class: 'announce-strip', href: '#announcements' },
    h('span', { class: 'announce-strip-head' }, icon('announce', 20),
      h('span', {}, h('span', { class: 'visually-hidden' }, 'Announcement from '),
        `${newNews[0].author_name || 'A Lead'} · ${whenLabel(newNews[0].created_at)}`,
        newNews.length > 1 ? ` · ${newNews.length - 1} more` : ''),
      icon('next', 18)),
    h('span', { class: 'announce-strip-body' }, newNews[0].body)) : null;
  const newsRow = !newNews.length && (news.length || lead) ? h('a', { class: 'row', href: '#announcements' },
    h('div', {}, h('div', { class: 'title' }, 'Announcements'),
      h('div', { class: 'sub' }, news.length ? `Latest: ${news[0].body}` : 'Post a message to everyone in your group')),
    icon('next', 20)) : null;

  const el = h('div', { class: 'screen home-screen' },
    nowBlock(next),
    newsBlock,
    h('main', { class: 'content' },
      // What's next for you comes first (your Assignments), then, for Leads,
      // the tools they use most; the group and the event come after.
      comingUp(next),
      lead ? h('ul', { class: 'rows home-rows', 'aria-label': 'Lead tools' },
        checksRow ? h('li', {}, checksRow) : null,
        teamsRow ? h('li', {}, teamsRow) : null,
        plan ? h('li', {}, h('a', { class: 'row', href: '#assign' },
          h('div', {},
            h('div', { class: 'title' }, 'Assignments'),
            h('div', { class: 'sub' }, planSummary(plan, eventData?.matches ?? []) ?? 'No one assigned yet. Plan who watches what.')),
          icon('next', 20))) : null,
        group.settings?.qrBackup ? h('li', {}, h('a', { class: 'row', href: '#scan' },
          h('div', {}, h('div', { class: 'title' }, 'Scan Scouts’ matches'),
            h('div', { class: 'sub' }, 'QR backup: copy matches from phones with no signal')),
          icon('next', 20))) : null) : null,
      h('ul', { class: 'rows home-rows' },
        h('li', {}, h('a', { class: 'row', href: '#saved' },
          h('div', {},
            h('div', { class: 'title' }, 'My matches'),
            h('div', { class: 'sub' }, submissions.length
              ? `${submissions.length} saved · ${unsent ? `${unsent} waiting to send` : lastSyncAt ? 'all sent to your group' : 'on this phone'}`
              : 'None yet. Matches you save show up here.')),
          icon('next', 20))),
        h('li', {}, h('a', { class: 'row', href: '#group' },
          h('div', {},
            h('div', { class: 'title' }, group.name),
            h('div', { class: 'sub' }, `${groupLabel(group)} · ${lead ? 'Lead' : 'Scout'}`)),
          icon('next', 20))),
        h('li', {}, eventRow(group, lead, eventData)),
        newsRow ? h('li', {}, newsRow) : null,
        // Scouts who may see everyone's data get Teams too.
        !lead && teamsRow ? h('li', {}, teamsRow) : null,
      ),

      submissions.length ? h('section', {},
        h('h2', { class: 'section-h' }, 'Recent'),
        h('ul', { class: 'submission-list' }, submissions.slice(0, 3).map((s) => h('li', {}, submissionRow(s, submissions))))) : null,
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
  const settings = h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings and account' }, icon('account'));
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
      go);
  }
  if (next.kind === 'all-done') {
    return h('section', { class: 'now', 'data-alliance': 'none' },
      top,
      h('h1', { class: 'now-hero', tabindex: '-1' }, 'All done'),
      h('p', { class: 'now-sub' }, `You’ve scouted all ${next.total} of your assignments. Extra matches still count.`),
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

// The rest of your Assignments, in match order (the next few).
function comingUp(next) {
  if (next.kind !== 'assigned' || !next.later.length) return null;
  const shown = next.later.slice(0, 5);
  return h('section', {},
    h('h2', { class: 'section-h' }, 'Coming up'),
    h('ol', { class: 'coming-up' }, shown.map((g) => h('li', {},
      h('span', { class: 'coming-when' },
        h('span', { class: 'num coming-code' }, g.code),
        h('span', { class: 'coming-time' }, g.time ?? '')),
      h('span', { class: 'coming-what' }, g.items.map((a) => h('span', { class: 'coming-item' },
        station(positionLabel(a.position), a.position.replace(/\d/, '')),
        a.team ? bumper(a.team, a.position.replace(/\d/, ''), { mine: true }) : h('span', { class: 'coming-tbd' }, 'team not out yet'))))))),
    next.later.length > shown.length ? h('p', { class: 'plain' }, `And ${next.later.length - shown.length} more after that.`) : null);
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
function eventRow(group, lead, data) {
  const ev = group.currentEvent;
  const upcoming = data?.matches.filter((m) => m.level === 'qual' && !m.played) ?? [];
  const sub = !ev ? (lead ? 'Pick your event to load its schedule' : 'Your Lead picks the event')
    : !data ? 'Schedule downloads when you have signal'
      : !data.matches.length ? `${data.teams.length} teams · schedule not out yet`
        : upcoming.length ? `${data.teams.length} teams · next match ${timeOf(upcoming[0]) ?? `Q${upcoming[0].number}`}`
          : `${data.teams.length} teams · qualifications done`;
  return h('a', { class: 'row', href: '#event' },
    h('div', {}, h('div', { class: 'title' }, ev ? ev.name : 'No event yet'), h('div', { class: 'sub' }, sub)),
    icon('next', 20));
}

// The footer says where your matches are (sending is the one thing it reports).
function footerStatus(unsent, lastSyncAt) {
  const st = sendStatus({ unsent, lastSyncAt, result: lastResult });
  return h('p', { class: `status ${st.state}` }, icon(st.state === 'sent' ? 'check' : 'device', 18),
    h('span', {}, st.text));
}
