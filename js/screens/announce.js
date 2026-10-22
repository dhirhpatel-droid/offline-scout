// Announcements (#announcements): short messages from the group's Leads, newest first.
// Everyone reads them (offline too: the phone keeps a copy). Leads write new
// ones at the top and can remove any. Opening this screen marks them read.

import { h, icon, formMessage, busy } from '../ui.js';
import { currentGroup, currentUser } from '../account.js';
import { isLead } from '../group-rules.js';
import { checkBody, unread, whenLabel, MAX_LENGTH } from '../announcement-rules.js';
import { cachedAnnouncements, lastSeen, markSeen, postAnnouncement, removeAnnouncement } from '../announcements.js';
import { friendlyError, isOnline } from '../supabase.js';
import { nowScoutingBar } from '../now-scouting.js';

// Set after a post, so the next draw can say "Posted" on the new one.
let justPosted = false;

export async function renderAnnouncements() {
  const [group, me] = await Promise.all([currentGroup(), currentUser()]);
  const lead = isLead(group);
  const online = isOnline();
  const [list, seenAt] = await Promise.all([cachedAnnouncements(group.id), lastSeen(group.id)]);
  // Which were new when the screen opened (marked, then saved as read).
  const fresh = new Set(unread(list, seenAt, me?.id).map((a) => a.id));
  if (list[0]) await markSeen(group.id, list[0].created_at);
  const message = formMessage();
  const redraw = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  // ---------- write one (Leads, with signal) ----------
  let compose = null;
  if (lead && online) {
    const id = 'announce-body';
    // The count only shows near the limit (calmer for a quick note), and a
    // screen reader hears it only when it first shows and when it goes over,
    // not on every key.
    const counter = h('p', { class: 'field-hint announce-count', id: `${id}-count` });
    const spoken = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
    const error = h('p', { class: 'error-text', id: `${id}-err`, role: 'alert', hidden: true });
    const box = h('textarea', { id, class: 'input announce-input', rows: 3, maxlength: MAX_LENGTH + 20,
      placeholder: 'e.g. Switch to Red 2 after lunch', 'aria-describedby': `${id}-hint ${id}-count ${id}-err` });
    let zone = 'fine';
    box.addEventListener('input', () => {
      const left = MAX_LENGTH - box.value.trim().length;
      counter.textContent = left > 40 ? '' : left >= 0 ? `${left} left` : `${-left} too many`;
      counter.classList.toggle('over', left < 0);
      const now = left < 0 ? 'over' : left <= 40 ? 'near' : 'fine';
      if (now !== zone && now !== 'fine') spoken.textContent = counter.textContent;
      zone = now;
      error.hidden = true;
    });
    const post = h('button', { class: 'pill block', type: 'submit' }, 'Post to everyone');
    compose = h('form', { class: 'form announce-form', novalidate: true },
      h('label', { class: 'field-label', for: id }, 'New announcement'),
      h('p', { class: 'field-hint', id: `${id}-hint` }, 'Shows on everyone’s Home screen the next time their phone has signal.'),
      box, counter, spoken, error,
      h('div', { class: 'actions' }, post));
    compose.addEventListener('submit', (e) => {
      e.preventDefault();
      const problem = checkBody(box.value);
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        box.focus();
        return;
      }
      busy(post, 'Posting…', async () => {
        try {
          await postAnnouncement(group, box.value);
          justPosted = true;
          redraw();
        } catch (err) {
          // Next to the box, where the Lead is looking; the text stays.
          error.textContent = friendlyError(err);
          error.hidden = false;
        }
      });
    });
  }

  // ---------- the list ----------
  // Remove: the item disappears with an Undo for a few seconds, and is only
  // removed for everyone when that time is up (every tap undoable).
  const UNDO_MS = 6000;
  const item = (a, i) => {
    const li = h('li', { class: 'announce-item', tabindex: '-1' });
    const remove = lead && online ? h('button', { class: 'small-btn plain-remove', type: 'button',
      'aria-label': `Remove the announcement “${a.body.slice(0, 40)}”` },
    h('span', { class: 'icon-label' }, icon('trash', 18), 'Remove')) : null;
    remove?.addEventListener('click', () => {
      const undo = h('button', { class: 'small-btn', type: 'button' }, 'Undo');
      const bar = h('li', { class: 'announce-removed', role: 'status' }, h('span', {}, 'Removed.'), undo);
      li.replaceWith(bar);
      undo.focus();
      const timer = setTimeout(async () => {
        try {
          await removeAnnouncement(group, a.id);
          if (location.hash === '#announcements') redraw();
        } catch (err) {
          bar.replaceWith(li);
          message.show(friendlyError(err), 'error');
        }
      }, UNDO_MS);
      undo.addEventListener('click', () => {
        clearTimeout(timer);
        bar.replaceWith(li);
        remove.focus();
      });
    });
    const posted = justPosted && i === 0;
    li.append(
      h('p', { class: 'announce-meta' },
        posted ? h('span', { class: 'announce-new' }, 'Posted')
          : fresh.has(a.id) ? h('span', { class: 'announce-new' }, 'New') : null,
        `${a.author_name || 'A Lead'} · ${whenLabel(a.created_at)}`),
      h('p', { class: 'announce-body' }, a.body),
      remove);
    return li;
  };

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Announcements')),
    h('main', { class: 'content' },
      message.el,
      compose,
      lead && !online ? h('p', { class: 'plain announce-offline' }, 'You can post the next time this phone has signal.') : null,
      list.length
        ? h('ul', { class: 'announce-list', 'aria-label': 'Announcements, newest first' }, list.map((a, i) => item(a, i)))
        : h('p', { class: 'plain teams-empty' }, lead
          ? 'Nothing posted yet. What you post here shows on everyone’s Home screen.'
          : 'Nothing from your Leads yet. Their announcements show here and on Home.')),
    await nowScoutingBar(),
  );
  // Just posted: focus the new one so the Lead sees (and hears) it went up.
  if (justPosted) {
    justPosted = false;
    setTimeout(() => el.querySelector('.announce-item')?.focus(), 60);
  }
  return { el };
}
