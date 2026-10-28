// When to show the "keep Usetally" pop-up to a business on its free trial.
// Never on the first days, never more than once a day, and only when the
// trial is really running out. Pure, so it can be tested.
const DAY = 86400_000;

// While the "pay early, get extra free time" offer runs (offer = true), it
// shows from day 2 of the trial; otherwise only when the trial is running out.
export function trialNudge({ allowance, createdAt, docsSent = 0, now = Date.now(), offer = false }) {
  if (!allowance || allowance.reason !== "trial") return null;
  const age = now - Date.parse(createdAt || 0);
  if (!(age >= 2 * DAY)) return null; // let them try it first
  if (allowance.mode === "days" && allowance.ends_at) {
    const daysLeft = Math.max(0, Math.ceil((Date.parse(allowance.ends_at) - now) / DAY));
    if (offer || daysLeft <= 3 || (daysLeft <= 7 && docsSent >= 1)) return { mode: "days", daysLeft, endsAt: allowance.ends_at, offer };
    return null;
  }
  if (allowance.mode === "documents" && Number(allowance.limit) > 0) {
    const left = Math.max(0, Number(allowance.limit) - Number(allowance.used || 0));
    if (offer || left <= Number(allowance.limit) / 2) return { mode: "documents", docsLeft: left, limit: Number(allowance.limit), offer };
  }
  return null;
}

// remembered in the browser: every 3 days, daily in the last 3 days
export const nudgeKey = (businessId) => `usetally:trial-nudge:${businessId}`;
export const shownToday = (stored, now = Date.now()) => stored === new Date(now).toISOString().slice(0, 10);
export function dueAgain(stored, { daysLeft } = {}, now = Date.now()) {
  if (!stored) return true;
  const gap = (Date.parse(new Date(now).toISOString().slice(0, 10)) - Date.parse(stored)) / DAY;
  return gap >= (daysLeft != null && daysLeft <= 3 ? 1 : 3);
}
