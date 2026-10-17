# Data format

Two kinds of JSON: **game configs** (what to scout) and **entries** (one scouted match).

## Game config (`configs/<program>-<season>-<game>.json`)

```json
{
  "id": "ftc-2026-biobuzz",
  "version": 1,
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

- **sections** are the tabs (match periods). `label` is the short tab name, `title` the heading.
- **fields** have an `id` (unique within the section), a `type`, and a `label`.

| type | looks like | stored value | `points` means |
|---|---|---|---|
| `counter` | − number + | whole number ≥ 0 | points for each one |
| `toggle` | No / Yes | `true` / `false` | points when Yes |
| `choice` | row of buttons from `options` | the option's `value` | per-option `points` (optional) |
| `rating` | buttons `min`…`max` | number | — |
| `number` | number pad | number | — |
| `text` | text box | string | — |
| `notes` | big text box | string | — |

- **roles** mark the fields the app itself needs. Exactly one field each:
  `scoutName`, `matchNumber`, `teamNumber`, `alliance` (required), and `noShow` (optional;
  when Yes, estimated points are 0).
- `"required": true` blocks saving until the field is filled in.
- `js/config.js` → `validateConfig()` checks all of this. `npm test` runs it on every
  config listed in `configs/index.json`.

**Adding a game:** copy a config, change the sections and fields, add it to
`configs/index.json` and to `APP_FILES` in `sw.js`, bump `VERSION` in `sw.js`, run `npm test`.
FRC works the same way, with `"robotsPerAlliance": 3`.

## Entry (one scouted match, stored in IndexedDB)

```json
{
  "id": "mvbnps9n-xfyuc4",
  "configId": "ftc-2026-biobuzz",
  "configVersion": 1,
  "event": "Northern Ontario Qualifier",
  "values": {
    "pre.scout": "Maya", "pre.match": 14, "pre.team": 23810, "pre.alliance": "red",
    "auto.leave": true, "auto.hiveTips": 2,
    "teleop.flower": 3, "teleop.defense": "some",
    "post.driverSkill": 4, "post.notes": "fast intake, tipped once"
  },
  "summary": { "scout": "Maya", "match": 14, "team": 23810, "alliance": "red" },
  "points": 51,
  "createdAt": "2026-10-17T00:27:04.120Z",
  "updatedAt": "2026-10-17T00:31:40.512Z",
  "submittedAt": "2026-10-17T00:31:40.512Z"
}
```

- **values** are keyed `section.field`, so Auto and Teleop HIVE TIPs never collide.
  Fields never touched are simply missing.
- **summary** and **points** are worked out from `values` (`js/entries.js` → `refresh()`),
  stored so lists don't need to load the config.
- **configId + configVersion** say exactly which rules the entry was scouted under, so old
  entries still make sense after a config changes.
- **id** is time + random, so ids from different phones won't collide when QR sync arrives.

Still undecided: the QR payload (probably a compact form of `values`), and how the lead
scout merges entries from many phones.
