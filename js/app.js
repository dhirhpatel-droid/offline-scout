// App start-up: theme, service worker, and a tiny router.
//
// Routing uses the part of the URL after "#":
//   #home  #match  #match/<id>  #saved  #settings
// Hash routing needs no server setup, so it works on GitHub Pages and offline.

import { getSetting, requestPersistentStorage } from './db.js';
import { setThemeColor, applyTheme } from './ui.js';
import { renderHome } from './screens/home.js';
import { renderMatch } from './screens/match.js';
import { renderSaved } from './screens/saved.js';
import { renderSettings } from './screens/settings.js';

const root = document.getElementById('app');

const routes = {
  home: renderHome,
  match: renderMatch,
  saved: renderSaved,
  settings: renderSettings,
};

let cleanup = null;

async function route() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  const render = routes[name] ?? routes.home;

  cleanup?.();
  cleanup = null;
  setThemeColor(null);

  try {
    const view = await render({ param });
    root.replaceChildren(view.el);
    cleanup = view.cleanup ?? null;
    window.scrollTo(0, 0);
    // Move focus to the new screen's heading for screen-reader users.
    root.querySelector('h1')?.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    root.textContent = `Something went wrong: ${err.message}`;
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // "./sw.js" (not "/sw.js") so it also works in a sub-folder like
    // dhirhpatel-droid.github.io/offline-scout/
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.warn('Service worker not registered:', err);
  }
}

window.addEventListener('hashchange', route);
applyTheme((await getSetting('theme')) ?? 'system');
route();
registerServiceWorker();
requestPersistentStorage();
