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

## Not decided yet
- Exact data format for a scouting entry
- QR payload format and size limits (how many matches per code)
- How the lead scout merges data from many devices
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
