---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface: match scouting screen (index.html#match)

Mode: Operate. Audience: student scouts in bright, loud gym bleachers, phone in portrait, often one-handed, one robot per 2.5-minute match. Job: record what one robot does without looking away from the field for long. Constraints: offline always, no typing during a match, 56px+ targets, readable in bright light, light + dark themes.

Chosen after two re-rolls. Dhir's steer: "bolder look", "fewer screens/steps", reference app Spotify, and the earlier sets "look too AI / all the same".

## Direction contract
THESIS: One robot's match as a bold, colour-coded instrument you tap without reading; refuses the white form with grey labels and the long scroll.
OWN-WORLD: Near-black ground with two raised neutral layers; the alliance colour (red or blue) is the committed colour, filling the header and every add button; white type; Archivo heavy for numbers and headings, Archivo regular for labels; pill tabs and full-circle buttons; light theme swaps to a white ground with deeper alliance colours.
STORY: The scout sees team, match and alliance at a glance, taps the big add button each time something happens, taps minus to undo, moves period to period with one pill, submits, and starts the next match in one tap.
FIRST VIEWPORT: Alliance-colour header: team number huge at left, match number and live estimated points at right. Under it, a pill tab bar Pre / Auto / Teleop / End / Post. Below, only the current period's rows, which fit without scrolling: label at left, huge number, round outline minus and round alliance-filled plus. Bottom: "Saved on this device" and the primary pill to the next period.
FORM: grounded direction from the user's steer (bolder, fewer steps, Spotify), not a dealt card; position 1 of 1 after two re-rolls. seed:ba38e4eb02e75592
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: pressing add makes the number jump and the row flash the alliance colour once (one authored moment, reduced-motion safe).

Unresolved: scout-lead assignments will later pre-fill team and match.
