// Service worker: the part that makes the app open with no internet.
//
// A service worker is a script the browser runs separately from the page. It
// sits between the app and the network: every file request goes through the
// "fetch" handler below, which can answer from a local cache instead.
//
// 1. install  – on the first visit, download every app file into a cache.
// 2. activate – delete caches from older versions of the app.
// 3. fetch    – answer requests from the cache first; only use the network
//               for something not cached.
//
// To ship an update: change files, then bump VERSION. Phones download the new
// files next time they are online, and use them from the next launch.

const VERSION = 'v28';
const CACHE = `offline-scout-${VERSION}`;

// Every file the app needs. Paths are relative to this file, so the app works
// at any address (e.g. github.io/offline-scout/). If you add a file, add it here.
const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'fonts/archivo-latin.woff2',
  'js/app.js',
  'js/supabase.js',
  'js/account.js',
  'js/group-rules.js',
  'js/now-scouting.js',
  'js/sync.js',
  'js/sync-rules.js',
  'js/events.js',
  'js/schedule.js',
  'js/assignments.js',
  'js/team-stats.js',
  'js/custom.js',
  'js/custom-rules.js',
  'js/data-checks.js',
  'js/announcements.js',
  'js/announcement-rules.js',
  'vendor/supabase-2.117.2.js',
  'js/ui.js',
  'js/db.js',
  'js/config.js',
  'js/scoring.js',
  'js/submissions.js',
  'js/fields.js',
  'js/screens/home.js',
  'js/screens/match.js',
  'js/screens/saved.js',
  'js/screens/settings.js',
  'js/screens/auth.js',
  'js/screens/groups.js',
  'js/screens/group.js',
  'js/screens/event.js',
  'js/screens/assign.js',
  'js/screens/teams.js',
  'js/screens/questions.js',
  'js/screens/checks.js',
  'js/screens/announce.js',
  'configs/index.json',
  'configs/ftc-2026-biobuzz.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's normal HTTP cache, so we store fresh files.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('offline-scout-') && key !== CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Opening the app (any page navigation) always gets the cached index.html,
  // so it starts even in airplane mode.
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((cached) => cached || fetch(request)));
    return;
  }

  // Calls to Supabase (sign-in, the database) always go to the network:
  // caching them would show stale or someone else's data.
  if (new URL(request.url).origin !== self.location.origin) return;

  // Everything else: cache first, network as a fallback.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
