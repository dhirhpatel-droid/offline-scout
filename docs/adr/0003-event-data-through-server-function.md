# Event data is fetched by a server function, not by the app

The official FTC Events API, FRC Events API and The Blue Alliance all require a secret API key, and anything shipped inside the app is public. So a Supabase Edge Function fetches an Event's Teams, Matches and official scores, stores them in our database, and phones download them from there with the rest of their sync.

This also means one fetch per Event instead of one per phone. FTCScout (no key) is the starting source for FTC; the FRC source is chosen before the FRC 2027 config.
