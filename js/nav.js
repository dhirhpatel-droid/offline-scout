// Where you came from, so Back and Save return you there (not to a fixed
// screen). The app only uses #hash addresses; this keeps the last few.
//   Data checks → open Maya's match → Save  → back on Data checks
//   Team page   → Back                      → the Teams table

const stack = [];

// Called by the router on every screen change.
export function noteVisit(hash) {
  if (stack.at(-1) === hash) return;          // the same screen redrawn
  if (stack.at(-2) === hash) stack.pop();     // went back one step
  else stack.push(hash);
  if (stack.length > 30) stack.shift();
}

// The screen before this one, or `fallback` when the app was opened here.
export function backHref(fallback) {
  return stack.at(-2) ?? fallback;
}
