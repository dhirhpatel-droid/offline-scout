// App start-up: theme, service worker, sign-in check, and a tiny router.
//
// Routing uses the part of the URL after "#":
//   #home  #match  #match/<id>  #saved  #settings
//   #auth/...  #groups  #groups/new  #group
// Hash routing needs no server setup, so it works on GitHub Pages and offline.

import { getSetting, setSetting, requestPersistentStorage } from './db.js';
import { setThemeColor, applyTheme } from './ui.js';
import { sb } from './supabase.js';
import { currentUser, currentGroup, refreshAccount } from './account.js';
import { startAutoSync } from './sync.js';
import { renderHome } from './screens/home.js';
import { renderMatch } from './screens/match.js';
import { renderSaved } from './screens/saved.js';
import { renderSettings } from './screens/settings.js';
import { renderAuth } from './screens/auth.js';
import { renderGroups } from './screens/groups.js';
import { renderGroup } from './screens/group.js';
import { renderEvent } from './screens/event.js';

const root = document.getElementById('app');

const routes = {
  home: renderHome,
  match: renderMatch,
  saved: renderSaved,
  settings: renderSettings,
  auth: renderAuth,
  groups: renderGroups,
  group: renderGroup,
  event: renderEvent,
};

// Screens you can use without a Scouting group.
const NO_GROUP_NEEDED = ['auth', 'groups', 'group', 'settings'];

let cleanup = null;

async function route() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');

  // You must be signed in to use the app (docs/adr/0002). Signing in needs
  // signal once; after that the saved session works offline.
  const user = await currentUser();
  if (!user && name !== 'auth') return redirect('#auth');
  if (user && name === 'auth' && !['password', 'welcome'].includes(param)) return redirect('#home');
  // Scouting needs a group to scout for.
  if (user && !NO_GROUP_NEEDED.includes(name) && !(await currentGroup())) return redirect('#groups');

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

function redirect(hash) {
  // replace() so the back button doesn't bounce between screens.
  location.replace(hash);
}

// Email links (confirm email, invite, password reset) come back to the app
// with details after the #. index.html reads what kind of link it was before
// supabase-js tidies the address; here we send the person to the right place.
async function finishEmailLink() {
  const link = window.__authLink;
  if (!link) return null;
  await sb.auth.getSession(); // waits until supabase-js has finished signing in from the link
  if (link.error) {
    await setSetting('authNote', {
      kind: 'error',
      text: /expired|invalid/i.test(link.error)
        ? 'That email link has expired or was already used. Sign in, or ask for a new link.'
        : link.error,
    });
    return '#auth';
  }
  await refreshAccount();
  if (link.type === 'recovery') return '#auth/password';
  if (link.type === 'invite') return '#auth/welcome';
  return '#groups'; // email confirmed: join or create a group
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

applyTheme((await getSetting('theme')) ?? 'system');
const landing = await finishEmailLink();
if (landing) history.replaceState(null, '', landing);
window.addEventListener('hashchange', route);
route();
registerServiceWorker();
requestPersistentStorage();
startAutoSync(); // send and receive Submissions whenever there's signal

// When a sync brings in or sends something, redraw lists that show it.
window.addEventListener('scout-sync', (e) => {
  const { sent, received } = e.detail;
  const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  const realFailure = e.detail.error && !['offline', 'signed-out'].includes(e.detail.error);
  if ((sent || received || realFailure) && ['home', 'saved'].includes(name)) route();
});
window.addEventListener('online', () => {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  if (['home', 'saved', 'group'].includes(name)) route();
});
