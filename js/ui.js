// Small helpers shared by every screen: building elements and drawing icons.

// h('button', { class: 'pill', onclick: fn }, 'Save') → <button class="pill">Save</button>
// A tiny stand-in for a framework: attributes starting with "on" become event
// listeners, everything else becomes an HTML attribute. Children can be
// strings, elements, arrays, or null/false (skipped).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith('on')) el.addEventListener(name.slice(2), value);
    else if (name === 'html') el.innerHTML = value; // only ever used for our own icon SVGs
    else el.setAttribute(name, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Icons are drawn as inline SVG (no emoji or icon fonts), all with the same
// 24px grid and 2.5px round stroke so they look like one set.
const PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  device: '<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M10.5 17.5h3"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
};

export function icon(name, size = 24) {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return span.firstElementChild;
}

// The "Saved on this device" line. Never mentions the internet, because the
// app never needs it.
export function savedStatus(text = 'Saved on this device') {
  return h('p', { class: 'status', role: 'status' }, icon('device', 18), h('span', {}, text));
}

// A short buzz on Android phones when a button is tapped. iPhones ignore it.
export function buzz() {
  navigator.vibrate?.(8);
}

// Asks a yes/no question in a native <dialog>. Resolves true if confirmed.
export function confirmDialog({ title, body, confirmLabel }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title' }, title),
      h('p', {}, body),
      h('div', { class: 'actions' },
        h('button', { class: 'pill danger block', onclick: () => close(true) }, confirmLabel),
        h('button', { class: 'pill secondary block', autofocus: true, onclick: () => close(false) }, 'Cancel'),
      ),
    );
    function close(result) {
      dialog.close();
      dialog.remove();
      resolve(result);
    }
    dialog.addEventListener('cancel', () => close(false)); // Escape / back gesture
    document.body.append(dialog);
    dialog.showModal();
  });
}

// The colour of the phone's status bar (Android, installed iOS app).
// null = the page background colour.
export function setThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  const fallback = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  meta?.setAttribute('content', color || fallback);
}

// "system" follows the phone's light/dark setting; "light"/"dark" force one.
export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  setThemeColor(null);
}

// ---------- forms (sign in, create group, invite) ----------

let formUid = 0;

// A labelled input with room for an error message. Returns { el, input, setError }.
// attrs go on the <input> (type, autocomplete, inputmode...).
export function formField(label, attrs = {}, hint = null) {
  const id = `ff${++formUid}`;
  const errorId = `${id}-err`;
  const input = h('input', { id, class: 'input', 'aria-describedby': errorId, ...attrs });
  const error = h('p', { id: errorId, class: 'error-text', hidden: true });
  const el = h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    hint && h('p', { class: 'field-hint' }, hint),
    input, error);
  function setError(message) {
    // The first field with a problem gets focus, so it's easy to fix.
    if (message && !document.querySelector('.field.invalid')) queueMicrotask(() => input.focus());
    el.classList.toggle('invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message ?? '';
    error.hidden = !message;
  }
  input.addEventListener('input', () => setError(null));
  return { el, input, setError };
}

// A password field with a Show/Hide button (easier to type right on a phone).
export function passwordField(label, autocomplete) {
  const f = formField(label, { type: 'password', autocomplete, minlength: 8, autocapitalize: 'off', spellcheck: 'false' });
  const toggle = h('button', { type: 'button', class: 'reveal', 'aria-pressed': 'false' }, 'Show');
  toggle.addEventListener('click', () => {
    const show = f.input.type === 'password';
    f.input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  toggle.setAttribute('aria-label', 'Show password');
  const wrap = h('div', { class: 'input-wrap' });
  f.input.replaceWith(wrap);
  wrap.append(f.input, toggle);
  return f;
}

// A message box for a whole form ("Check your email", "No connection").
// kind: 'error' (announced right away) or 'info'.
export function formMessage() {
  const el = h('p', { class: 'form-message', hidden: true });
  function show(text, kind = 'info') {
    el.textContent = text ?? '';
    el.hidden = !text;
    el.dataset.kind = kind;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }
  return { el, show };
}

// Disables a button and swaps its text while something is saving.
export async function busy(button, text, task) {
  const before = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = text;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = before;
  }
}
