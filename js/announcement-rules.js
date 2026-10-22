// Announcements (GLOSSARY.md), the rules: no network, tested in
// tests/announcement-rules.test.js.

export const MAX_LENGTH = 280;

// "" → an error message; a fine message → null.
export function checkBody(text) {
  const body = String(text ?? '').trim();
  if (!body) return 'Write the announcement first.';
  if (body.length > MAX_LENGTH) return `Keep it to ${MAX_LENGTH} characters (it’s ${body.length}).`;
  return null;
}

// The ones this person hasn't seen yet: newer than when they last looked,
// and not written by them. list is newest first.
export function unread(list, lastSeenAt, myId) {
  return list.filter((a) => a.created_by !== myId && (!lastSeenAt || a.created_at > lastSeenAt));
}

// When it was posted, as short as it can be: "10:42 AM" today,
// "Tue 10:42 AM" this week, "Oct 18" before that.
export function whenLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const days = (now - d) / 86400000;
  if (days < 6) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
