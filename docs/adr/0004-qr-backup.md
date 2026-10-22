# QR backup: one match per code, answers in config order

Some gyms have no signal all day, so matches can't reach the Lead until everyone leaves. QR backup (a Group setting, off by default) lets a Scout's phone show each unsent match as a QR code, and a Lead's phone scan them with the camera. Nothing needs a network: the codes are made and read on the phones.

**Payload.** Each code holds one Submission as `OS1:` plus a JSON array (`js/qr-rules.js`). Field names aren't sent: the answers are listed in the Game config's own order, so a match is about 300 characters and the code stays small enough to scan off a phone screen in gym lighting. Both phones must have the same config version, which the scan checks (with a message, not a crash). Times are milliseconds in base 36; any non-ASCII character is written as a `\uXXXX` escape so every scanner reads the same text.

**Showing several matches.** The Scout's screen changes code every 2.5 seconds; the Lead's scanner keeps reading and skips codes it already has. No "multi-part" format to get wrong.

**Whose match it is.** The Lead's phone uploads scanned matches when it has signal. The database lets a Lead add a Submission *for a member of their group* (and records `added_by`), so it stays the Scout's match. When the Scout's own phone syncs later, the newer edit wins as usual.

**Libraries.** Making and reading QR codes by hand isn't worth it, so two open-source files are copied into `vendor/` and cached for offline use: `qrcode-generator` 2.0.4 (MIT) draws codes; `jsQR` 1.4.0 (Apache-2.0) reads camera frames on phones without a built-in reader (iPhones). Android uses the browser's own `BarcodeDetector`.

## Considered Options
- **Field names in the payload:** survives config changes, but codes become about twice as dense and harder to scan.
- **All matches in one big code, or a numbered multi-part format:** dense codes fail in bad light; multi-part needs reassembly logic. One code per match is simpler and each scan is useful on its own.
- **Bluetooth or Wi-Fi Direct:** not available to web apps on iPhones.

## Consequences
- Changing a Game config's field order means bumping its `version`; codes from the old version are refused with a clear message.
- A Lead can add matches as a group member; `added_by` keeps that visible.
