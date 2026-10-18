# Offline Scout

Scouting for FIRST robotics that **works with zero internet**. Install it once, then scout
in airplane mode. Every tap is saved on the phone straight away.

Milestone 1: FTC **BIOBUZZ** (2026–27) match scouting. FRC comes next season. Games are
JSON config files, not code.

**Live app:** https://dhirhpatel-droid.github.io/offline-scout/

## Using it

1. Open the link once with internet, then **Add to Home Screen** (Safari: Share → Add to
   Home Screen; Chrome: ⋮ → Install app / Add to Home screen).
2. Open it from the home screen from then on, with or without internet.
3. Home → set the event and your name once → **Scout a match**.
4. Pre: match #, team #, alliance. Then Auto → Teleop → End → Post with the big buttons.
   Minus is undo. **Save match**, then **Scout match N+1** in one tap.

> On iPhone, the home-screen app and the Safari tab keep **separate** storage. Pick one
> (the home-screen app) and always use it.

## Running it on a computer

No install, no build step. You need Python 3 (already on Macs).

```bash
npm start            # = python3 scripts/serve.py → http://localhost:8000
npm test             # unit tests + database rule tests
npm run test:offline # real offline test in headless Chrome
```

## How it fits together

```
index.html               the one page; js/app.js draws every screen into it
manifest.webmanifest     makes it installable (name, icons, colours, portrait)
sw.js                    service worker: caches every file → works offline
css/tokens.css           all colours, sizes, fonts (dark + light themes)
css/app.css              layout and components
fonts/                   Archivo, self-hosted so it works offline (OFL licence)
js/app.js                start-up: theme, service worker, sign-in check, #hash router
js/supabase.js           the connection to Supabase (URL + publishable key only)
js/account.js            sign in/up, Scouting groups, members, invites (+ phone copy)
js/group-rules.js        checks for forms and roles (no network, tested)
js/sync.js               sends and downloads Submissions when there's signal
js/sync-rules.js         the sync rules: newer edit wins, deletes, claiming (tested)
js/now-scouting.js       "what am I scouting?" for Home and the unfinished-match bar
js/db.js                 IndexedDB: Submissions, the Draft, settings (+ upgrades)
js/config.js             loads + validates game configs, finds fields by role
js/scoring.js            estimated points from a config + values (pure function)
js/submissions.js        Submissions: creating, summaries, next match, Alliance positions
js/fields.js             turns a config field into a widget (counter, Yes/No…)
js/ui.js                 small helpers: h() element builder, icons, dialog
js/screens/*.js          home, match, saved, settings, auth, groups, group
vendor/                  supabase-js, kept in the repo so it works offline
supabase/migrations/     database tables and security rules (SQL)
supabase/functions/      server code that needs secret keys (sending invites)
configs/                 one JSON per game + index.json listing them
tests/                   node --test unit tests
scripts/                 dev server, offline test, icon generator
docs/data-format.md      Game config and Submission formats
docs/roadmap.md          milestones and database tables
docs/adr/                why the big decisions were made
GLOSSARY.md              the words the app uses
```

**Why no framework?** The app is small, it must load offline from a cache, and every
line should be explainable. A 20-line `h()` helper (`js/ui.js`) does the job a framework
would.

**Why a service worker?** A normal web page asks the server for its files every time; with
no internet that fails. `sw.js` saves every file on the first visit and answers from that
copy afterwards.

**Why IndexedDB?** It holds real objects and far more than `localStorage`, and it's what
installed web apps are meant to use. The match in progress is a *Draft* saved on every
tap, so a dead battery or closed tab loses nothing.

## Shipping an update

Change files → bump `VERSION` in `sw.js` → commit and push. Phones pick up the new
version next time they open the app with internet, and use it from the launch after.
If you add a file, add it to `APP_FILES` in `sw.js` too.

## Adding a game

See [docs/data-format.md](docs/data-format.md).
