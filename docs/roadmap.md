# Roadmap

What gets built, in what order, and the database behind it. Words follow GLOSSARY.md.
Every milestone ends with: tests passing, `npm run test:offline` passing, an impeccable
review and a ui-ux-pro-max accessibility check of any new screens, and an update to CLAUDE.md.

## Milestones

Each one is useful on its own, and each builds on the one before.

| # | Milestone | What a user can do when it's done |
|---|---|---|
| 1 | Offline core ✅ | Scout BIOBUZZ matches on one phone with no signal. |
| 1.5 | **Groundwork** | Nothing new to see: the code and phone storage now match GLOSSARY.md. Entries are Submissions with UUIDs, they record the Alliance position (Red 1…) and whether it's a qualification or playoff match, they carry a "not synced yet" marker, and matches already saved on a phone are carried over. |
| 2 | **Accounts and Scouting groups** | Sign up, log in once and stay logged in offline. Create a group (FTC/FRC + Team number), invite people by email, accept invites, make someone a Lead, remove members. Matches scouted before signing up move into the account. |
| 3 | **Sync** | Submissions upload by themselves when there's signal. Leads see everyone's Submissions; Scouts see their own (Group setting). Edits keep a history; the newer edit wins. Leads can edit any Submission (Group setting). |
| 4 | **Events from FIRST** | A Lead searches for an Event and makes it the Current event. Its Teams and qualification schedule download to every member's phone. The match screen fills in the Team from the schedule. |
| 5 | **Assignments** (built Oct 19) | Leads make Position shifts and Team watches. Each Scout's home screen shows "your next matches" with scheduled times. Two Teams in one Match (Group setting) with a switch at the top. Playoff Teams fill in when there's signal. |
| 6 | **Lead views** (built Oct 19) | All Teams table (sortable, default sort is a Group setting), one page per Team, and Coverage. |
| 7 | **Data checks and Custom questions** (built Oct 19) | Flags for disagreeing Submissions, totals far from official scores, and impossible values (sensitivity is a Group setting). Leads add Custom questions to any period. |
| 8 | **Announcements** (built Oct 22) | Leads post short messages to the group; they show on everyone's Home screen and offline. |
| 9 | **QR backup** (built Oct 22) | Group setting: Scouts show unsent matches as QR codes, a Lead scans them with no signal at all. |
| later | Not scheduled yet | Running-late estimate, clash flags, pit scouting, FRC 2027 config (after kickoff in January). |

**Why this order?** Nothing can be shared until there are accounts and groups (2). Leads
can't see anyone's data until it syncs (3). Assignments need a schedule (4 before 5).
The Lead views and Data checks are only useful once real data is flowing (6, 7).

## Database tables (Supabase / Postgres)

Created as SQL migration files in `supabase/migrations/`, so every table and rule is in git.

### People and groups (Milestone 2)

| Table | One row is… | Main columns |
|---|---|---|
| `profiles` | a person | `id` (same as their login id), `display_name` |
| `groups` | a Scouting group | `id`, `program` (FTC/FRC), `team_number`, `name`, `settings` (the Group settings), `game_config_id` |
| `memberships` | one person in one group | `group_id`, `user_id`, `role` (lead/scout), `joined_at` |
| `invites` | one email Invite | `group_id`, `email`, `invited_by`, `expires_at` (7 days), `accepted_at` |

`team_number` is a label, not unique: several groups can say "FRC 4069" (GLOSSARY.md).

### Events and schedule (Milestone 4)

FIRST's event data is public, so it is stored once and shared by every group.

| Table | One row is… | Main columns |
|---|---|---|
| `events` | a FIRST Event | `program`, `season`, `code` (e.g. ONSUD), `name`, `starts_on` |
| `event_teams` | a Team at an Event | `event_id`, `team_number`, `team_name` |
| `matches` | a Match | `event_id`, `level` (qual/playoff), `number`, `scheduled_at`, `red` (team numbers), `blue`, `red_score`, `blue_score` (official, once played) |
| `group_events` | an Event a group attends | `group_id`, `event_id`, `is_current` |

### Scouting (Milestones 3, 5, 7)

| Table | One row is… | Main columns |
|---|---|---|
| `submissions` | a Submission | `id` (UUID made on the phone), `group_id`, `event_id`, `match_level`, `match_number`, `team_number`, `alliance_position`, `scout_id`, `scout_name`, `game_config_id`, `config_version`, `values`, `custom_values`, `estimated_points`, `created_at`, `updated_at`, `submitted_at` |
| `submission_edits` | one change to a Submission | `submission_id`, `edited_by`, `edited_at`, `values_before` |
| `position_shifts` | a Position shift | `group_id`, `event_id`, `scout_id`, `position` (red1…blue3), `from_match`, `to_match` |
| `team_watches` | a Team watch | `group_id`, `event_id`, `scout_id`, `team_number` |
| `custom_questions` | a Custom question | `group_id`, `section` (pre/auto/teleop/end/post), `type`, `label`, `options`, `position`, `hidden_at` |

**Assignments are not stored.** Each phone works them out from the shifts, watches and
the schedule. That means a Lead's change is one small row, and a phone with an old
schedule still works out sensible Assignments offline.

`scout_name` is copied onto every Submission, so it still shows after someone leaves
(or "Former member" if they delete their account).

### Who can see what (Row Level Security)

Rules live in the database, so even a modified app can't break them:

- You can see a group, its members and its Events only if you are a member.
- **Submissions:** Leads see all of their group's. Scouts see their own, or all of the
  group's if the Group setting allows it. Anyone can create Submissions for groups they're in.
- Only Leads can change the group, its settings, invites, shifts, watches and Custom questions.
- Events, Teams and Matches are readable by any signed-in user. Only the server function
  can write them (docs/adr/0003).

## Things to know before Milestone 2

- **Email limits:** Supabase's built-in email sender only sends a few emails per hour on
  the free plan. That's fine for testing, but before a whole team signs up we'll connect
  a free email service (e.g. Resend) for sign-up and invite emails.
- **Sending invites** needs Supabase's secret key, so it happens in a server function,
  never in the app (same reason as docs/adr/0003).
- **Signing in offline:** you must sign in once with signal. After that the phone keeps
  you signed in, and sync waits until there's signal again.
