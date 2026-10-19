// Assignments for the Current event (#assign), Leads only.
// One section per member: their Position shifts ("Red 1 · Q1–Q20") and Team
// watches ("Follows 23810"), with Remove, and an Add form. The app never
// assigns anyone by itself (PRODUCT.md: show data, let humans decide).
// Changes need signal; the plan saved on the phone still shows without it.

import { h, icon, formField, formMessage, busy, confirmDialog, bumper, station } from '../ui.js';
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

export async function renderAssign() {
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

  // A note left by the last change ({ memberId, text }), shown in that
  // member's section, which is scrolled back into view.
  const note = await getSetting('assignNote');
  if (note) await setSetting('assignNote', null);
  const reload = async (memberId, text) => {
    await setSetting('assignNote', { memberId, text });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const header = h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: '#home', 'aria-label': 'Back to home' }, icon('back')),
    h('h1', { tabindex: '-1' }, 'Assignments'));

  if (!ev) {
    return { el: h('div', { class: 'screen' }, header, h('main', { class: 'content' },
      h('p', { class: 'plain' }, 'Assignments follow the event’s schedule, so pick your event first.'),
      h('a', { class: 'pill block', href: '#event' }, 'Pick your event'))) };
  }

  const membersEl = h('div', { class: 'assign-members' });
  let shownIds = '';
  const drawMembers = (members) => {
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
      ...shifts.map((s) => instructionRow(m, 'shift', s.id,
        `${positionLabel(s.position)} · Q${s.from_match}–Q${s.to_match}`,
        [station(positionLabel(s.position), s.position.replace(/\d/, '')), h('span', { class: 'num' }, `Q${s.from_match}–Q${s.to_match}`)],
        'Position shift')),
      ...watches.map((w) => instructionRow(m, 'watch', w.id,
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
      changed ? h('p', { class: 'form-message info', role: 'status' }, note.text) : null,
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

  function instructionRow(m, kind, id, title, shown, sub) {
    // Text colour + bin icon (red text would read like the red alliance here).
    const remove = online ? h('button', { class: 'small-btn plain-remove', type: 'button',
      'aria-label': `Remove ${title} from ${m.display_name}` }, h('span', { class: 'icon-label' }, icon('trash', 18), 'Remove')) : null;
    remove?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Remove ${title} from ${m.display_name}?`,
        body: `It disappears from ${m.display_name}’s phone the next time it has signal. Matches already scouted stay.`,
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      busy(remove, '…', async () => {
        try {
          await removeAssignment(group, kind, id);
          await reload(m.user_id, `Removed ${title}.`);
        } catch (err) { message.show(friendlyError(err), 'error'); }
      });
    });
    return h('li', { class: 'row assign-row' },
      h('div', {}, h('div', { class: 'title assign-what', 'aria-label': title }, shown), h('div', { class: 'sub' }, sub)),
      remove);
  }

  // ---------- the Add form ----------
  function addForm(m, current, close) {
    let kind = 'shift';
    let position = null;
    const lastTo = Math.max(0, ...current.shifts.map((s) => s.to_match));
    const lastQual = quals.at(-1)?.number;
    const from = formField('From match', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input', value: String(lastTo + 1) });
    const to = formField('To match', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input',
      value: lastQual && lastQual > lastTo ? String(lastQual) : '' });
    const posField = renderField({ id: 'position', type: 'position', label: 'Position' }, null, (v) => { position = v; posError.hidden = true; }, config);
    const posError = h('p', { class: 'error-text', role: 'alert', hidden: true }, 'Pick a position.');
    const listId = `teams-${m.user_id}`;
    const team = formField('Team number', { inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input', list: listId, autocomplete: 'off' },
      'Every match they play here, playoffs included.');
    const teamList = h('datalist', { id: listId }, (data?.teams ?? []).map((t) => h('option', { value: t.team_number }, t.team_name ?? '')));
    const shiftPart = h('div', { class: 'assign-shift' }, posField, posError, h('div', { class: 'two' }, from.el, to.el),
      // Under both fields (a hint over one would push the boxes out of line).
      lastQual ? h('p', { class: 'field-hint' }, `Qualifications run Q${quals[0].number}–Q${lastQual}.`) : null);
    const watchPart = h('div', { class: 'assign-watch', hidden: true }, team.el, teamList);

    const kindBtns = [['shift', 'Position shift'], ['watch', 'Team watch']].map(([k, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(k === kind), onclick: () => {
        kind = k;
        kindBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['shift', 'watch'][i] === kind)));
        shiftPart.hidden = kind !== 'shift';
        watchPart.hidden = kind !== 'watch';
        save.textContent = kind === 'shift' ? 'Add shift' : 'Add watch';
      } }, label));
    const save = h('button', { class: 'pill block', type: 'submit' }, 'Add shift');
    const cancel = h('button', { class: 'pill secondary block', type: 'button', onclick: close }, 'Cancel');
    const formMsg = formMessage(); // problems show here, next to the Add button

    const form = h('form', { class: 'form assign-form', novalidate: true, 'aria-label': `Add an assignment for ${m.display_name}` },
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
            await addShift(group, { scoutId: m.user_id, position: s.position, from: s.from_match, to: s.to_match });
            await reload(m.user_id, `Added ${positionLabel(s.position)} for Q${s.from_match}–Q${s.to_match}.`);
          } else {
            const n = added.watches.at(-1).team_number;
            await addWatch(group, { scoutId: m.user_id, team: n });
            await reload(m.user_id, `Added: follows ${n} in every match they play.`);
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
      if (!ids.length) return h('td', {}, h('span', { class: 'bumper open' }, 'Open'));
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
      h('h2', { class: 'section-title sub' }, 'Coverage'),
      h('p', { class: 'assign-gaps' }, first
        ? `${openCells.length} open ${openCells.length === 1 ? 'station' : 'stations'} in ${range}. First: Q${first.r.number} ${positionLabel(first.p)}.`
        : `Every station is covered in ${range}.`),
      doubled.length ? h('p', { class: 'assign-gaps' }, doubled.map((d) =>
        `${d.m.display_name} watches two teams in ${listMatches(d.in)}.`).join(' ')) : null,
      // The key first, so the letters can be read as you go.
      h('p', { class: 'coverage-key' }, [
        ...members.filter((m) => inGrid(m.user_id)).map((m) => `${labels.get(m.user_id)} ${m.display_name}`),
        strangers ? '? not in the group' : null,
      ].filter(Boolean).join(' · ')),
      h('table', { class: 'schedule coverage-grid', style: `--stations: ${positions.length}` },
        h('caption', { class: 'visually-hidden' }, 'Who watches each station, in the matches still to play.'),
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

  // Names show from the phone's copy straight away, then refresh with signal.
  drawMembers(await cachedMembers(group.id));
  if (online) listMembers(group.id).then(drawMembers, (err) => message.show(friendlyError(err), 'error'));

  const lede = !quals.length
    ? 'The schedule isn’t out yet. You can still plan Position shifts; teams fill in when it arrives.'
    : `${ev.name} · Q${quals[0].number}–Q${quals.at(-1).number}${twoTeams ? '' : ' · one team per match'}`;

  // After an Add or Remove, go back to the member it changed.
  if (note?.memberId) {
    setTimeout(() => {
      const target = membersEl.querySelector(`[data-member="${note.memberId}"] h2`);
      target?.scrollIntoView({ block: 'start' });
      target?.focus({ preventScroll: true });
    }, 60);
  }

  const el = h('div', { class: 'screen' },
    header,
    h('main', { class: 'content' },
      h('p', { class: 'group-lede' }, lede),
      online ? null : h('p', { class: 'plain' }, 'This is the plan saved on your phone. Adding and removing open up when it next has signal.'),
      showGrid ? coverageEl : null,
      grid.length && !showGrid ? h('p', { class: 'assign-gaps' }, 'No one is assigned yet, so every station is open.') : null,
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
