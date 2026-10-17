# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Static HTML/CSS/JavaScript, no framework, no build step. Installable PWA (manifest + service worker), data in IndexedDB. Hosted on GitHub Pages. (Decided by Dhir; see CLAUDE.md.)

## Users
- **Scouts (primary, Milestone 1):** high-school students on FIRST robotics teams, sitting in loud, bright gym bleachers. Phone or tablet in portrait, often one-handed, watching one robot for a 2.5-minute match while tapping. Attention is on the field, not the screen.
- **Lead scout / strategist (later):** sets up the event, assigns which robots each scout watches, collects everyone's data and builds the picklist.
- **Drive team (later):** glances at an opponent's numbers minutes before a match.

## Product Purpose
Scouting that always works, with zero internet. Built because the team's online form would not open on bad venue wifi at provincials and scouting data was lost when it mattered most. Success: every match gets scouted and saved on the device, no matter the network.

## Positioning
- **Speed in the stands:** fewer taps and less typing than any other scouting tool. A scout can record a whole match without looking away from the field for long.
- **Run by a scout lead:** the lead creates the scouting group and assigns robots/matches to each scout, so every scout knows exactly who to watch. (Planned. The assignments have to reach phones without internet, so delivery is undecided; QR is likely.)
- Offline-first is the baseline, not a feature.

## Operating Context
- FIRST Tech Challenge (FTC) and FIRST Robotics Competition (FRC) events: qualification matches every few minutes, gym lighting or sunlight on screens, crowd noise, unreliable or no wifi.
- One scout follows one robot per match. FTC alliances have 2 robots; FRC alliances have 3.
- Each season has a new game. Dhir adds each season's game config himself (JSON file, not code).

## Capabilities and Constraints
- Milestone 1: offline core + FTC BIOBUZZ match scouting (home, match scouting, saved matches, settings).
- Game fields, point values, and periods come from a config file per program/season; never hard-coded.
- Must work in airplane mode after the first load. Nothing may imply that internet is needed.
- Planned: QR transfer between devices; scout-lead assignments; FRC 2027 config; pit scouting; v2 public stats import (The Blue Alliance, FTCScout) and an AI-assisted picklist.
- Undecided: QR payload format, how the lead merges data, how assignments are delivered, pit vs match scouting layout.

## Brand Commitments
- Name: **Offline Scout**. Team-neutral: no team colours or logos, so other teams can adopt it.
- Game terms are written exactly as the game manual capitalises them (e.g. HIVE TIP, LEAVE, PARK).
- No emoji icons.

## Evidence on Hand
None yet: no usage data, testimonials, or event results. Do not invent any.

## Product Principles
1. Works with zero internet, always. Everything else is secondary.
2. Eyes on the field: big targets, almost no typing, every tap undoable.
3. Config, not code: a new game is a JSON file.
4. Simple enough that its author can explain every line in an interview.

## Accessibility & Inclusion
- Readable in bright light: high contrast (WCAG AA minimum, AAA for key numbers and labels). Light and dark themes.
- Touch targets at least 56px for in-match controls; usable one-handed in portrait.
- Never rely on colour alone (the alliance is also shown as text).
