# The phone is the main copy; Supabase is where copies meet

Scouts are usually without signal inside the gym, so the app is offline-first: every Submission, the schedule and the Assignments live on the phone (IndexedDB) and the app works fully without a connection. Supabase (Postgres + Auth) is the shared backend that phones sync with whenever they have signal, normally before entering and after leaving the gym.

We picked Supabase over Firebase or our own server because it is a plain Postgres database (SQL that can be explained and kept as migration files in the repo), it has email auth built in, Row Level Security keeps each Scouting group's data private inside the database itself, and the free tier covers this scale.

## Considered Options
- **Online app with an offline mode:** simpler, but fails exactly when it matters (the problem this project exists to solve).
- **No server, QR only:** works with zero signal, but no accounts, no invites and no Lead view across phones. QR stays as a later, optional Group setting for groups that never get signal.

## Consequences
- Sync must handle edits made offline: the newer edit (by when it was made) wins, and every edit is kept in the Submission's history.
- Ids are created on the phone (UUIDs) so Submissions made offline never collide.
