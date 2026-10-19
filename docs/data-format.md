# Data format

Two kinds of JSON: **Game configs** (what to scout) and **Submissions** (one Scout's record of one Team in one Match). Words follow GLOSSARY.md.

## Game config (`configs/<program>-<season>-<game>.json`)

```json
{
  "id": "ftc-2026-biobuzz",
  "version": 2,
  "program": "FTC",
  "season": "2026–27",
  "game": "BIOBUZZ",
  "alliance": { "colors": ["red", "blue"], "robotsPerAlliance": 2 },
  "sections": [
    {
      "id": "auto", "label": "Auto", "title": "Auto", "durationSec": 30,
      "note": "optional line shown under the title",
      "fields": [
        { "id": "hiveTips", "type": "counter", "label": "HIVE TIPs", "points": 20 }
      ]
    }
  ]
}
```

- **sections** are the tabs (match periods). `label` is the short tab name, `title` the heading. Optional: `durationSec` (shown as the field clock on the tab, e.g. 0:30), `shortLabel` (a shorter column heading in the Teams table, e.g. "End"), `showWith` (show this section inside another section's tab instead of its own).
- **fields** have an `id` (unique within the section), a `type`, and a `label`.

| type | looks like | stored value | `points` means |
|---|---|---|---|
| `counter` | − number + | whole number ≥ 0 | points for each one |
| `toggle` | No / Yes | `true` / `false` | points when Yes |
| `choice` | row of buttons from `options` | the option's `value` | per-option `points` (optional) |
| `rating` | buttons `min`…`max` | number | — |
| `number` | number pad | number | — |
| `position` | Red 1 / Red 2 / Blue 1… buttons, made from `alliance` | e.g. `"red1"` | — |
| `text` | text box | string | — |
| `notes` | big text box | string | — |

- **roles** mark the fields the app itself needs. Exactly one field each:
  `scoutName`, `matchLevel` (a choice of `qual`/`playoff`), `matchNumber`, `teamNumber`,
  `alliancePosition` (type `position`) are required; `noShow` is optional (when Yes,
  Estimated points are 0).
- `"width": "half"` makes a field take half a row, so two sit side by side (number fields are
  always half width).
- `"required": true` blocks saving until the field is filled in.
- `js/config.js` → `validateConfig()` checks all of this. `npm test` runs it on every
  config listed in `configs/index.json`.

**Adding a game:** copy a config, change the sections and fields, add it to
`configs/index.json` and to `APP_FILES` in `sw.js`, bump `VERSION` in `sw.js`, run `npm test`.
FRC works the same way, with `"robotsPerAlliance": 3`.

## Submission (stored in IndexedDB, later synced to Supabase)

```json
{
  "id": "359289fc-ca51-422b-b5c4-aa511de95ae9",
  "configId": "ftc-2026-biobuzz",
  "configVersion": 2,
  "event": "Northern Ontario Qualifier",
  "values": {
    "pre.scout": "Maya", "pre.level": "qual", "pre.match": 14, "pre.team": 23810,
    "pre.position": "red1",
    "auto.leave": true, "auto.hiveTips": 2,
    "teleop.flower": 3, "teleop.defense": "some",
    "post.driverSkill": 4, "post.notes": "fast intake, tipped once"
  },
  "summary": { "scout": "Maya", "level": "qual", "match": 14, "team": 23810, "position": "red1", "alliance": "red" },
  "estimatedPoints": 51,
  "createdAt": "2026-10-17T00:27:04.120Z",
  "updatedAt": "2026-10-17T00:31:40.512Z",
  "submittedAt": "2026-10-17T00:31:40.512Z",
  "syncedAt": null,
  "groupId": "…the Scouting group's id…",
  "scoutId": "…the Scout's account id…",
  "deletedAt": null
}
```

- **id** is a UUID made on the phone, so Submissions made offline on different phones
  never collide when they sync (docs/adr/0001).
- **values** are keyed `section.field`, so Auto and Teleop HIVE TIPs never collide.
  Fields never touched are simply missing.
- **summary** and **estimatedPoints** are worked out from `values` (`js/submissions.js`
  → `refresh()`), stored so lists don't need to load the config.
- **configId + configVersion** say exactly which rules it was scouted under.
- **submittedAt** is `null` while it's still a Draft.
- **groupId / scoutId** say which group and person it belongs to. Matches made before
  an account or group existed get claimed by whoever syncs them (`claim()` in
  `js/sync-rules.js`).
- **deletedAt**: deleting only marks it, so the delete reaches the group; lists hide it.
- **syncedAt** is when the server last got this version. A Submission needs syncing when
  it's submitted and `updatedAt` is newer than `syncedAt` (`needsSync()`).
- Submissions saved by Milestone 1 were upgraded on the phone (`fromMilestone1()`): they
  keep their alliance colour (`"red"`) because the position wasn't recorded then.

## On the server (Supabase `submissions` table)

The same fields in snake_case (`group_id`, `scout_id`, `scout_name`, `match_level`,
`alliance_position`, `estimated_points`, `updated_at`, …) plus `server_updated_at`, set by
the database on every change so phones can ask "what changed since…". The phone sends
with `save_submission()`, which keeps whichever version was edited later on a phone.
Replaced versions are kept in `submission_edits`. Mapping: `toServer()` / `fromServer()`
in `js/sync-rules.js`.

Still undecided: the QR payload (QR backup is a later, optional Group setting).

## Custom questions

A group's extra questions (table `custom_questions`) are merged into the Game config on
the phone (`withCustom` in `js/custom-rules.js`). An answer is stored in the Submission's
`values` like any other, under `<section>.custom-<question id>`. Custom fields never have
`points`, so they never change Estimated points. A config field may also give `min`/`max`;
Data checks flag numbers outside them.
