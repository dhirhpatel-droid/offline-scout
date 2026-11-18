// Builds one input widget from one field in the game config.
// This is why no scouting field is written into the HTML: the config says
// { "type": "counter", "label": "HIVE TIPs", "points": 20 } and this file
// turns it into a −/+ counter row.
//
// renderField(field, value, onChange, config) returns an element.
// onChange(newValue) is called on every tap so the match screen can autosave.
// config is the whole game config (the position widget needs its alliances).

import { h, icon, buzz } from './ui.js';
import { alliancePositions, allianceOf, positionLabel } from './submissions.js';

let uid = 0;
const nextId = () => `f${++uid}`;

export function renderField(field, value, onChange, config) {
  const render = RENDERERS[field.type];
  if (!render) throw new Error(`No widget for field type "${field.type}"`);
  const el = render(field, value, onChange, config);
  el.dataset.fieldId = field.id;
  // "width": "half" in the config puts two short fields side by side.
  if (field.width === 'half') el.classList.add('half');
  return el;
}

function pointsHint(field) {
  if (!field.points) return field.hint ?? null;
  const unit = field.points === 1 ? 'pt' : 'pts';
  const pts = field.type === 'counter' ? `${field.points} ${unit} each` : `+${field.points} ${unit}`;
  return field.hint ? `${pts} · ${field.hint}` : pts;
}

function labelBlock(field, labelId) {
  const hint = pointsHint(field);
  return h('div', {},
    h('div', { class: 'field-label', id: labelId }, field.label),
    hint && h('div', { class: 'field-hint' }, hint),
  );
}

const RENDERERS = {
  // Big − / number / + row. Minus is the undo.
  counter(field, value, onChange) {
    let count = Number(value) || 0;
    const labelId = nextId();
    const valueEl = h('output', { class: 'value num', 'aria-live': 'polite' }, count);
    const minus = h('button', { class: 'round', type: 'button', 'aria-label': `Remove one ${field.label}` }, icon('minus', 28));
    const plus = h('button', { class: 'round add', type: 'button', 'aria-label': `Add one ${field.label}` }, icon('plus', 30));
    // The hint sits on its own line under the controls (full width).
    const hint = pointsHint(field);
    const row = h('div', { class: 'field counter', role: 'group', 'aria-labelledby': labelId },
      h('div', {}, h('div', { class: 'field-label', id: labelId }, field.label)), minus, valueEl, plus,
      hint && h('div', { class: 'field-hint' }, hint));

    // A config may cap a counter ("max": 4 FLOWERS), so a mis-tap can't go past it.
    const top = Number.isFinite(field.max) ? field.max : Infinity;
    function set(next, flash) {
      count = Math.min(top, Math.max(0, next));
      valueEl.textContent = count;
      minus.disabled = count === 0;
      plus.disabled = count >= top;
      if (flash) {
        // Restart the flash animation even on fast repeated taps.
        row.classList.remove('flash');
        void row.offsetWidth;
        row.classList.add('flash');
      }
      buzz();
      onChange(count);
    }
    minus.disabled = count === 0;
    plus.disabled = count >= top;
    minus.addEventListener('click', () => set(count - 1, false));
    plus.addEventListener('click', () => set(count + 1, true));
    return row;
  },

  // A tap tile: the whole row is one big button. Off until tapped; tapping
  // again turns it off (the undo). Clearer in bright light than a Yes/No pair,
  // where a selected "No" and an unanswered question looked the same.
  toggle(field, value, onChange) {
    let on = value === true;
    const hint = pointsHint(field);
    const tile = h('button', { class: 'field tile', type: 'button', 'aria-pressed': String(on) },
      h('span', { class: 'tile-text' },
        h('span', { class: 'field-label' }, field.label),
        hint && h('span', { class: 'field-hint' }, hint)),
      h('span', { class: 'tile-check', 'aria-hidden': 'true' }, icon('check', 26)));
    tile.addEventListener('click', () => {
      on = !on;
      tile.setAttribute('aria-pressed', String(on));
      buzz();
      onChange(on);
    });
    return tile;
  },

  // One of several options, e.g. Played defense: None / Some / A lot.
  choice(field, value, onChange) {
    return answerable(field, value, onChange, field.options);
  },

  // Alliance position (Red 1, Red 2, Blue 1...): one row per alliance, made
  // from the config's "alliance" so FRC gets three per row with no extra code.
  position(field, value, onChange, config) {
    const labelId = nextId();
    let current = value;
    const buttons = [];
    const rows = config.alliance.colors.map((color) => {
      const row = h('div', { class: 'segmented' });
      for (const pos of alliancePositions(config).filter((p) => allianceOf(p) === color)) {
        const btn = h('button', {
          type: 'button', 'data-color': color, 'data-value': pos,
          'aria-pressed': String(pos === current),
        }, positionLabel(pos));
        btn.addEventListener('click', () => {
          current = pos;
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
          buzz();
          onChange(current);
        });
        buttons.push(btn);
        row.append(btn);
      }
      return row;
    });
    // With a field map in the config, a drawing of the field sits above the
    // buttons and the robot you pick lights up, so a Scout can see which robot
    // is theirs. Tapping a robot in the drawing picks it too (the buttons stay
    // for screen readers). Drawn from the BIOBUZZ manual, section 9: a 6 by 6
    // field of tiles; seen from the audience, red's ALLIANCE AREA is on the
    // left and blue's on the right, and columns A to C are red's side. The
    // HIVE structure in the middle holds a red HIVE and a blue HIVE, each with
    // a CELL toward the audience and one at the far end, and each HIVE tips
    // both ways on its pivot.
    const map = config.alliance.fieldMap;
    let drawing = null;
    if (map?.left && map?.right) {
      const all = alliancePositions(config);
      const sideOf = (color) => all.filter((p) => allianceOf(p) === color);
      const name = (color) => positionLabel(sideOf(color)[0]).replace(/\s*\d+$/, '');
      const X0 = 60, SIZE = 210, T = SIZE / 6; // field left edge, width, one tile
      const tiles = [1, 2, 3, 4, 5].map((i) => `<line x1="${X0 + i * T}" y1="0" x2="${X0 + i * T}" y2="${SIZE}"/>`
        + `<line x1="${X0}" y1="${i * T}" x2="${X0 + SIZE}" y2="${i * T}"/>`).join('');
      const halves = `<rect class="map-half" data-color="${map.left}" x="${X0}" y="0" width="${SIZE / 2}" height="${SIZE}"/>`
        + `<rect class="map-half" data-color="${map.right}" x="${X0 + SIZE / 2}" y="0" width="${SIZE / 2}" height="${SIZE}"/>`;
      // a HIVE: a bar with a CELL at each end, a pivot in the middle, and a
      // two-way arrow on its outer side to show it tips either way
      const hive = (color, cx, out) => {
        const top = 58, bot = 152, mid = (top + bot) / 2, ax = cx + out * 17;
        return `<g class="map-hive" data-color="${color}">`
          + `<rect class="map-hive-bar" x="${cx - 4}" y="${top}" width="8" height="${bot - top}" rx="4"/>`
          + `<rect class="map-cell" x="${cx - 11}" y="${top - 6}" width="22" height="18" rx="4"/>`
          + `<rect class="map-cell" x="${cx - 11}" y="${bot - 12}" width="22" height="18" rx="4"/>`
          + `<circle class="map-pivot" cx="${cx}" cy="${mid}" r="4"/>`
          + `<path class="map-tip" d="M ${ax} ${top + 18} Q ${ax + out * 10} ${mid} ${ax} ${bot - 18}"/>`
          + `<path class="map-tip-head" d="M ${ax - 4} ${top + 25} L ${ax} ${top + 17} L ${ax + 4} ${top + 25} M ${ax - 4} ${bot - 25} L ${ax} ${bot - 17} L ${ax + 4} ${bot - 25}"/>`
          + `</g>`;
      };
      const cx = X0 + SIZE / 2;
      const hives = `<line class="map-frame" x1="${cx - 15}" y1="${105}" x2="${cx + 15}" y2="${105}"/>`
        + hive(map.left, cx - 15, -1) + hive(map.right, cx + 15, 1)
        + `<text class="map-note" x="${cx}" y="${40}">HIVES</text>`;
      // robots start on their own side, against the wall nearest their drive team
      const per = config.alliance.robotsPerAlliance, gap = SIZE / per;
      const bots = [[map.left, X0 + 36], [map.right, X0 + SIZE - 36]].flatMap(([color, x]) => sideOf(color).map((pos, i) => {
        const y = gap * i + gap / 2;
        return `<g class="map-bot" data-color="${color}" data-value="${pos}" transform="translate(${x} ${y})">`
          + `<rect x="-29" y="-19" width="58" height="38" rx="8"/><text y="5">${positionLabel(pos)}</text></g>`;
      })).join('');
      drawing = h('div', { class: 'field-map', 'aria-hidden': 'true' });
      drawing.innerHTML = `<svg viewBox="0 0 ${X0 * 2 + SIZE} ${SIZE + 24}" xmlns="http://www.w3.org/2000/svg">`
        + `<rect class="map-side" data-color="${map.left}" x="0" y="0" width="${X0 - 6}" height="${SIZE}" rx="8"/>`
        + `<rect class="map-side" data-color="${map.right}" x="${X0 + SIZE + 6}" y="0" width="${X0 - 6}" height="${SIZE}" rx="8"/>`
        + `<text class="map-side-label" transform="translate(${(X0 - 6) / 2 + 2} ${SIZE / 2}) rotate(-90)">${name(map.left)} drive team</text>`
        + `<text class="map-side-label" transform="translate(${X0 + SIZE + 6 + (X0 - 6) / 2 - 2} ${SIZE / 2}) rotate(90)">${name(map.right)} drive team</text>`
        + `<rect class="map-field" x="${X0}" y="0" width="${SIZE}" height="${SIZE}" rx="6"/>${halves}<g class="map-tiles">${tiles}</g>`
        + `<line class="map-midline" x1="${cx}" y1="0" x2="${cx}" y2="${SIZE}"/>`
        + hives + `<text class="map-note" x="${cx}" y="${SIZE + 17}">Audience</text>${bots}</svg>`;
      const show = () => drawing.querySelectorAll('.map-bot').forEach((g) => g.classList.toggle('picked', g.dataset.value === current));
      drawing.addEventListener('click', (e) => {
        const bot = e.target.closest('.map-bot');
        if (bot) buttons.find((b) => b.dataset.value === bot.dataset.value)?.click();
      });
      buttons.forEach((b) => b.addEventListener('click', show));
      show();
    }
    return h('div', { class: 'field' }, labelBlock(field, labelId), drawing,
      h('div', { class: 'position-grid', role: 'group', 'aria-labelledby': labelId }, rows));
  },

  // A scale as buttons, with words if the config gives them (Weak … Great).
  rating(field, value, onChange) {
    const labelId = nextId();
    const options = [];
    for (let n = field.min; n <= field.max; n++) {
      options.push({ value: n, label: field.labels?.[n - field.min] ?? String(n) });
    }
    return answerable(field, value, onChange, options, labelId);
  },

  // Numbers (match, team) open the number pad, not the full keyboard.
  number(field, value, onChange) {
    return textInput(field, value, onChange, {
      inputmode: 'numeric', pattern: '[0-9]*', class: 'input num-input', enterkeyhint: 'next',
    }, (v) => (v === '' ? null : Number(v)));
  },

  text(field, value, onChange) {
    return textInput(field, value, onChange, {
      class: 'input', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next',
    }, (v) => v.trim());
  },

  // The only field meant for the keyboard.
  notes(field, value, onChange) {
    const id = nextId();
    const area = h('textarea', { id, class: 'input', rows: 4, placeholder: 'Anything the numbers miss' });
    area.value = value ?? '';
    area.addEventListener('input', () => onChange(area.value));
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, field.label), area);
  },
};

// A choice or scale, with a "Not answered yet" line until something is picked.
function answerable(field, value, onChange, options, labelId = nextId()) {
  const state = h('span', { class: 'answer-state', 'data-answered': String(value !== undefined && value !== null) }, 'Not answered yet');
  const seg = segmented(options, value, labelId, (v) => {
    state.dataset.answered = String(v !== null && v !== undefined);
    onChange(v);
  });
  seg.classList.add('wide');
  const label = labelBlock(field, labelId);
  label.append(state);
  return h('div', { class: 'field' }, label, seg);
}

function textInput(field, value, onChange, attrs, parse) {
  const id = nextId();
  const input = h('input', { id, type: 'text', ...attrs });
  input.value = value ?? '';
  // Keep only digits for number fields, even if pasted.
  input.addEventListener('input', () => {
    if (attrs.inputmode === 'numeric') input.value = input.value.replace(/\D/g, '').slice(0, 6);
    onChange(parse(input.value));
  });
  // Number fields are short, so two sit side by side unless "width": "full".
  const cls = attrs.inputmode === 'numeric' && field.width !== 'full' ? 'field half' : 'field';
  return h('div', { class: cls }, h('label', { class: 'field-label', for: id }, field.label), input);
}

// A row of buttons where one is selected. Each is a toggle button
// (aria-pressed), so screen readers say "Yes, pressed".
// Tapping the selected option again clears it, so a mis-tap can be undone.
function segmented(options, value, labelId, onChange) {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-labelledby': labelId });
  let current = value;

  const buttons = options.map((opt) => {
    const btn = h('button', {
      type: 'button',
      'aria-pressed': String(opt.value === current),
      'data-color': opt.color, // e.g. a yellow card shows in yellow
    }, opt.label);
    btn.addEventListener('click', () => {
      current = current === opt.value ? null : opt.value;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === current)));
      buzz();
      onChange(current);
    });
    return btn;
  });

  group.append(...buttons);
  return group;
}
