// Your Scouting groups: switch between them, accept Invites, create a new one.
//   #groups      – the list
//   #groups/new  – create a group

import { h, icon, formField, formMessage, busy } from '../ui.js';
import {
  cachedGroups, currentGroup, setCurrentGroup, myPendingInvites, acceptInvite, createGroup, cachedProfile,
  refreshAccount, signOut,
} from '../account.js';
import { checkNewGroup, groupLabel, PROGRAMS } from '../group-rules.js';
import { friendlyError, isOnline } from '../supabase.js';

export async function renderGroups({ param }) {
  if (param === 'new') return renderNewGroup();

  // Show the saved copy straight away; the network part fills in after.
  const [groups, current, profile] = await Promise.all([cachedGroups(), currentGroup(), cachedProfile()]);
  const message = formMessage();
  const invitesSection = h('section', { hidden: true });

  const inviteRow = (inv) => {
    const join = h('button', { class: 'small-btn primary', type: 'button' }, 'Join');
    join.addEventListener('click', () => busy(join, 'Joining…', async () => {
      try {
        await acceptInvite(inv.id);
        location.hash = '#home';
      } catch (err) {
        message.show(friendlyError(err), 'error');
      }
    }));
    return h('li', { class: 'row' },
      h('div', {},
        h('div', { class: 'title' }, inv.group_label ?? 'A Scouting group'),
        h('div', { class: 'sub' }, `${inv.invited_by_name ?? 'A Lead'} invited you`)),
      join);
  };

  const groupRows = groups.map((g) => {
    const isCurrent = g.id === current?.id;
    const row = h('a', { class: 'row', href: '#home', 'aria-current': isCurrent ? 'true' : null },
      h('div', {},
        h('div', { class: 'title' }, h('span', { class: 'num' }, groupLabel(g)), ` · ${g.name}`,
          h('span', { class: 'role-tag' }, g.role === 'lead' ? 'Lead' : 'Scout')),
        h('div', { class: 'sub' }, isCurrent ? 'Scouting for this group now' : 'Tap to scout for this group')),
      isCurrent ? icon('check') : icon('next', 20));
    row.addEventListener('click', () => setCurrentGroup(g.id));
    return h('li', {}, row);
  });

  const empty = !groups.length;

  // "Check for invites": asks the server again, with feedback either way.
  const check = h('button', { class: `pill ${empty ? 'big' : 'secondary'} block`, type: 'button' }, 'Check for invites');
  check.addEventListener('click', () => busy(check, 'Checking…', async () => {
    if (!isOnline()) return message.show('No connection right now. Checking for invites needs signal.', 'error');
    const invites = await myPendingInvites().catch((err) => { message.show(friendlyError(err), 'error'); return null; });
    if (invites === null) return;
    showInvites(invites);
    message.show(invites.length ? `${invites.length} invite${invites.length > 1 ? 's' : ''} found.` : 'No invites yet. Ask your Lead to invite your email.', 'info');
  }));

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      groups.length ? h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')) : null,
      h('h1', { tabindex: '-1' }, empty ? 'Join your Scouting group' : 'Scouting groups'),
      h('a', { class: 'icon-btn', href: '#settings', 'aria-label': 'Settings and account' }, icon('account'))),
    h('main', { class: 'content' },
      empty ? h('div', { class: 'join-hero' },
        h('p', { class: 'lede' }, 'Your Lead adds you by email. Ask them to send the invite to:'),
        profile?.email ? h('p', { class: 'join-email' }, profile.email) : null,
        h('button', { class: 'link-btn', type: 'button', onclick: async () => {
          await signOut();
          location.hash = '#auth';
        } }, 'Not you? Sign out'),
        h('p', { class: 'plain' }, 'Then tap Check for invites below (needs signal).')) : null,
      message.el,
      invitesSection,
      groups.length ? [h('h2', { class: 'section-h' }, 'Your groups'), h('ul', { class: 'rows' }, groupRows)] : null,
      h('div', { class: 'home-actions' },
        check,
        h('a', { class: 'pill secondary block', href: '#groups/new' }, empty ? 'I’m a Lead: create a group' : 'Create another group')),
    ),
  );

  function showInvites(invites) {
    invitesSection.hidden = !invites.length;
    invitesSection.replaceChildren(h('h2', { class: 'section-h' }, 'Invites for you'), h('ul', { class: 'rows' }, invites.map(inviteRow)));
  }

  // With signal: look for new Invites, and redraw if your groups changed
  // (e.g. a Lead removed you or you joined somewhere on another phone).
  myPendingInvites().then(showInvites).catch(() => {});
  refreshAccount().then(async (refreshed) => {
    if (refreshed && JSON.stringify(await cachedGroups()) !== JSON.stringify(groups) && location.hash === '#groups') {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  });
  return { el };
}

function renderNewGroup() {
  const message = formMessage();
  let program = null; // the Lead must choose: FTC and FRC team numbers are different
  const programGroup = h('div', { class: 'segmented wide', role: 'group', 'aria-labelledby': 'program-label' });
  const programButtons = PROGRAMS.map((p) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(p === program) }, p);
    b.addEventListener('click', () => {
      program = p;
      programError.hidden = true;
      programButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    return b;
  });
  programGroup.append(...programButtons);

  const team = formField('Team number', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 5, autocomplete: 'off' },
    'Your team’s FIRST number, e.g. 4069.');
  team.input.classList.add('num-input');
  team.input.addEventListener('input', () => { team.input.value = team.input.value.replace(/\D/g, ''); });
  const name = formField('Group name', { type: 'text', autocapitalize: 'words', maxlength: 60, autocomplete: 'off' },
    'Usually your team’s name, e.g. Lo-Ellen Robotics.');
  const submit = h('button', { class: 'pill big block', type: 'submit' }, 'Create group and become Lead');
  const programError = h('p', { class: 'error-text', role: 'alert', hidden: true });

  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'lede' }, 'You’ll be its Lead: you invite your scouts and plan who watches what.'),
    message.el,
    h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'program-label' }, 'Program'), programGroup, programError),
    team.el, name.el,
    h('div', { class: 'actions' }, submit));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = { program, teamNumber: team.input.value, name: name.input.value };
    const errors = checkNewGroup(values);
    programError.textContent = errors.program ?? '';
    programError.hidden = !errors.program;
    team.setError(errors.teamNumber);
    name.setError(errors.name);
    if (Object.keys(errors).length) return;
    if (!isOnline()) return message.show('No connection right now. Creating a group needs signal.', 'error');
    await busy(submit, 'Creating…', async () => {
      try {
        await createGroup(values);
        location.hash = '#group';
      } catch (err) {
        message.show(friendlyError(err), 'error');
      }
    });
  });

  const el = h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#groups', 'aria-label': 'Back to groups' }, icon('back')),
      h('h1', { tabindex: '-1' }, 'New group')),
    h('main', { class: 'content' }, form));
  return { el };
}
