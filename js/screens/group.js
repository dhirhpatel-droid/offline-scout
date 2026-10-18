// The current Scouting group: its members and Invites.
// Everyone sees the members. Leads can invite people, make someone a Lead or
// a Scout, remove members and cancel Invites. Anyone can leave.
// Needs signal for changes; without it, the last saved copy is shown.

import { h, icon, formField, formMessage, busy, confirmDialog } from '../ui.js';
import {
  currentGroup, currentUser, listMembers, setRole, removeMember, listGroupInvites, cancelInvite, sendInvite,
} from '../account.js';
import { groupLabel, isLead, isLastLead, sortMembers, isEmail } from '../group-rules.js';
import { friendlyError, isOnline } from '../supabase.js';

export async function renderGroup() {
  const group = await currentGroup();
  if (!group) {
    location.hash = '#groups';
    return { el: h('div') };
  }
  const me = await currentUser();
  const lead = isLead(group);
  const message = formMessage();
  const membersList = h('ul', { class: 'rows', 'aria-label': 'Members' });
  const invitesList = h('ul', { class: 'rows', 'aria-label': 'Open invites' });
  const invitesSection = h('section', { hidden: true }, h('h2', { class: 'section-h' }, 'Waiting to join'), invitesList);

  async function load() {
    if (!isOnline()) {
      message.show('No connection: members and invites show once you have signal.', 'info');
      return;
    }
    try {
      const members = sortMembers(await listMembers(group.id));
      membersList.replaceChildren(...members.map((m) => memberRow(m, members)));
      if (lead) {
        const invites = await listGroupInvites(group.id);
        invitesSection.hidden = !invites.length;
        invitesList.replaceChildren(...invites.map(inviteRow));
      }
    } catch (err) {
      message.show(friendlyError(err), 'error');
    }
  }

  function memberRow(m, members) {
    const isMe = m.user_id === me?.id;
    const actions = h('div', { class: 'row-actions' });
    if (lead && !isMe) {
      const roleBtn = h('button', { class: 'small-btn', type: 'button' }, m.role === 'lead' ? 'Make Scout' : 'Make Lead');
      roleBtn.addEventListener('click', () => busy(roleBtn, '…', async () => {
        try {
          await setRole(group.id, m.user_id, m.role === 'lead' ? 'scout' : 'lead');
          await load();
        } catch (err) { message.show(friendlyError(err), 'error'); }
      }));
      const removeBtn = h('button', { class: 'small-btn danger', type: 'button', 'aria-label': `Remove ${m.display_name}` }, 'Remove');
      removeBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: `Remove ${m.display_name}?`,
          body: 'They’ll lose access to this group. Matches they scouted stay with the group.',
          confirmLabel: 'Remove',
        });
        if (!ok) return;
        try {
          await removeMember(group.id, m.user_id);
          await load();
        } catch (err) { message.show(friendlyError(err), 'error'); }
      });
      actions.append(roleBtn, removeBtn);
    }
    const lastLead = isLastLead(members, m.user_id);
    return h('li', { class: 'row' },
      h('div', {},
        h('div', { class: 'title' }, m.display_name, isMe ? ' (you)' : '',
          h('span', { class: 'role-tag' }, m.role === 'lead' ? 'Lead' : 'Scout')),
        lastLead && isMe ? h('div', { class: 'sub' }, 'You’re the only Lead') : null),
      actions);
  }

  function inviteRow(inv) {
    const cancel = h('button', { class: 'small-btn danger', type: 'button', 'aria-label': `Cancel invite for ${inv.email}` }, 'Cancel');
    cancel.addEventListener('click', () => busy(cancel, '…', async () => {
      try {
        await cancelInvite(inv.id);
        await load();
      } catch (err) { message.show(friendlyError(err), 'error'); }
    }));
    const days = Math.max(0, Math.ceil((new Date(inv.expires_at) - Date.now()) / 86400000));
    return h('li', { class: 'row' },
      h('div', {}, h('div', { class: 'title' }, inv.email), h('div', { class: 'sub' }, `Invite expires in ${days} ${days === 1 ? 'day' : 'days'}`)),
      cancel);
  }

  // Invite form (Leads only)
  let inviteForm = null;
  if (lead) {
    const email = formField('Invite by email', { type: 'email', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off' },
      'They’ll join as a Scout. You can make them a Lead after.');
    const send = h('button', { class: 'pill block', type: 'submit' }, 'Send invite');
    inviteForm = h('form', { class: 'form', novalidate: true }, email.el, h('div', { class: 'actions' }, send));
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isEmail(email.input.value)) return email.setError('Enter a valid email address.');
      if (!isOnline()) return message.show('No connection right now. Sending an invite needs signal.', 'error');
      await busy(send, 'Sending…', async () => {
        try {
          const address = email.input.value.trim().toLowerCase();
          const result = await sendInvite(group.id, address);
          email.input.value = '';
          message.show(
            result.emailed ? `Invite sent to ${address}. They’ll get an email with a link to join.`
              : result.hasAccount ? `${address} already has an account. They’ll see your invite next time they open Offline Scout.`
                : `Invite saved, but the email didn’t send (${result.emailError}). Ask them to create an account with ${address}; the invite will be waiting.`,
            'info');
          await load();
        } catch (err) {
          message.show(friendlyError(err), 'error');
        }
      });
    });
  }

  const leave = h('button', { class: 'text-btn danger', type: 'button' }, 'Leave this group');
  leave.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Leave ${groupLabel(group)}?`,
      body: 'You’ll need a new invite to come back. Matches you scouted stay with the group.',
      confirmLabel: 'Leave group',
    });
    if (!ok) return;
    try {
      await removeMember(group.id, me.id);
      location.hash = '#groups';
    } catch (err) { message.show(friendlyError(err), 'error'); }
  });

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
      h('h1', { tabindex: '-1' }, h('span', { class: 'num' }, groupLabel(group)), ` · ${group.name}`)),
    h('main', { class: 'content' },
      h('p', { class: 'plain' }, `You’re a ${lead ? 'Lead' : 'Scout'} in this group.`),
      message.el,
      inviteForm,
      invitesSection,
      h('h2', { class: 'section-h' }, 'Members'),
      membersList,
      h('div', { class: 'group-footer' },
        h('a', { class: 'link-btn', href: '#groups' }, 'Switch or create groups'),
        leave)),
  );
  load();
  return { el };
}
