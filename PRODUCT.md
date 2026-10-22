# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Static HTML/CSS/JavaScript, no framework, no build step. Installable PWA (manifest + service worker); the phone keeps its own copy of everything in IndexedDB. Supabase (Postgres + email auth) is the shared backend that phones sync with whenever they have signal. Hosted on GitHub Pages. (Decided by Dhir; see CLAUDE.md and docs/adr/.)

## Users
Words are defined in GLOSSARY.md.
- **Scouts:** high-school students on FIRST robotics teams, in loud, bright gym bleachers. Phone in portrait, often one-handed, watching one or two Teams per Match while tapping. Attention is on the field, not the screen. By default they see only their own Submissions.
- **Leads:** run the Scouting group: invite members by email, pick the Current event, make Assignments, add Custom questions, change Group settings, and read every Submission with Coverage and Data checks. A group can have several Leads; drive team members who need the data are made Leads (no separate strategist role).

## Product Purpose
A scouting system for FIRST teams (FTC and FRC): a Lead plans who watches which Teams, Scouts record Matches fast in the stands with or without signal, and the Lead gets clean, checked data to decide with. Built because the team's online form would not open on bad venue wifi at provincials and scouting data was lost when it mattered most. Success: every important Team gets watched, every Submission is saved on the phone and reaches the Lead, and the Lead trusts the numbers.

## Positioning
- **Planned by a Lead, not just a form:** the Lead loads the event from FIRST, assigns Position shifts or Team watches, and sees Coverage, so every Scout knows exactly who to watch and the Lead sees the gaps.
- **Data you can trust:** Data checks flag disagreeing Submissions, totals far from official scores, and impossible values.
- **Speed in the stands:** fewer taps and less typing than other scouting tools.
- **Fits each team:** Group settings and Custom questions let every group scout its own way.
- Offline-first is the baseline, not the pitch. Existing tools already do offline, QR and configurable forms.

## Operating Context
- FIRST Tech Challenge (FTC) and FIRST Robotics Competition (FRC) events: qualification matches every few minutes, gym lighting or sunlight on screens, crowd noise, unreliable or no wifi.
- There is usually phone signal before people enter the gym and after they leave; often none inside. Phones download the schedule and Assignments before going in and upload Submissions when they come out.
- FTC alliances have 2 robots; FRC alliances have 3. Small groups often have fewer Scouts than robots, so the Lead chooses what to cover.
- Each season has a new game. Dhir publishes each season's Game config (JSON file, not code).

## Capabilities and Constraints
- Done (Milestone 1): offline core + FTC BIOBUZZ match scouting on one phone.
- Next: email accounts and Scouting groups, sync through Supabase, Events from FIRST, Assignments, Lead views (All Teams, one Team, Coverage), Data checks, Custom questions, Group settings. Order in docs/roadmap.md.
- Game fields, point values and periods come from the Game config; Custom questions never add to Estimated points.
- Must work in airplane mode after one signed-in visit. Nothing may imply that internet is needed.
- The app shows only scheduled match times (a running-late estimate exists only as an optional Group setting, off by default).
- The app never makes decisions for the Lead: no automatic assignments, no recommended picks.
- Announcements (Leads post short messages to the group) were added Oct 22, 2026.
- Not now: pit scouting, join codes, sharing between groups, QR backup (a later, optional Group setting).
- Data is private to each Scouting group and belongs to the group, not the Scout.

## Brand Commitments
- Name: **Offline Scout**. Team-neutral: no team colours or logos, so other teams can adopt it.
- Game terms are written exactly as the game manual capitalises them (e.g. HIVE TIP, LEAVE, PARK).
- No emoji icons.

## Evidence on Hand
None yet: no usage data, testimonials, or event results. Do not invent any. Students' personal data is limited to email and display name.

## Product Principles
1. Works with zero internet, always. The phone is the main copy; the server is where copies meet.
2. Show the data, let humans decide.
3. Eyes on the field: big targets, almost no typing, every tap undoable.
4. Config, not code: a new game is a JSON file; each group's way of scouting is a Group setting.
5. Simple enough that its author can explain every line in an interview.

## Accessibility & Inclusion
- Readable in bright light: high contrast (WCAG AA minimum, AAA for key numbers and labels). Light and dark themes.
- Touch targets at least 56px for in-match controls; usable one-handed in portrait.
- Never rely on colour alone (the alliance is also shown as text).
