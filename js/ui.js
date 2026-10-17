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
