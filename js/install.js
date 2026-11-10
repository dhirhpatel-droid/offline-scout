// Installing Offline Scout from the website (free, no app store): it gets its
// own home-screen icon, opens full screen and works offline.
//
//   Android (Chrome): the browser offers an install window. It arrives as a
//   "beforeinstallprompt" event, which is kept here so a button can open it.
//   iPhone (Safari): no install window exists; people tap Share, then Add to
//   Home Screen, so the steps say exactly that.
//   A computer: the steps for both phones (scouting happens on a phone).
//   Already installed: nothing to show.
//
// On iPhone the installed app keeps its own storage, apart from Safari, so the
// sign-in screen says: install first, then sign in inside the app.

import { h, icon } from './ui.js';
import { getSetting, setSetting } from './db.js';

let promptEvent = null;

// Called once at start-up (app.js), before the browser fires the event.
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show it from our own button instead of a browser bar
    promptEvent = e;
    window.dispatchEvent(new Event('scout-installable'));
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    document.querySelectorAll('.install-tip').forEach((el) => el.remove());
  });
}

// Opened from the home-screen icon (not a browser tab)?
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches
  || navigator.standalone === true; // iPhone

const ua = () => navigator.userAgent;
const isIphone = () => /iphone|ipad|ipod/i.test(ua())
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad asking for the desktop site
const isAndroid = () => /android/i.test(ua());

const step = (...words) => h('li', {}, h('span', {}, ...words));
const IPHONE_STEPS = () => [
  step('Tap ', h('span', { class: 'install-glyph' }, icon('share', 18), 'Share'), ' at the bottom of Safari'),
  step('Scroll down, tap ', h('strong', {}, 'Add to Home Screen'), ', then ', h('strong', {}, 'Add')),
  step('Open ', h('strong', {}, 'Offline Scout'), ' from your home screen and sign in there'),
];
const ANDROID_STEPS = () => [
  step('Tap ', h('span', { class: 'install-glyph' }, icon('more', 18), 'menu'), ' at the top right of Chrome'),
  step('Tap ', h('strong', {}, 'Install app'), ' (or ', h('strong', {}, 'Add to Home screen'), ')'),
  step('Open ', h('strong', {}, 'Offline Scout'), ' from your home screen and sign in there'),
];

// The tip, or null when there's nothing to say.
//   first: the big version at the top of the sign-in screen
//   dismissible: shows "Not now" (Home), remembered on this phone
export async function installTip({ first = false, dismissible = false } = {}) {
  if (isInstalled()) return null;
  if (dismissible && await getSetting('installTipHidden')) return null;

  const body = h('div', { class: 'install-body' });
  const tip = h('section', { class: `install-tip${first ? ' first' : ''}`, 'aria-labelledby': 'install-h' },
    first
      ? h('h2', { class: 'section-h', id: 'install-h' }, 'Get the app first')
      : h('h2', { id: 'install-h' }, icon('install', 22), 'Install Offline Scout'),
    body);
  const lede = first
    ? 'Free, no app store. It goes on your home screen and works with no signal.'
    : 'Free, no app store. Its own icon, full screen, and it works with no signal.';
  const notNow = () => (dismissible ? h('button', { class: 'link-btn', type: 'button', onclick: async () => {
    await setSetting('installTipHidden', true);
    tip.remove();
  } }, 'Not now') : null);
  const steps = (list) => h('ol', { class: 'install-steps' }, list);

  const draw = () => {
    if (promptEvent) {
      // Android Chrome can install with one tap.
      const btn = h('button', { class: `pill${first ? ' big block' : ''}`, type: 'button' }, icon('install', 22), 'Install the app');
      btn.addEventListener('click', async () => {
        const event = promptEvent;
        promptEvent = null;
        event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === 'accepted') tip.remove();
        else draw(); // they said no: the steps still work
      });
      body.replaceChildren(h('p', { class: 'install-lede' }, lede), h('div', { class: 'install-actions' }, btn, notNow()));
    } else if (isIphone()) {
      body.replaceChildren(h('p', { class: 'install-lede' }, lede), steps(IPHONE_STEPS()), h('div', { class: 'install-actions' }, notNow()));
    } else if (isAndroid()) {
      body.replaceChildren(h('p', { class: 'install-lede' }, lede), steps(ANDROID_STEPS()), h('div', { class: 'install-actions' }, notNow()));
    } else {
      // A computer: scouting happens on phones, so both sets of steps.
      body.replaceChildren(
        h('p', { class: 'install-lede' }, `${lede} Open this page on your phone, then:`),
        h('div', { class: 'install-both' },
          h('div', {}, h('h3', {}, 'iPhone (Safari)'), steps(IPHONE_STEPS())),
          h('div', {}, h('h3', {}, 'Android (Chrome)'), steps(ANDROID_STEPS()))),
        h('div', { class: 'install-actions' }, notNow()));
    }
  };

  draw();
  // Chrome may decide the app is installable a moment after the screen draws.
  window.addEventListener('scout-installable', draw, { once: true });
  return tip;
}
