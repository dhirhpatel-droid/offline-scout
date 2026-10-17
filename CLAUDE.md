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
- **Sync:** QR code export/import between devices.
- **Game configs:** one config per season/program. FRC alliances = 3 robots, FTC = 2.
- **Order:** FTC config first (FTC season is running now, so it can be tested at events
  this winter), FRC 2027 config after kickoff in January.

- **Data format:** decided in Milestone 1, see `docs/data-format.md`. Values keyed
  `section.field`; entries record `configId` + `configVersion`.
- **Hosting:** GitHub Pages from `main` (https://dhirhpatel-droid.github.io/offline-scout/).
  All paths are relative so it works in that sub-folder.
- **Look:** chosen with Dhir via the impeccable skill. Bold, Spotify-like: near-black (or
  white in light mode), the alliance colour fills the match header and the + buttons,
  huge condensed numbers (Archivo, self-hosted). One match period on screen at a time.
  Light theme for sunlight. Banned: purple gradients, card grids, emoji icons, centred
  heroes, spaced-out ALL-CAPS labels (Dhir: these "look AI").
- **Scout lead (planned):** the lead creates the scouting group and assigns robots/matches
  to each scout. Assignments must reach phones without internet (likely QR).

## Not decided yet
- QR payload format and size limits (how many matches per code)
- How the lead scout merges data from many devices
- How scout-lead assignments are delivered to phones
- UI layout for match scouting vs pit scouting

## Timeline
- Oct–Dec 2026: v1 — offline core, one FTC config, QR sync
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
- **Milestone 1 (done, Oct 2026):** offline core + FTC BIOBUZZ match scouting. Home, match
  scouting, saved matches (edit/delete), settings. PWA, IndexedDB, works in airplane mode.
- **Next:** QR export/import; scout-lead assignments; FRC 2027 config after kickoff.

## Commands
- `npm start`: local server at http://localhost:8000 (no browser caching)
- `npm test`: unit tests (scoring, config validation, entries)
- `npm run test:offline`: loads the app in headless Chrome, **stops the server**, scouts
  and saves a match, reloads, checks it's still there. Run it before every release.

## Project rules (for Claude and anyone else)
- Read `README.md` for the file map and `docs/data-format.md` for configs/entries.
- Game rules live in `configs/*.json`. Never hard-code a game's fields in JS or HTML.
- Every new file must be added to `APP_FILES` in `sw.js`, and `VERSION` bumped when
  shipping, or phones won't get it offline.
- Never show text that implies internet is needed. The status line says "Saved on this device".
- Colours and sizes only from `css/tokens.css`. Text contrast ≥ 4.5:1, control outlines
  ≥ 3:1, in-match targets ≥ 56px.
- Design decisions go through the impeccable skill (`PRODUCT.md`, `.impeccable/`, and
  `DESIGN.md` once written). ui-ux-pro-max is only for UX/accessibility checks.
- The in-app browser pane can't run service workers; test offline with `npm run test:offline`
  or on a real phone.

