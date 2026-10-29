// Where you came from, so Back and Save return you there (not to a fixed
// screen). The app only uses #hash addresses; this keeps the last few.
//   Data checks → open Maya's match → Save  → back on Data checks
//   Team page   → Back                      → the Teams table

const stack = [];
let shown = null; // the screen on show right now

// Called by the router on every screen change.
export function noteVisit(hash) {
  // Each entry in the browser's history remembers the screen before it, the
  // first time it's shown (going back to it later keeps what it had).
  if (!history.state || !('back' in history.state)) history.replaceState({ ...history.state, back: shown }, '');
  shown = hash;
  if (stack.at(-1) === hash) return;          // the same screen redrawn
  if (stack.at(-2) === hash) stack.pop();     // went back one step
  else stack.push(hash);
  if (stack.length > 30) stack.shift();
}

// The screen before this one, or `fallback` when the app was opened here.
export function backHref(fallback) {
  return stack.at(-2) ?? fallback;
}

// A link to the screen right before this one goes back in the browser's
// history instead of adding a new entry. Otherwise the phone's own back
// gesture would then return to the screen you just left, and loop.
export function backLinksUseHistory(e) {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const back = history.state?.back;
  if (!back || a.getAttribute('href') !== back) return;
  e.preventDefault();
  history.back();
}
