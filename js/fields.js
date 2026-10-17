// Builds one input widget from one field in the game config.
// This is why no scouting field is written into the HTML: the config says
// { "type": "counter", "label": "HIVE TIPs", "points": 20 } and this file
// turns it into a −/+ counter row.
//
// renderField(field, value, onChange) returns an element.
// onChange(newValue) is called on every tap so the match screen can autosave.

import { h, icon, buzz } from './ui.js';

let uid = 0;
const nextId = () => `f${++uid}`;

export function renderField(field, value, onChange) {
  const render = RENDERERS[field.type];
  if (!render) throw new Error(`No widget for field type "${field.type}"`);
  const el = render(field, value, onChange);
  el.dataset.fieldId = field.id;
  return el;
}

function pointsHint(field) {
  if (!field.points) return field.hint ?? null;
  const unit = field.points === 1 ? 'pt' : 'pts';
  const pts = field.type === 'counter' ? `${field.points} ${unit} each` : `${field.points} ${unit}`;
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

  // Yes / No as two big buttons (easier to hit than a small switch).
  toggle(field, value, onChange) {
    const labelId = nextId();
    const seg = segmented(
      [{ value: false, label: 'No' }, { value: true, label: 'Yes' }],
      value === true, labelId, onChange,
    );
    return h('div', { class: 'field toggle-row' }, labelBlock(field, labelId), seg);
  },

  // One of several options, e.g. Defense: None / Some / Heavy.
  choice(field, value, onChange) {
    const labelId = nextId();
    const seg = segmented(field.options, value, labelId, onChange, field.role === 'alliance');
    seg.classList.add('wide');
    return h('div', { class: 'field' }, labelBlock(field, labelId), seg);
  },

  // 1–5 as five buttons.
  rating(field, value, onChange) {
    const labelId = nextId();
    const options = [];
    for (let n = field.min; n <= field.max; n++) options.push({ value: n, label: String(n) });
    const seg = segmented(options, value, labelId, onChange);
    seg.classList.add('wide');
    return h('div', { class: 'field' }, labelBlock(field, labelId), seg);
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

function textInput(field, value, onChange, attrs, parse) {
  const id = nextId();
  const input = h('input', { id, type: 'text', ...attrs });
  input.value = value ?? '';
  // Keep only digits for number fields, even if pasted.
  input.addEventListener('input', () => {
    if (attrs.inputmode === 'numeric') input.value = input.value.replace(/\D/g, '').slice(0, 6);
    onChange(parse(input.value));
  });
  // Number fields are short, so two sit side by side (match + team).
  const cls = attrs.inputmode === 'numeric' ? 'field half' : 'field';
  return h('div', { class: cls }, h('label', { class: 'field-label', for: id }, field.label), input);
}

// A row of buttons where one is selected. Each is a toggle button
// (aria-pressed), so screen readers say "Yes, pressed".
// Tapping the selected option again clears it, so a mis-tap can be undone.
function segmented(options, value, labelId, onChange, colored = false) {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-labelledby': labelId });
  let current = value;

  const buttons = options.map((opt) => {
    const btn = h('button', {
      type: 'button',
      'aria-pressed': String(opt.value === current),
      'data-color': colored ? opt.value : null,
      'data-off': opt.value === false,
    }, opt.label);
    btn.addEventListener('click', () => {
      // Yes/No toggles never go back to "unset"; other choices can be cleared.
      const isToggle = typeof opt.value === 'boolean';
      current = !isToggle && current === opt.value ? null : opt.value;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === current)));
      buzz();
      onChange(current);
    });
    return btn;
  });

  group.append(...buttons);
  return group;
}
