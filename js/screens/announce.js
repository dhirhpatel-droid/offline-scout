// Announcements (#news): short messages from the group's Leads, newest first.
// Everyone reads them (offline too: the phone keeps a copy). Leads write new
// ones at the top and can remove any. Opening this screen marks them read.

import { h, icon, formMessage, busy } from '../ui.js';
import { currentGroup, currentUser } from '../account.js';
import { isLead } from '../group-rules.js';
import { checkBody, unread, whenLabel, MAX_LENGTH } from '../announcement-rules.js';
import { cachedAnnouncements, lastSeen, markSeen, postAnnouncement, removeAnnouncement } from '../announcements.js';
import { friendlyError, isOnline } from '../supabase.js';
import { nowScoutingBar } from '../now-scouting.js';

export async function renderNews() {
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
    const id = 'news-body';
    const counter = h('p', { class: 'field-hint news-count', id: `${id}-count`, 'aria-live': 'polite' }, `${MAX_LENGTH} left`);
    const error = h('p', { class: 'error-text', id: `${id}-err`, hidden: true });
    const box = h('textarea', { id, class: 'input news-input', rows: 3, maxlength: MAX_LENGTH + 20,
      placeholder: 'e.g. Switch to Red 2 after lunch', 'aria-describedby': `${id}-count ${id}-err` });
    box.addEventListener('input', () => {
      const left = MAX_LENGTH - box.value.trim().length;
      counter.textContent = left >= 0 ? `${left} left` : `${-left} too many`;
      counter.classList.toggle('over', left < 0);
      error.hidden = true;
    });
    const post = h('button', { class: 'pill block', type: 'submit' }, 'Post to everyone');
    compose = h('form', { class: 'form news-form', novalidate: true },
      h('label', { class: 'field-label', for: id }, 'New announcement'),
      box, counter, error,
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
          redraw();
        } catch (err) { message.show(friendlyError(err), 'error'); }
      });
    });
  }

  // ---------- the list ----------
  const item = (a) => {
    const remove = lead && online ? h('button', { class: 'small-btn plain-remove', type: 'button',
      'aria-label': `Remove the announcement “${a.body.slice(0, 40)}”` },
    h('span', { class: 'icon-label' }, icon('trash', 18), 'Remove')) : null;
    remove?.addEventListener('click', () => busy(remove, '…', async () => {
      try {
        await removeAnnouncement(group, a.id);
        redraw();
      } catch (err) { message.show(friendlyError(err), 'error'); }
    }));
    return h('li', { class: 'news-item' },
      h('p', { class: 'news-meta' },
        fresh.has(a.id) ? h('span', { class: 'news-new' }, 'New') : null,
        `${a.author_name || 'A Lead'} · ${whenLabel(a.created_at)}`),
      h('p', { class: 'news-body' }, a.body),
      remove);
  };

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'Announcements')),
    h('main', { class: 'content' },
      message.el,
      compose,
      lead && !online ? h('p', { class: 'plain news-offline' }, 'You can post the next time this phone has signal.') : null,
      list.length
        ? h('ul', { class: 'news-list', 'aria-label': 'Announcements, newest first' }, list.map(item))
        : h('p', { class: 'plain teams-empty' }, lead
          ? 'Nothing posted yet. What you post here shows on everyone’s Home screen.'
          : 'Nothing from your Leads yet. Their announcements show here and on Home.')),
    await nowScoutingBar(),
  );
  return { el };
}
