// The current Scouting group: its members and Invites.
// Everyone sees the members. Leads can invite people, make someone a Lead or
// a Scout, remove members and cancel Invites. Anyone can leave.
// Needs signal: members and settings changes only load or save with it.

import { h, icon, formField, formMessage, busy, confirmDialog } from '../ui.js';
import {
  currentGroup, currentUser, listMembers, cachedMembers, setRole, removeMember, listGroupInvites, cancelInvite, sendInvite,
  setGroupSetting,
} from '../account.js';
import { groupLabel, isLead, isLastLead, sortMembers, isEmail } from '../group-rules.js';
import { friendlyError, isOnline } from '../supabase.js';
import { nowScoutingBar } from '../now-scouting.js';
import { cachedQuestions } from '../custom.js';

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

  const membersNote = h('p', { class: 'plain', hidden: true });
  // The member list this phone saw last shows straight away (offline too).
  const saved = sortMembers(await cachedMembers(group.id));
  if (saved.length) membersList.replaceChildren(...saved.map((m) => memberRow(m, saved)));
  async function load() {
    if (!isOnline()) {
      if (!saved.length) {
        membersNote.textContent = 'The member list downloads the next time this phone has signal.';
        membersNote.hidden = false;
      }
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
    if (lead && !isMe && isOnline()) {
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
  if (lead && isOnline()) {
    const email = formField('Invite a scout', { type: 'email', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off', placeholder: 'name@school.org' },
      'They get an email with a link. They join as a Scout; you can make them a Lead after.');
    const send = h('button', { class: 'pill block', type: 'submit' }, 'Send invite');
    inviteForm = h('form', { class: 'form', novalidate: true }, email.el, h('div', { class: 'actions' }, send));
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isEmail(email.input.value)) return email.setError('Enter a valid email address.');
      if (!isOnline()) return message.show('This phone has no signal right now. Sending an invite needs signal.', 'error');
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

  // Group settings (Leads only): how this group scouts.
  const SETTINGS = [
    ['scoutsSeeAll', false, 'Scouts see everyone’s matches', 'When off, Scouts see only their own matches.'],
    ['leadsCanEdit', true, 'Leads can edit scouts’ matches', 'Every change is kept, so nothing is lost.'],
    ['twoTeams', true, 'Scouts can watch two teams at once', 'Lets a Lead assign one Scout two teams in the same match.'],
  ];
  const settingsSection = lead ? h('section', {},
    h('h2', { class: 'section-title sub' }, 'Group settings'),
    ...SETTINGS.map(([key, fallback, label, hint]) => {
      let on = group.settings?.[key] ?? fallback;
      // Offline: show each setting as it is, with nothing to tap.
      if (!isOnline()) {
        return h('div', { class: 'setting-row' },
          h('span', { class: 'tile-text' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-hint' }, hint)),
          h('span', { class: 'setting-state' }, on ? 'On' : 'Off'));
      }
      const tile = h('button', { class: 'field tile', type: 'button', 'aria-pressed': String(on) },
        h('span', { class: 'tile-text' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-hint' }, hint)),
        h('span', { class: 'tile-check', 'aria-hidden': 'true' }, icon('check', 26)));
      tile.addEventListener('click', async () => {
        on = !on;
        tile.setAttribute('aria-pressed', String(on));
        try { await setGroupSetting(group.id, key, on); } catch (err) {
          on = !on;
          tile.setAttribute('aria-pressed', String(on));
          message.show(friendlyError(err), 'error');
        }
      });
      return tile;
    })) : null;

  // The Teams table's starting sort (each phone can still re-sort).
  const SORTS = [['avg', 'Average points'], ['team', 'Team number'], ['scouted', 'Matches scouted']];
  let sortKey = group.settings?.teamsSort ?? 'avg';
  const sortSetting = lead ? h('div', { class: 'field' },
    h('span', { class: 'field-label', id: 'sort-label' }, 'Teams table starts sorted by'),
    isOnline()
      ? h('div', { class: 'segmented wide', role: 'group', 'aria-labelledby': 'sort-label' }, SORTS.map(([key, label]) => {
        const b = h('button', { type: 'button', 'aria-pressed': String(key === sortKey) }, label);
        b.addEventListener('click', async () => {
          const before = sortKey;
          sortKey = key;
          b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          try { await setGroupSetting(group.id, 'teamsSort', key); } catch (err) {
            sortKey = before;
            b.parentElement.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(SORTS[i][0] === before)));
            message.show(friendlyError(err), 'error');
          }
        });
        return b;
      }))
      : h('p', { class: 'setting-value' }, SORTS.find(([k]) => k === sortKey)?.[1])) : null;

  // How sensitive Data checks are (Leads).
  const LEVELS = [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['strict', 'Strict']];
  let level = group.settings?.checkSensitivity ?? 'normal';
  const sensitivitySetting = lead ? h('div', { class: 'field' },
    h('span', { class: 'field-label', id: 'sens-label' }, 'Data checks'),
    h('p', { class: 'field-hint' }, 'Strict flags smaller differences between scouts and the official score.'),
    isOnline()
      ? h('div', { class: 'segmented wide', role: 'group', 'aria-labelledby': 'sens-label' }, LEVELS.map(([key, label]) => {
        const b = h('button', { type: 'button', 'aria-pressed': String(key === level) }, label);
        b.addEventListener('click', async () => {
          const before = level;
          level = key;
          b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          try { await setGroupSetting(group.id, 'checkSensitivity', key); } catch (err) {
            level = before;
            b.parentElement.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String(LEVELS[i][0] === before)));
            message.show(friendlyError(err), 'error');
          }
        });
        return b;
      }))
      : h('p', { class: 'setting-value' }, LEVELS.find(([k]) => k === level)?.[1])) : null;

  // Custom questions live on their own screen (Leads).
  const questions = lead ? await cachedQuestions(group.id) : [];
  const shown = questions.filter((q) => !q.hidden_at).length;
  const questionsLink = lead ? h('ul', { class: 'rows' }, h('li', {}, h('a', { class: 'row', href: '#questions' },
    h('div', {}, h('div', { class: 'title' }, 'Custom questions'),
      h('div', { class: 'sub' }, shown ? `${shown} extra ${shown === 1 ? 'question' : 'questions'} in the match` : 'Add your own questions to the match')),
    icon('next', 20)))) : null;

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
    // The cover: the team number, big, like the number on its robot.
    h('section', { class: 'now group-cover', 'data-alliance': 'none' },
      h('div', { class: 'now-top' },
        h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')), null),
      h('p', { class: 'now-hero num', 'aria-hidden': 'true' }, group.team_number),
      h('h1', { class: 'group-name', tabindex: '-1' }, group.name),
      h('p', { class: 'now-sub' }, `${group.program} team ${group.team_number} · You’re a ${lead ? 'Lead' : 'Scout'}`)),
    h('main', { class: 'content' },
      lead && !isOnline() ? h('p', { class: 'plain group-offline' }, 'Inviting, roles and settings can be changed the next time this phone has signal. Everything here is the copy saved on it.') : null,
      message.el,
      inviteForm,
      invitesSection,
      h('h2', { class: 'section-title sub' }, 'Members'),
      membersNote,
      membersList,
      settingsSection,
      sortSetting,
      sensitivitySetting,
      questionsLink,
      h('div', { class: 'danger-zone group-footer' },
        h('a', { class: 'pill secondary block', href: '#groups' }, 'Switch group'),
        leave)),
    await nowScoutingBar(),
  );
  load();
  return { el };
}
