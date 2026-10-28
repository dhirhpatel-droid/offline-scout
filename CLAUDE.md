# Offline Scout

Read this first. It is the shared context for every Claude session on this project
(Claude Code app, terminal, claude.ai). Keep it up to date: when a decision changes,
edit this file and commit it.

## What this is
An **offline-first scouting app for FIRST robotics** that works for both **FRC and FTC**.
Built by Dhir Patel (Grade 11, Lo-Ellen Park, FRC team 4069) as a portfolio project
for university engineering applications (Waterloo, McMaster, U of T).

## The problem it solves
Our team scouted with an online form. At provincials the venue wifi was bad and the
form would not even open, so we lost scouting data when we needed it most.
**The app must work with zero internet, always.** Every other feature is secondary.

## Goals
1. Works fully offline (airplane mode) on phones and tablets in the stands.
2. Same app for FRC and FTC. Scouting fields are **config, not code**, so a new
   season's game is added by editing a config file, not rewriting the app.
3. Data moves between devices without internet (QR codes).
4. Other teams can adopt it (open source on GitHub, clear docs).
5. Later (v2): import public match stats (The Blue Alliance for FRC, FTCScout for FTC)
   and an AI-assisted picklist.

## Decisions so far
- **Platform:** installable web app (PWA): HTML/CSS/JavaScript. Dhir already knows web dev.
- **Offline:** service worker caches the app; scouting data stored on-device (IndexedDB).
- **Sync:** through **Supabase** whenever there is signal (normally before entering and
  after leaving the gym). The phone keeps the main copy. QR backup is a later, optional
  Group setting (docs/adr/0001).
- **Accounts:** email + password (Supabase Auth), required to scout. Leads invite by email;
  no join codes (docs/adr/0002).
- **Event data:** fetched by a Supabase server function, never from the app directly,
  because the official FIRST APIs need secret keys (docs/adr/0003).
- **Vocabulary:** GLOSSARY.md is the source of truth for words (Team, Scouting group,
  Lead, Scout, Submission, Assignment...). Use those words in code, UI and docs.
- **Game configs:** one config per season/program. FRC alliances = 3 robots, FTC = 2.
- **Order:** FTC config first (FTC season is running now, so it can be tested at events
  this winter), FRC 2027 config after kickoff in January.

- **Data format:** see `docs/data-format.md`. Values keyed `section.field`; Submissions
  record `configId` + `configVersion`, have UUIDs, and carry a `syncedAt` marker.
  Bump `DB_VERSION` in `js/db.js` (with an upgrade step) whenever stored data changes shape.
- **Hosting:** GitHub Pages from `main` (https://dhirhpatel-droid.github.io/offline-scout/).
  All paths are relative so it works in that sub-folder.
- **Look:** chosen with Dhir via the impeccable skill. Bold, Spotify-like: near-black (or
  white in light mode), the alliance colour fills the match header and the + buttons,
  huge condensed numbers (Archivo, self-hosted). One match period on screen at a time.
  Light theme for sunlight. Banned: purple gradients, card grids, emoji icons, centred
  heroes, spaced-out ALL-CAPS labels (Dhir: these "look AI").
- **Lead planning:** Leads assign by Position shift or Team watch; the app shows Coverage
  but never assigns by itself, and shows only scheduled times (no running-late estimate
  unless a Group setting turns it on).

## Not decided yet
- Pit scouting layout (later)
- Which FRC data source to use for FRC 2027 (official FRC Events API or The Blue Alliance).
  FTC uses FTCScout (no key) through `supabase/functions/event-data`.

## Timeline
- Oct–Dec 2026: v1 — offline core, one FTC config, accounts + groups + sync, events and assignments
- Winter 2026–27: test at FTC events
- Jan 2027: add FRC 2027 config after kickoff
- Feb–Apr 2027: use at FRC events, fix what breaks
- Summer 2027: polish, docs, share with other teams
- Fall 2027: other teams using it; university applications

## How to work with Dhir (important)
- This is **Dhir's project and he must understand all of it.** He'll be asked about it
  in university interviews. Explain *why* for every non-obvious choice, keep code simple
  and readable, and prefer teaching over doing everything in one go.
- Keep dependencies minimal. No framework unless there's a clear reason.
- Small commits with clear messages.
- Test the offline behaviour for real: load the app, go offline, enter data, reload,
  confirm the data is still there.

## Status
- **Milestone 1 (done, Oct 2026):** offline core + FTC BIOBUZZ match scouting on one phone.
  Live at https://dhirhpatel-droid.github.io/offline-scout/
- **Product vision agreed (Oct 17, 2026):** a Lead-planned scouting system with email
  accounts, Scouting groups, Events from FIRST, Assignments, sync through Supabase, Lead
  views, Data checks, Custom questions and Group settings. See PRODUCT.md, GLOSSARY.md,
  docs/adr/ and **docs/roadmap.md** (milestone order and database tables).
- **Milestone 1.5 (done, Oct 17, 2026):** groundwork. Code and phone storage now match
  GLOSSARY.md (Submissions with UUIDs, Alliance position, Match level, sync marker);
  Milestone 1 data upgrades on the phone.
- **Milestone 2 (done Oct 18, 2026; tested by Dhir with real accounts):** email
  accounts, Scouting groups, email Invites, roles. Database in `supabase/migrations/`
  (applied), invite emails via `supabase/functions/send-invite` (deployed).
- **Redesign (Oct 18):** every screen reworked after impeccable critiques (24 → 27/40 on
  two-reviewer rounds). Home is "Now scouting"; 4 match tabs; tap tiles; see DESIGN.md.
- **Milestone 3 (built Oct 19, 2026):** sync. `submissions` table + rules
  (migration applied), `js/sync.js` + `js/sync-rules.js`, Mine/Everyone, Group settings.
  Tested by Dhir on two phones with real accounts (Oct 19): send, Everyone view, offline edit.
- **Milestone 4 (built Oct 20, 2026):** Events from FIRST via FTCScout (`event-data`
  server function, deployed; `events`/`event_teams`/`event_matches`/`group_events`,
  migration applied). Teams fill in from the schedule; Home shows the next team.
  Not yet tested by Dhir with a real event pick.
- **Milestone 5 (built Oct 19, 2026):** Assignments. `position_shifts`/`team_watches`
  (migration applied, Leads-only writes); `js/assignments.js` works Assignments out on the
  phone from the plan + schedule (nothing about Assignments is stored). Home shows "your
  next assignment" + Coming up; Leads plan on #assign (with Coverage gaps); two Teams in
  one match = two Drafts ('current'/'second') with a switch. Critique 27/26 → findings fixed.
  Not yet tested by Dhir on two phones.
- **"Like the event itself" redesign (Oct 19, 2026, Dhir's pick):** bumper team numbers,
  station signs, printed per-station schedule, field-clock period times, results-table
  finish (DESIGN.md "Event pieces"). Whole-app critique 28–29 → 29–30.
- **Milestone 6 (built Oct 19, 2026):** Lead views, all on the phone (no database change):
  #teams (All Teams table: Scouted = Coverage, averages per scoring period, tap a heading to
  sort; starting sort is Group setting `teamsSort`) and #team/<n> (averages, every config
  field summed up by `fieldSummary`, its matches, its Submissions). `js/team-stats.js`.
  Endgame got its own tab (config v4). Assignments: Undo after Add/Remove, tap an Open
  station to fill it.
- **Milestone 7 (built Oct 19, 2026):** Custom questions (`custom_questions` table, migration
  applied; answers stored in values as `<section>.custom-<id>`, so they never score;
  `js/custom-rules.js` + `js/custom.js`, editor at #questions). Data checks
  (`js/data-checks.js`: scouts disagree, alliance total far from official score, values that
  don't fit the schedule; Group setting `checkSensitivity`; #checks, Home row, Team pages).
- **Tested by Dhir on two phones with real accounts (Oct 20, 2026):** Milestones 4–7 all work
  (event pick, Assignments, Teams, Custom questions, Data checks, offline scouting).
  For that test "Confirm email" was turned OFF in Supabase Auth (built-in email only reaches
  the project team). Turn it back ON once custom SMTP is set up (Resend needs a verified
  domain; Gmail app password is the no-domain option). Not decided yet.
- **Announcements (built Oct 22, 2026):** Leads post short messages (≤280 chars) to the
  group (`announcements` table, migration applied); phones download them with sync
  (`js/announcements.js`, screen `js/screens/announce.js`, rules in `js/announcement-rules.js`); the newest unread shows
  under Home's cover; full list + compose at #announcements.
- **QR backup (built Oct 22, 2026):** Group setting `qrBackup` (off by default). Scouts show
  unsent matches as QR codes (#qr, from My matches); Leads scan them (#scan, Home row).
  Payload `OS1:` + answers in config order (docs/adr/0004, `js/qr-rules.js`); libraries
  vendored (`vendor/qrcode-generator-2.0.4.mjs`, `vendor/jsqr-1.4.0.js`). A Lead may upload a
  member's Submission (migration `*_qr_backup.sql`, `added_by` column). Camera not tested
  on a real phone yet.
- **Next:** email sending (above), then a real event; later items in docs/roadmap.md. Re-run the impeccable
  critique (two isolated reviewers) after every milestone.

## Commands
- `npm start`: local server at http://localhost:8000 (no browser caching)
- `npm test`: unit tests (scoring, config validation, Submissions)
- `npx supabase db push`: apply new migrations to the real database (dry run first with
  `--dry-run`). `npx supabase functions deploy <name> --use-api`: deploy a server function.
- Database rules are tested in `tests/database.test.js` (PGlite, no real data touched).
- `npm run test:offline`: loads the app in headless Chrome, **stops the server**, scouts
  and saves a match, reloads, checks it's still there. Run it before every release.

## Project rules (for Claude and anyone else)
- Read `README.md` for the file map and `docs/data-format.md` for Game configs and Submissions, and `GLOSSARY.md` for words.
- Game rules live in `configs/*.json`. Never hard-code a game's fields in JS or HTML.
- Every new file must be added to `APP_FILES` in `sw.js`, and `VERSION` bumped when
  shipping, or phones won't get it offline.
- Never show text that implies internet is needed. The status line says "Saved on this phone".
- Colours and sizes only from `css/tokens.css`. Text contrast ≥ 4.5:1, control outlines
  ≥ 3:1, in-match targets ≥ 56px.
- **Every UI change goes through the impeccable skill** (`PRODUCT.md`, `DESIGN.md`,
  `.impeccable/`) and is checked with **ui-ux-pro-max** for UX/accessibility before it
  ships. ui-ux-pro-max never picks the visual style.
- Never put secret keys (Supabase secret/service_role key, FIRST API keys) in the app or
  the repo. Only the Supabase URL and publishable key go in the app.
- Database changes are SQL migration files in `supabase/migrations/`, applied with
  `npx supabase db push`. Every table has Row Level Security.
- New tables are NOT exposed automatically: grant table permissions explicitly, to
  `authenticated` for what phones do and to `service_role` for what server functions
  write (service_role skips RLS but still needs grants).
- Claude can't create real accounts on the live Supabase project; real sign-up/invite
  testing is done by Dhir. The offline test uses a pretend saved login.
- The in-app browser pane can't run service workers; test offline with `npm run test:offline`
  or on a real phone.

