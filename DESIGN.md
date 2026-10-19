---
name: Offline Scout
description: Match scouting you tap without reading. Bold, alliance-coloured, works offline.
colors:
  alliance-red: "#d42a36"
  alliance-blue: "#2160e0"
  alliance-none: "#3a3a41"
  on-alliance: "#ffffff"
  ground: "#0e0e10"
  surface: "#1a1a1e"
  surface-2: "#27272c"
  line: "#36363d"
  control-line: "#6b6b75"
  text: "#ffffff"
  text-2: "#b9b9c2"
  text-3: "#8f8f99"
  primary-bg: "#ffffff"
  primary-text: "#0e0e10"
  danger: "#ff5c5c"
  focus: "#ffd60a"
  tab-track: "rgb(0 0 0 / 0.22)"
  scrim: "rgb(0 0 0 / 0.6)"
  light-alliance-red: "#c8202d"
  light-alliance-blue: "#1d56d1"
  light-ground: "#ffffff"
  light-surface: "#f2f2f5"
  light-surface-2: "#e4e4ea"
  light-line: "#d3d3da"
  light-control-line: "#8a8a94"
  light-text: "#0e0e10"
  light-text-2: "#45454d"
  light-text-3: "#64646d"
  light-danger: "#c41d2a"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "5rem"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 75"
    fontFeature: "'tnum', 'lnum'"
  display-words:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 75"
  hero:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "4rem"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 75"
    fontFeature: "'tnum', 'lnum'"
  number:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 75"
    fontFeature: "'tnum', 'lnum'"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
  button:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  caption:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
rounded:
  badge: "10px"
  segment: "12px"
  field: "14px"
  segmented: "16px"
  sheet: "20px"
  pill: "999px"
  circle: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  tap: "56px"
  tap-lg: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary-bg}"
    textColor: "{colors.primary-text}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "{spacing.tap}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "{spacing.tap}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.pill}"
    height: "{spacing.tap}"
  counter-add:
    backgroundColor: "{colors.alliance-red}"
    textColor: "{colors.on-alliance}"
    rounded: "{rounded.circle}"
    size: "{spacing.tap-lg}"
  counter-minus:
    textColor: "{colors.text}"
    rounded: "{rounded.circle}"
    size: "{spacing.tap}"
  match-header:
    backgroundColor: "{colors.alliance-red}"
    textColor: "{colors.on-alliance}"
    padding: "4px 12px 12px"
  tab-active:
    backgroundColor: "{colors.on-alliance}"
    textColor: "{colors.alliance-red}"
    rounded: "{rounded.pill}"
    height: "{spacing.tap}"
  segmented:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.segmented}"
    padding: "4px"
  segmented-option-selected:
    backgroundColor: "{colors.alliance-red}"
    textColor: "{colors.on-alliance}"
    rounded: "{rounded.segment}"
    height: "{spacing.tap}"
  segmented-option-off:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.segment}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "{spacing.tap}"
  list-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "{spacing.tap-lg}"
  alliance-badge:
    backgroundColor: "{colors.alliance-red}"
    textColor: "{colors.on-alliance}"
    rounded: "{rounded.badge}"
    size: "40px"
  bottom-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sheet}"
    padding: "24px"
---

# Design System: Offline Scout

## Overview

**Creative North Star: "The Alliance Instrument"**

Offline Scout is a counter you hold in the stands. A scout watches a robot, not the phone, so the screen is built to be hit with a thumb and read in half a second: huge condensed numbers, round buttons, and one strong colour that says which alliance you are watching.

The ground is near-black (or plain white in the light theme) with two slightly raised grey layers. The alliance colour, red or blue, is the only real colour. It fills the match header and every add button. Everything else is white, grey, or black. There is one font, Archivo, used two ways: squeezed and heavy for numbers and headings, normal width for words.

It is meant to feel bold and sporty, like a music app's now-playing screen, not like a school form. Since Oct 2026 it also borrows from **what you see at the event itself** (chosen by Dhir): team numbers set like robot bumpers, station signs ("Red 1"), the printed match schedule with one column per station, the field clock's period times (0:30, 2:00) and the results screen after a match. It turns down the white form with grey labels and the long scrolling page.

**Key Characteristics:**
- One committed colour: the alliance (red or blue), everything else is neutral.
- Numbers are the loudest thing on screen.
- Every tap target is a pill or a circle, at least 56px.
- Flat surfaces; depth comes from lighter grey layers, not shadows.
- Light and dark themes share the same layout; only the colours swap.

## Colors

A neutral near-black world with one alliance colour poured over it.

### Primary
- **Alliance Red** and **Alliance Blue**: the match accent. Fills the match header, the add (+) buttons, the selected segment in toggles, the row flash, text selection, and saved-match badges. The light theme uses deeper versions (Light Alliance Red, Light Alliance Blue) so they still pass contrast on white. White text on both passes AA.
- **Unpicked Grey** (alliance-none): stands in for the alliance colour before the scout picks red or blue.

### Neutral
- **Ground**: the page background. Near-black in dark, white in light.
- **Surface** and **Surface 2**: the two raised layers. Surface holds inputs, list links, toggles and the bottom sheet; Surface 2 is secondary buttons and the "off" choice in a Yes/No toggle.
- **Line**: thin dividers between rows and above the bottom bar.
- **Control Line**: the 2px outline of the minus button. Kept at 3:1 against the ground so the button edge is visible.
- **Text / Text 2 / Text 3**: main words, supporting words (hints, status), quiet words (placeholders, units). All pass AA on the ground.
- **Primary Pill** (primary-bg / primary-text): the main action pill is the opposite of the ground: white on dark, black on light. It is not the alliance colour.
- **Danger**: delete actions and field errors only.
- **Focus Yellow**: the 3px keyboard focus ring in dark mode (black in light mode).

### Named Rules
**The One Colour Rule.** The alliance colour is the only saturated colour on a scouting screen. Don't add a second accent; use neutrals.

**The Not By Colour Alone Rule.** Wherever the alliance colour appears as meaning, the alliance is also written out in text ("Red alliance", the badge letter).

## Typography

**Display Font:** Archivo, condensed (75% width), weight 800-900
**Body Font:** Archivo, normal width (with system-ui fallback)

**Character:** One self-hosted variable font. Squeezed and heavy, it looks like a scoreboard; at normal width it reads like plain labels.

### Hierarchy
- **Hero** (800, 64px, condensed, line-height 0.95): the team number in the match header. One per screen.
- **Number** (800, 44px, condensed, tabular): counter values. The "Match saved" heading uses the same size.
- **Headline** (800, 32px, condensed, line-height 1): period titles ("Teleop") and the points total.
- **Title** (800, 24px): top bar titles, the wordmark (900, condensed), dialog and empty-state headings, team numbers in the saved list.
- **Body** (400, 17px, line-height 1.35): default text.
- **Label** (650, 17px): field labels next to counters and toggles. Game terms keep the manual's capitals.
- **Button** (700, 17px; 20px on big pills): pills, tabs, segments.
- **Small** (15px): hints, status line, match meta, settings group headings (700, Text 2).
- **Caption** (600, 13px): "est. points" and "pts" under numbers.

### Named Rules
**The Squeeze For Numbers Rule.** Condensed width (75%) is for numbers and big headings only. Words a scout reads, like labels and buttons, stay at normal width.

**The Tabular Numbers Rule.** Every number that changes uses tabular, lining digits so it doesn't jump sideways when it counts up.

## Layout

A single column, max 640px wide and centred, so tablets keep controls in thumb reach. Spacing is on a 4px grid (4, 8, 12, 16, 24, 32). Content has 16px side padding.

The match screen is three stacked bands: a sticky alliance-coloured header (team number, match, points, period tabs), the current period's rows, and a sticky bottom bar with "Saved on this device" and the next-step pill. Only one period shows at a time, so a period fits without scrolling.

A counter row is a grid: label on the left, then minus (56px), the number (4.5rem), and plus (64px). Rows are split by 1px lines. Short fields (match number, team number) sit two to a row.

Touch targets are at least 56px for anything tapped during a match; 64px for the add button and big pills. Small helper buttons (back, settings, text buttons) are 48px.

## Elevation & Depth

Flat. Depth comes from tone: Ground, then Surface, then Surface 2, each a little lighter (or darker in light mode). The sticky header and bottom bar separate by colour and a 1px line, not by shadow.

### Shadow Vocabulary
- **Sheet shadow** (`box-shadow: 0 20px 50px rgb(0 0 0 / 0.45)`): only the confirm bottom sheet, with a 60% black backdrop behind it.

### Named Rules
**The Flat Ground Rule.** Nothing on the page casts a shadow except the confirm sheet, which floats above everything.

## Shapes

Two shapes do the tapping: the full pill (999px) and the full circle. Pills are for actions and tabs; circles are for plus and minus. Containers that hold content use soft corners: 14px for inputs, list links and settings rows, 16px for the segmented track with 12px segments inside, 10px for alliance badges, 20px for the bottom sheet. Outlines are 2px when they mark a control and 1px when they divide rows.

## Components

### Buttons
Big, round, and solid.
- **Shape:** full pill (999px), 56px tall, 24px side padding. "Big" pills are 64px with 20px text.
- **Primary:** Primary Pill colours (white on dark, black on light). One per screen, usually the next step.
- **Secondary:** Surface 2 with Text colour.
- **Danger:** Danger fill, used only in the confirm sheet.
- **Press:** shrinks to 97% for 120ms. No hover styles; this is a touch app.
- **Text buttons:** 48px, Text 2, weight 600; the danger version uses Danger.

### Counter (signature)
- **Minus:** 56px circle, 2px Control Line outline, Text icon. Fades to 35% when the count is zero.
- **Plus:** 64px circle filled with the alliance colour, white icon.
- **Value:** Number style between them.
- **Press:** circles shrink to 92%.
- **Add moment:** pressing plus flashes the whole row in the alliance colour (38% mix, fading over 420ms) and the number jumps from 125% size back to normal (260ms). The header points total does the same jump, but only after a tap. With reduced motion turned on, the colour flash stays and the jump goes.

### Match Header
The alliance-colour block. Sticky at the top, fills edge to edge with the alliance colour, white text. Holds the back button, match and alliance in words, the points total at right, the hero team number, and the period tabs. Changes colour in 200ms when the alliance is picked.

### Period Tabs
A pill track tinted 22% black over the alliance colour, with five equal pill tabs (56px). The selected tab turns white with alliance-coloured text.

### Segmented Choice
Used for Yes/No, ratings and pick-one options. A Surface track (16px corners, 4px padding) holding segments (12px corners, 56px min, 72px wide in Yes/No rows). The selected segment fills with the alliance colour. "No" when selected uses Surface 2 instead, because it is the resting state. Before an alliance is picked, selections use the Primary Pill colours. The alliance picker shows each option in its own colour.

### Inputs / Fields
- **Style:** Surface fill, 14px corners, 56px tall, 20px text at weight 600. Number inputs use the condensed 32px number look.
- **Focus:** 2px border in Text colour.
- **Error:** 2px Danger border plus a Danger message under it.

### Lists
- **List link:** 64px Surface row, 14px corners, bold label, count in Text 2 on the right.
- **Saved match row:** alliance badge (40px, 10px corners), team number and details, points on the right; 1px line between rows.

### Bottom Sheet (confirm dialog)
Surface fill, 20px corners, 24px padding, sits at the bottom of the screen so the buttons land under the thumb. Stacked full-width pills.

### Event pieces ("Like the event itself")
- **Bumper:** a team number on its alliance colour, condensed 800, tabular digits, 6px corners (`--plate-radius`) and a darker lower edge (`--bumper-shade`, an inset, not a cast shadow) like bumper fabric. Neutral grey when the alliance isn't known. The team(s) you watch get a 3px ring in Text colour and "you watch" in their label (never colour alone). Used in the Event schedule, Home's Coming up and Assignments.
- **Station sign:** "Red 1" in white on the alliance colour, 6px corners. Used wherever a position is listed (Coming up, Assignments); the saved-match badge (R1) is the small form.
- **Line-up:** "16415 23810 vs 22309 24436" in the alliance block on Home and in the match header on Setup. Outlined plates, the watched team filled white.
- **Printed schedule:** a real table, Match | Red 1 | Red 2 | Blue 1 | Blue 2 (from the Game config, so FRC gets 6 columns). Station headings carry a 3px alliance bar plus their words. Played rows go outlined; the next match gets a Surface band and "Next".
- **Field clock:** period tabs show their time under the name (Auto 0:30, Teleop 2:00).
- **Results:** the finish block lists each period with its points right-aligned, a 3px rule, then the estimated total at hero size.

### Named Rules
**The Printed Sign Rule.** Things that exist as printed signs at an event (bumpers, station signs) get 6px corners; things you tap stay pills and circles.

**The No Side Stripe Rule.** No coloured left borders on rows; say the alliance with a station sign or bumper instead.

### Icons
Inline SVG line icons, 2.5px stroke, round caps, coloured with the text around them.

## Do's and Don'ts

### Do:
- **Do** use the alliance colour for the add button, the header, and the selected choice, and nothing decorative.
- **Do** keep every in-match control at least 56px, and the add button 64px.
- **Do** set numbers in condensed Archivo 800 with tabular digits.
- **Do** take every colour, size and space from tokens.css so both themes keep working.
- **Do** keep the reduced-motion version: colour flash stays, scaling goes.
- **Do** write the alliance in words next to the colour.

### Don't:
- **Don't** add a second accent colour to scouting screens.
- **Don't** use shadows on cards or rows; use the Surface layers.
- **Don't** use emoji as icons; use the inline SVG set.
- **Don't** add team colours or logos; the app stays team-neutral.
- **Don't** add hover-only effects; everything must work by touch.
