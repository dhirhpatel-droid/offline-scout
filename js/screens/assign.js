// Assignments for the Current event (#assign), Leads only.
// One section per member: their Position shifts ("Red 1 · Q1–Q20") and Team
// watches ("Follows 23810"), with Remove, and an Add form. The app never
// assigns anyone by itself (PRODUCT.md: show data, let humans decide).
// Changes need signal; the plan saved on the phone still shows without it.

import { backHref } from '../nav.js';
import { h, icon, formField, formMessage, busy, bumper, station, offlineNote, topbar } from '../ui.js';
import { currentGroup, cachedMembers, listMembers, currentUser } from '../account.js';
import { isLead, sortMembers } from '../group-rules.js';
import { loadConfig } from '../config.js';
import { renderField } from '../fields.js';
import { positionLabel, matchCode, alliancePositions } from '../submissions.js';
import { cachedEvent, cachedPlan, addShift, addWatch, removeAssignment } from '../events.js';
import { assignmentsFor, byMatch, coverageGrid, shortNames } from '../assignments.js';
import { isAtEvent, timeOf } from '../schedule.js';
import { friendlyError, isOnline } from '../supabase.js';
import { getSetting, setSetting } from '../db.js';

export async function renderAssign({ param } = {}) {
  // #assign/23810 (from a Team page): Add forms start on a Team watch for it.
  const watchTeam = Number(param) || null;
  const group = await currentGroup();
  if (!isLead(group)) {
    location.hash = '#home';
    return { el: h('div') };
  }
  const ev = group.currentEvent;
  const [config, data, plan, me] = await Promise.all([
    loadConfig(group.game_config_id), cachedEvent(ev?.id), cachedPlan(group.id, ev?.id), currentUser(),
  ]);
  const matches = data?.matches ?? [];
  const quals = matches.filter((m) => m.level === 'qual');
  const online = isOnline();
  const message = formMessage();
  const twoTeams = group.settings?.twoTeams ?? true;

  // A note left by the last change ({ memberId, text, undo }), shown in that
  // member's section, which is scrolled back into view. undo says how to
  // reverse it: { op: 'add', kind, row } re-adds a removed row,
  // { op: 'remove', kind, id } removes a row that was just added.
  const note = await getSetting('assignNote');
  if (note) await setSetting('assignNote', null);
  const reload = async (memberId, text, undo = null) => {
    await setSetting('assignNote', { memberId, text, undo });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // Add a shift or watch, and remember how to undo it (the new row's id).
  async function addAndNote(memberId, kind, row, text, where = null) {
    const before = new Set([...plan.shifts, ...plan.watches].map((x) => x.id));
    const after = kind === 'shift'
      ? await addShift(group, { scoutId: memberId, position: row.position, from: row.from_match, to: row.to_match })
      : await addWatch(group, { scoutId: memberId, team: row.team_number });
    const added = (kind === 'shift' ? after.shifts : after.watches).find((x) => !before.has(x.id));
    await setSetting('assignNote', { memberId, text, where, undo: added ? { op: 'remove', kind, id: added.id } : null });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  // The note itself. It gets focus after the screen redraws, so a screen
  // reader reads what changed (a live region made fresh with its text isn't
  // reliably announced).
  function noteEl(n) {
    return h('div', { class: 'form-message info assign-note', role: 'status', tabindex: '-1' }, h('span', {}, n.text), undoButton(n));
  }

  // The Undo button in a note.
  function undoButton(n) {
    if (!n?.undo) return null;
    if (!online) return h('span', { class: 'undo-later' }, 'Undo needs signal');
    const btn = h('button', { class: 'small-btn', type: 'button' }, 'Undo');
    btn.addEventListener('click', () => busy(btn, '…', async () => {
      try {
        const u = n.undo;
        if (u.op === 'remove') {
          await removeAssignment(group, u.kind, u.id);
          await reload(n.memberId, 'Undone.');
        } else {
          await addAndNote(n.memberId, u.kind, u.row, 'Put back.');
        }
      } catch (err) { message.show(friendlyError(err), 'error'); }
    }));
    return btn;
  }

  const header = topbar('Assignments', backHref('#home'));

  if (!ev) {
    return { el: h('div', { class: 'screen' }, header, h('main', { class: 'content' },
      h('p', { class: 'plain' }, 'Assignments follow the event’s schedule, so pick your event first.'),
      h('a', { class: 'pill block', href: '#event' }, 'Pick your event'))) };
  }

  const membersEl = h('div', { class: 'assign-members' });
  let shownIds = '';
  // The latest member list, for names in messages.
  let lastMembers = [];
  const memberName = (id) => lastMembers.find((x) => x.user_id === id)?.display_name ?? 'someone';
  const drawMembers = (members) => {
    lastMembers = members;
    // Don't redraw under an open Add form unless the members really changed.
    const ids = members.map((m) => `${m.user_id}:${m.display_name}`).sort().join();
    if (ids === shownIds) return;
    drawCoverage(members); // names changed: the grid's letters may too
    if (shownIds && membersEl.querySelector('form')) return;
    shownIds = ids;
    membersEl.replaceChildren(...sortMembers(members).map(memberSection));
  };

  // ---------- one member ----------
  function memberSection(m) {
    const shifts = plan.shifts.filter((s) => s.scout_id === m.user_id);
    const watches = plan.watches.filter((w) => w.scout_id === m.user_id);
    const mine = assignmentsFor({ scoutId: m.user_id, shifts, watches, matches });
    const left = mine.filter((a) => !a.played);
    const next = left[0];
    const summary = !mine.length ? 'Nothing assigned'
      : [`${mine.length} ${mine.length === 1 ? 'match' : 'matches'}`,
        next ? `next ${matchCode({ level: next.level, match: next.number })}${next.scheduled_at ? ` at ${timeOf(next)}` : ''}` : 'all played',
      ].join(' · ');

    const rows = [
      ...shifts.map((s) => instructionRow(m, 'shift', s,
        `${positionLabel(s.position)} · Q${s.from_match}–Q${s.to_match}`,
        [station(positionLabel(s.position), s.position.replace(/\d/, '')), h('span', { class: 'num' }, `Q${s.from_match}–Q${s.to_match}`)],
        'Position shift')),
      ...watches.map((w) => instructionRow(m, 'watch', w,
        `Follows ${w.team_number}`,
        [bumper(w.team_number), h('span', {}, 'every match')],
        `Team watch · ${countLabel(mine.filter((a) => a.team === w.team_number).length)} in the schedule`)),
    ];

    // Offline: no Add button at all (the note at the top says why).
    const addBtn = online ? h('button', { class: 'pill secondary block', type: 'button' },
      icon('plus', 20), `Add for ${m.display_name}`) : null;
    const changed = note?.memberId === m.user_id;
    const section = h('section', { class: 'assign-member', 'data-member': m.user_id },
      h('h2', { class: 'assign-name', tabindex: '-1' }, m.display_name, m.user_id === me?.id ? ' (you)' : ''),
      h('p', { class: 'assign-summary' }, summary),
      changed && note.where !== 'grid' ? noteEl(note) : null,
      rows.length ? h('ul', { class: 'rows' }, rows) : null,
      addBtn);
    addBtn?.addEventListener('click', () => {
      addBtn.replaceWith(addForm(m, { shifts, watches }, () => {
        section.querySelector('form').replaceWith(addBtn);
        addBtn.focus();
      }));
      section.querySelector('form button[aria-pressed]')?.focus();
    });
    return section;
  }

  function instructionRow(m, kind, row, title, shown, sub) {
    // Text colour + bin icon (red text would read like the red alliance here).
    const remove = online ? h('button', { class: 'small-btn plain-remove', type: 'button',
      'aria-label': `Remove ${title} from ${m.display_name}` }, h('span', { class: 'icon-label' }, icon('trash', 18), 'Remove')) : null;
    // No "are you sure?": the note that follows has Undo (every tap undoable).
    remove?.addEventListener('click', () => {
      busy(remove, '…', async () => {
        try {
          await removeAssignment(group, kind, row.id);
          // Undo puts the same instruction back.
          await reload(m.user_id, `Removed ${title}.`, { op: 'add', kind, row });
        } catch (err) { message.show(friendlyError(err), 'error'); }
      });
    });
    return h('li', { class: 'row assign-row' },
      h('div', {}, h('div', { class: 'title assign-what', 'aria-label': title }, shown), h('div', { class: 'sub' }, sub)),
      remove);
  }

  // ---------- the Add form ----------
  function addForm(m, current, close) {
    let kind = watchTeam ? 'watch' : 'shift';
    let position = null;
    const lastTo = Math.max(0, ...current.shifts.map((s) => s.to_match));
    const lastQual = quals.at(-1)?.number;
    // Suggest the first match still to play after their last shift (never
    // past the end of qualifications).
    const firstOpen = quals.find((m) => !m.played && m.number > lastTo)?.number
      ?? quals.find((m) => !m.played)?.number ?? (lastQual ? Math.min(lastTo + 1, lastQual) : lastTo + 1);
    const from = formField('From match', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input', value: String(firstOpen) });
    const to = formField('To match', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input',
      value: lastQual && lastQual >= firstOpen ? String(lastQual) : '' });
    const posField = renderField({ id: 'position', type: 'position', label: 'Position' }, null, (v) => { position = v; posError.hidden = true; }, config);
    const posError = h('p', { class: 'error-text', role: 'alert', hidden: true }, 'Pick a position.');
    const listId = `teams-${m.user_id}`;
    const team = formField('Team number', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input', list: listId, autocomplete: 'off',
      value: watchTeam ? String(watchTeam) : null },
      'Every match they play here, playoffs included.');
    const teamList = h('datalist', { id: listId }, (data?.teams ?? []).map((t) => h('option', { value: t.team_number }, t.team_name ?? '')));
    // Someone else already on this position in these matches? Say so (it's
    // allowed: two Scouts on one robot can be on purpose).
    const overlapEl = h('p', { class: 'field-hint overlap', 'aria-live': 'polite' });
    const showOverlap = () => {
      const a = Number(from.input.value);
      const b = Number(to.input.value) || a;
      const others = position ? grid.filter((r) => r.number >= a && r.number <= b)
        .flatMap((r) => r.scouts[position].filter((id) => id !== m.user_id).map((id) => ({ id, n: r.number }))) : [];
      if (!others.length) { overlapEl.textContent = ''; return; }
      const who = [...new Set(others.map((o) => memberName(o.id)))].join(' and ');
      const nums = others.map((o) => o.n);
      overlapEl.textContent = `${positionLabel(position)} is already covered by ${who} in Q${Math.min(...nums)}–Q${Math.max(...nums)}. You can still add it.`;
    };
    [from.input, to.input].forEach((i) => i.addEventListener('input', showOverlap));
    posField.addEventListener('click', () => queueMicrotask(showOverlap));
    const shiftPart = h('div', { class: 'assign-shift', hidden: kind !== 'shift' }, posField, posError, h('div', { class: 'two' }, from.el, to.el), overlapEl,
      // Under both fields (a hint over one would push the boxes out of line).
      lastQual ? h('p', { class: 'field-hint' }, `Qualifications run Q${quals[0].number}–Q${lastQual}.`) : null);
    const watchPart = h('div', { class: 'assign-watch', hidden: kind !== 'watch' }, team.el, teamList);

    const kindBtns = [['shift', 'Position shift'], ['watch', 'Team watch']].map(([k, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(k === kind), onclick: () => {
        kind = k;
        kindBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['shift', 'watch'][i] === kind)));
        shiftPart.hidden = kind !== 'shift';
        watchPart.hidden = kind !== 'watch';
        save.textContent = kind === 'shift' ? 'Add shift' : 'Add watch';
      } }, label));
    const save = h('button', { class: 'pill block', type: 'submit' }, kind === 'shift' ? 'Add shift' : 'Add watch');
    const cancel = h('button', { class: 'pill secondary block', type: 'button', onclick: close }, 'Cancel');
    const formMsg = formMessage(); // problems show here, next to the Add button

    const form = h('form', { class: 'form assign-form', novalidate: true, 'aria-labelledby': `add-for-${m.user_id}` },
      h('h3', { class: 'assign-form-h', id: `add-for-${m.user_id}` }, `New assignment for ${m.display_name}`),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Kind of assignment' }, kindBtns),
      shiftPart, watchPart,
      formMsg.el,
      h('div', { class: 'two' }, cancel, save));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let added;
      if (kind === 'shift') {
        const a = Number(from.input.value);
        const b = Number(to.input.value);
        if (!position) { posError.hidden = false; return; }
        if (!Number.isInteger(a) || a < 1) return from.setError('Enter the first match number.');
        if (lastQual && a > lastQual) return from.setError(`Qualifications end at Q${lastQual}. Enter Q${lastQual} or lower.`);
        if (!to.input.value.trim()) return to.setError('Enter the last match of this shift.');
        if (!Number.isInteger(b) || b < a) return to.setError(`Enter a match number from ${a} up.`);
        added = { shifts: [...current.shifts, { scout_id: m.user_id, position, from_match: a, to_match: b }], watches: current.watches };
      } else {
        const n = Number(team.input.value);
        if (!Number.isInteger(n) || n < 1) return team.setError('Enter a team number.');
        if (data?.teams.length && !isAtEvent(data.teams, n)) return team.setError(`${n} isn’t on this event’s team list.`);
        if (current.watches.some((w) => w.team_number === n)) return team.setError(`${m.display_name} already follows ${n}.`);
        added = { shifts: current.shifts, watches: [...current.watches, { scout_id: m.user_id, team_number: n }] };
      }

      // Too many Teams in one match? (Two at once only if the Group setting allows.)
      const clash = byMatch(assignmentsFor({ scoutId: m.user_id, ...added, matches })).find((g) => g.items.length > (twoTeams ? 2 : 1));
      if (clash) {
        const code = matchCode({ level: clash.level, match: clash.number });
        formMsg.show(twoTeams
          ? `That gives ${m.display_name} three teams in ${code}. Two at once is the most one person can watch.`
          : `That gives ${m.display_name} two teams in ${code}. Watching two teams at once is turned off in Group settings.`, 'error');
        return;
      }

      busy(save, 'Adding…', async () => {
        try {
          if (kind === 'shift') {
            const s = added.shifts.at(-1);
            await addAndNote(m.user_id, 'shift', s, `Added ${positionLabel(s.position)} for Q${s.from_match}–Q${s.to_match}.`);
          } else {
            const w = added.watches.at(-1);
            await addAndNote(m.user_id, 'watch', w, `Added: follows ${w.team_number} in every match they play.`);
          }
        } catch (err) { formMsg.show(friendlyError(err), 'error'); }
      });
    });
    return form;
  }

  // ---------- Coverage grid ----------
  // Laid out like the Event's printed schedule: one row per match still to
  // play, one column per station. A covered station shows the Scout's
  // letter(s); an open one is a dashed plate that says "Open". Shown so the
  // Lead can decide; the app never fills gaps itself.
  const positions = alliancePositions(config);
  const grid = coverageGrid(plan, matches, positions);
  const FIRST_ROWS = 8; // the rest behind "Show all", so members stay close
  let showAll = false;
  const coverageEl = h('section', { class: 'coverage' });
  const showGrid = grid.length && (plan.shifts.length || plan.watches.length);

  function drawCoverage(members) {
    if (!showGrid) return;
    const labels = shortNames(members);
    const nameOf = (id) => members.find((m) => m.user_id === id)?.display_name ?? 'someone not in the group';
    // Open stations, counted as station × match (what the Lead acts on).
    const openCells = grid.flatMap((r) => positions.filter((p) => !r.scouts[p].length).map((p) => ({ r, p })));
    const first = openCells[0];
    const range = `Q${grid[0].number}–Q${grid.at(-1).number}`;
    // Scouts watching two Teams in one match: allowed, but said in words.
    const doubled = members.map((m) => ({ m, in: grid.filter((r) => r.doubled.includes(m.user_id)) }))
      .filter((d) => d.in.length);
    const inGrid = (id) => grid.some((r) => positions.some((p) => r.scouts[p].includes(id)));
    const strangers = grid.some((r) => positions.some((p) => r.scouts[p].some((id) => !labels.has(id))));
    const rows = showAll ? grid : grid.slice(0, FIRST_ROWS);
    const more = grid.length - rows.length;

    const cell = (row, p) => {
      const ids = row.scouts[p];
      const color = p.replace(/\d/, '');
      if (!ids.length) {
        if (!online) return h('td', {}, h('span', { class: 'bumper open' }, 'Open'));
        // With signal it's a button, so it says so: "+ Open".
        const plate = h('span', { class: 'bumper open can-fill' }, icon('plus', 14), 'Open');
        // Tap an open station to choose who watches it (the Lead decides).
        return h('td', {}, h('button', { class: 'schedule-pick', type: 'button',
          'aria-label': `Q${row.number} ${positionLabel(p)} is open. Choose who watches it.`,
          onclick: (e) => fillOpen(row, p, members, e.currentTarget) }, plate));
      }
      return h('td', {}, h('span', { class: `bumper ${color}` },
        h('span', { 'aria-hidden': 'true' }, ids.map((id) => labels.get(id) ?? '?').join(' ')),
        h('span', { class: 'visually-hidden' }, ids.map(nameOf).join(' and '))));
    };
    const showAllBtn = more ? h('button', { class: 'pill secondary block', type: 'button', onclick: () => {
      showAll = true;
      drawCoverage(members);
      // Keep focus in the grid: on the first newly shown match.
      coverageEl.querySelectorAll('tbody th')[rows.length]?.focus();
    } }, `Show all ${grid.length} matches`) : null;

    coverageEl.replaceChildren(...[
      h('h2', { class: 'section-h' }, 'Coverage'),
      h('p', { class: 'assign-gaps' }, first
        ? `${openCells.length} open ${openCells.length === 1 ? 'position' : 'positions'} in ${range}. First: Q${first.r.number} ${positionLabel(first.p)}.`
        : `Every position is covered in ${range}.`),
      note?.where === 'grid' ? noteEl(note) : null,
      doubled.length ? h('p', { class: 'assign-gaps' }, doubled.map((d) =>
        `${d.m.display_name} watches two teams in ${listMatches(d.in)}.`).join(' ')) : null,
      // Cells show first names; the key only explains the ones that got
      // shortened ("Sam K = Sam Kim") and "?".
      (() => {
        const explain = [
          ...members.filter((m) => inGrid(m.user_id) && labels.get(m.user_id) !== m.display_name)
            .map((m) => `${labels.get(m.user_id)} = ${m.display_name}`),
          strangers ? '? = not in the group' : null,
        ].filter(Boolean);
        return explain.length ? h('p', { class: 'coverage-key' }, explain.join(' · ')) : null;
      })(),
      h('details', { class: 'help-item' },
        h('summary', {}, h('span', {}, 'How Coverage works'), icon('next', 18)),
        h('p', {}, 'Each row is a match still to play, each column an Alliance position. A name means that Scout watches it, '
          + 'from a Position shift or a Team watch. Open means nobody does: tap it to choose someone. '
          + 'The app shows the gaps but never assigns anyone by itself.')),
      h('table', { class: 'schedule coverage-grid', style: `--stations: ${positions.length}` },
        h('caption', { class: 'visually-hidden' }, 'Who watches each Alliance position, in the matches still to play.'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Match'),
          // FRC has 6 stations: short headings (R1), with the full name in
          // hidden text (screen readers don't reliably read an abbr's title).
          positions.map((p) => h('th', { scope: 'col', class: `st ${p.replace(/\d/, '')}` },
            positions.length > 4
              ? [h('span', { 'aria-hidden': 'true' }, positionLabel(p).replace(/[a-z ]/g, '')), h('span', { class: 'visually-hidden' }, positionLabel(p))]
              : positionLabel(p))))),
        h('tbody', {}, rows.map((r, i) => h('tr', { class: i === 0 ? 'next-up' : '' },
          h('th', { scope: 'row', tabindex: '-1' },
            h('span', { class: 'schedule-code num' }, `Q${r.number}`),
            h('span', { class: `schedule-time${i === 0 ? ' next' : ''}` }, i === 0 ? 'Next' : timeOf(r) ?? ''),
            i === 0 && timeOf(r) ? h('span', { class: 'schedule-time' }, timeOf(r)) : null),
          positions.map((p) => cell(r, p)))))),
      showAllBtn,
    ].filter(Boolean));
  }

  // ---------- filling an open station ----------
  // A sheet: "Who watches Blue 2 from Q18?" The Lead picks the Scout; "To"
  // starts at the last match in a row where that station is still open.
  function fillOpen(row, p, members, opener) {
    let until = row.number;
    for (const r of grid.slice(grid.indexOf(row) + 1)) {
      if (r.number !== until + 1 || r.scouts[p].length) break;
      until = r.number;
    }
    let chosen = null;
    const msg = formMessage();
    const to = formField('To match', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input', value: String(until) },
      until > row.number ? `Open in a row until Q${until}.` : null);
    const shiftFor = (m) => ({ scout_id: m.user_id, position: p, from_match: row.number, to_match: Number(to.input.value) || row.number });
    // Would this shift give them too many Teams in some match? (Checked as
    // the sheet opens, so full people are greyed out with the reason.)
    const clashFor = (m) => {
      const mine = { shifts: plan.shifts.filter((s) => s.scout_id === m.user_id).concat(shiftFor(m)),
        watches: plan.watches.filter((w) => w.scout_id === m.user_id) };
      return byMatch(assignmentsFor({ scoutId: m.user_id, ...mine, matches })).find((g) => g.items.length > (twoTeams ? 2 : 1));
    };
    // One choice from a list: real radio buttons (arrow keys and "1 of 3"
    // come free), each in a big tappable label. Someone who'd have too many
    // Teams is greyed out with the reason, re-checked when "To" changes.
    const sorted = sortMembers(members);
    const people = sorted.map((m) => {
      const input = h('input', { type: 'radio', name: 'fill-who', value: m.user_id, class: 'visually-hidden' });
      const why = h('span', { class: 'pick-why' });
      const label = h('label', { class: 'pick-person' }, input,
        h('span', {}, m.display_name, m.user_id === me?.id ? ' (you)' : ''), why);
      input.addEventListener('change', () => { chosen = m; msg.show(null); add.disabled = false; });
      return { m, input, why, label };
    });
    const legend = h('legend', { class: 'visually-hidden' });
    const recheck = () => {
      let full = 0;
      for (const x of people) {
        const clash = clashFor(x.m);
        // Allowed, but they'd watch two Teams at once somewhere: say where.
        const doubled = !clash && byMatch(assignmentsFor({ scoutId: x.m.user_id, matches,
          shifts: plan.shifts.filter((s) => s.scout_id === x.m.user_id).concat(shiftFor(x.m)),
          watches: plan.watches.filter((w) => w.scout_id === x.m.user_id) })).find((g) => g.items.length > 1);
        x.input.disabled = Boolean(clash);
        x.label.classList.toggle('full', Boolean(clash));
        x.why.textContent = clash ? `${twoTeams ? 'Already 2 teams' : 'Already watching'} in Q${clash.number}`
          : doubled ? `Would watch 2 teams in Q${doubled.number}` : '';
        if (clash) full += 1;
        if (clash && chosen === x.m) { chosen = null; x.input.checked = false; add.disabled = true; }
      }
      // Screen readers skip disabled radios, so the legend says how many can't.
      legend.textContent = `Who watches it${full ? ` (${full} ${full === 1 ? 'person is' : 'people are'} already full for these matches)` : ''}`;
    };
    recheck();
    to.input.addEventListener('input', recheck);
    const stationTeam = teamAtStation(row, p);
    const add = h('button', { class: 'pill block', type: 'submit', disabled: true }, 'Add shift'); // until someone is chosen
    const dialog = h('dialog', { 'aria-labelledby': 'fill-title' },
      h('form', { class: 'form', novalidate: true, method: 'dialog' },
        h('h2', { id: 'fill-title' }, `Who watches ${positionLabel(p)}${stationTeam ? ` (${stationTeam})` : ''} from Q${row.number}?`),
        h('fieldset', { class: 'pick-people' }, legend, people.map((x) => x.label)),
        to.el, msg.el,
        h('div', { class: 'actions' }, add,
          h('button', { class: 'pill secondary block', type: 'button', onclick: () => close() }, 'Cancel'))));
    // Closing puts focus back on the Open station that was tapped.
    const close = () => { dialog.close(); dialog.remove(); opener?.focus(); };
    dialog.addEventListener('cancel', close);
    dialog.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const b = Number(to.input.value);
      if (!chosen) return msg.show('Choose who watches it.', 'error');
      if (!Number.isInteger(b) || b < row.number) return to.setError(`Enter Q${row.number} or later.`);
      const shift = { scout_id: chosen.user_id, position: p, from_match: row.number, to_match: b };
      const mine = { shifts: plan.shifts.filter((s) => s.scout_id === chosen.user_id).concat(shift),
        watches: plan.watches.filter((w) => w.scout_id === chosen.user_id) };
      const clash = byMatch(assignmentsFor({ scoutId: chosen.user_id, ...mine, matches })).find((g) => g.items.length > (twoTeams ? 2 : 1));
      if (clash) return msg.show(`That gives ${chosen.display_name} too many teams in Q${clash.number}.`, 'error');
      // The sheet stays open until it worked, so a failure (weak signal)
      // shows its message here instead of vanishing.
      busy(add, 'Adding…', async () => {
        try {
          await addAndNote(chosen.user_id, 'shift', shift, `${chosen.display_name} now watches ${positionLabel(p)} for Q${row.number}–Q${b}.`, 'grid');
          dialog.close();
          dialog.remove();
        } catch (err) { msg.show(friendlyError(err), 'error'); }
      });
    });
    document.body.append(dialog);
    dialog.showModal();
    people.find((x) => !x.input.disabled)?.input.focus();
  }

  // The Team at a station in a match, from the schedule ("24436"), if known.
  function teamAtStation(row, p) {
    const m = matches.find((x) => x.level === 'qual' && x.number === row.number);
    const color = p.replace(/\d/, '');
    return m?.[color]?.[Number(p.slice(color.length)) - 1] ?? null;
  }

  // Names show from the phone's copy straight away, then refresh with signal.
  drawMembers(await cachedMembers(group.id));
  if (online) listMembers(group.id).then(drawMembers, (err) => message.show(friendlyError(err), 'error'));

  const lede = !quals.length
    ? 'The schedule isn’t out yet. You can still plan Position shifts; teams fill in when it arrives.'
    : `${ev.name} · Q${quals[0].number}–Q${quals.at(-1).number}${twoTeams ? '' : ' · one team per match'}`;

  // After a change, go back to where it was made (the member, or the grid)
  // and focus the note so it's read out.
  if (note?.memberId) {
    setTimeout(() => {
      const where = note.where === 'grid' ? coverageEl : membersEl.querySelector(`[data-member="${note.memberId}"]`);
      where?.scrollIntoView({ block: 'start' });
      where?.querySelector('.assign-note')?.focus({ preventScroll: true });
    }, 60);
  }

  const el = h('div', { class: 'screen' },
    header,
    h('main', { class: 'content' },
      h('p', { class: 'group-lede' }, lede),
      watchTeam && online ? h('p', { class: 'notice' }, `Choose who follows ${watchTeam}: tap Add for them below. The form starts on a Team watch for ${watchTeam}.`) : null,
      online ? null : offlineNote('Your plan is saved on this phone and still shows here. Adding and removing happen with signal.'),
      showGrid ? coverageEl : null,
      grid.length && !showGrid ? h('p', { class: 'assign-gaps' }, 'No one is assigned yet, so every position is open.') : null,
      message.el,
      membersEl),
  );
  return { el };
}

const countLabel = (n) => `${n} ${n === 1 ? 'match' : 'matches'}`;

// "Q18", "Q18 and Q19", "Q18, Q19 and Q20"
function listMatches(rows) {
  const codes = rows.map((r) => `Q${r.number}`);
  return codes.length < 2 ? codes.join('') : `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`;
}
