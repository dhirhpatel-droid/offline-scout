// The connection to Supabase, the shared backend (docs/adr/0001).
//
// The URL and publishable key are meant to be public: they identify the
// project, and the database's Row Level Security rules decide what each
// signed-in person may see. The SECRET key never appears in the app.
//
// supabase-js is loaded by index.html from vendor/ (a copy kept in the repo,
// so the service worker caches it and sign-in state works offline). It puts a
// global "supabase" object on the page.

export const SUPABASE_URL = 'https://mfjuzvfdoaqztxzencot.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Esr6dk4ixVvIlHhNetPOiA_1TlEybPp';

export const sb = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true, // keep you signed in on this phone, even offline
    autoRefreshToken: true, // renew the login token whenever there's signal
    detectSessionInUrl: true, // finish sign-in from email links (confirm, invite, reset)
  },
});

// Where email links should bring people back to: this page, without any #route.
export const APP_URL = `${location.origin}${location.pathname}`;

// The phone's own guess at whether there's a connection. It can be wrong
// (wifi with no internet), so every network call still handles failure.
export const isOnline = () => navigator.onLine;

// Turns a Supabase/network error into a sentence a scout can act on.
export function friendlyError(error) {
  const msg = String(error?.message ?? error ?? '');
  if (!isOnline() || /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'No connection right now. This needs signal; try again once you have it.';
  }
  if (/Invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check them, or reset your password.';
  if (/Email not confirmed/i.test(msg)) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (/already registered|already been registered/i.test(msg)) return 'There’s already an account with that email. Sign in instead.';
  if (/Password should be at least/i.test(msg)) return 'Use a password with at least 8 characters.';
  if (/JWT|token|not authenticated|401/i.test(msg)) return 'Your sign-in has expired. Sign out (Settings) and sign in again.';
  if (/rate limit|too many/i.test(msg)) return 'Too many emails sent in the last hour. Wait a bit, then try again.';
  return msg || 'Something went wrong. Try again.';
}
