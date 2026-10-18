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
    const row = h('div', { class: 'field counter', role: 'group', 'aria-labelledby': labelId },
      labelBlock(field, labelId), minus, valueEl, plus);

    function set(next, flash) {
      count = Math.max(0, next);
      valueEl.textContent = count;
      minus.disabled = count === 0;
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
    return h('div', { class: 'field' }, labelBlock(field, labelId),
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
