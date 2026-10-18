# Offline Scout

Scouting for FIRST robotics teams at events, planned by a lead and done by scouts in the stands, with or without internet.

## People and groups

**Team**:
A FIRST team, always identified by its program and number (e.g. FRC 4069, FTC 23810). Both your own team and the teams you scout are Teams.
_Avoid_: robot (when you mean the team), club

**Program**:
Which FIRST competition a Team belongs to: FRC or FTC. Team numbers are only unique within a program.
_Avoid_: league, division

**Scouting group**:
The people who scout together, labelled with the Program and Team number they scout for. The label identifies the group; it does not lock the number, so several groups may carry the same Team.
_Avoid_: team (reserved for FIRST teams), squad, crew

**Lead**:
A member of a Scouting group who manages it: invites and removes members, sets up events, assigns scouting, and sees all of the group's data. A group can have several Leads; drive team members who need the data are made Leads.
_Avoid_: admin, captain, owner

**Scout**:
A member of a Scouting group who records matches. By default a Scout sees only their own Submissions and can edit them after submitting.
_Avoid_: user (too general), member (when you mean this role)

**Group setting**:
A choice a Lead makes for how their Scouting group works (e.g. what Scouts can see), because different Teams scout differently. Each has a default.
_Avoid_: preference, option, config (reserved for game configs)

**Invite**:
An email from a Lead asking someone to join a Scouting group. Accepting it (signing up first if needed) makes them a Scout.
_Avoid_: join code

## Events

**Event**:
One FIRST competition (e.g. a qualifier or provincial championship), identified by FIRST's event code. A Scouting group can have several Events in a season.
_Avoid_: competition, tournament, regional (when you mean any event)

**Current event**:
The one Event a Scouting group is scouting right now, chosen by a Lead. Members' phones download its schedule whenever they have signal.
_Avoid_: active event, live event

## Scouting

**Match**:
One scheduled game at an Event, e.g. qualification match 14 (Q14). Has a red and a blue alliance.
_Avoid_: game, round

**Alliance position**:
One robot's slot in a Match: Red 1, Red 2 (and Red 3 in FRC), Blue 1, Blue 2 (and Blue 3).
_Avoid_: station, slot, seat

**Submission**:
One Scout's record of what one Team did in one Match. It belongs to the Scouting group, so it stays when the Scout leaves. Two Scouts watching the same Team in the same Match make two Submissions; both are kept. One Scout watching two Teams in the same Match also makes two Submissions.
_Avoid_: entry, report, announcement

**Draft**:
A Submission still being scouted on a Scout's phone, saved on every tap but not yet submitted. A phone has at most one Draft.
_Avoid_: in-progress entry, unsaved match

**Match level**:
Whether a Match is a qualification match or a playoff match.
_Avoid_: round type, stage

**Assignment**:
A Lead's instruction that a Scout watches a Team in a Match. Assignments come from a Position shift or a Team watch.
_Avoid_: task, job

**Position shift**:
A Lead's instruction that a Scout watches one Alliance position for a range of qualification matches (e.g. Red 1 for Q1 to Q20); the schedule turns it into Assignments.
_Avoid_: rotation, station shift

**Team watch**:
A Lead's instruction that a Scout follows certain Teams; the schedule turns it into an Assignment for every Match those Teams play, including playoff matches once they are known.
_Avoid_: follow, team assignment

**Game config**:
The official list of what to scout for one season's game in one Program (e.g. FTC 2026–27 BIOBUZZ), with point values. Published by the app's maintainer and the same for every Scouting group.
_Avoid_: form, template, settings

**Custom question**:
An extra question a Lead adds for their own Scouting group, on top of the Game config. Only that group sees it; it stays until a Lead changes it and never adds to Estimated points.
_Avoid_: custom field, extra field

**Estimated points**:
The points one Team is estimated to have scored in a Match, worked out only from the Game config's point values in a Submission.
_Avoid_: score (reserved for the official alliance score), total, rating

**Unassigned submission**:
A Submission a Scout makes without an Assignment for it. It counts like any other.
_Avoid_: extra, bonus scouting

## Checking data

**Coverage**:
How many Submissions a Scouting group has for each Team at the Current event. Shown to Leads to help them decide who to watch; never acted on by the app.
_Avoid_: completion, progress

**Data check**:
A flag shown to Leads when Submissions look wrong: two Submissions for the same Team and Match disagree, Estimated points add up far from the official alliance score, or a value is impossible. It never changes data.
_Avoid_: validation, error, warning
