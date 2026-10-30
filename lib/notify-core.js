// POST /api/notify/trackoja: TrackOja sends its owner emails (daily summary,
// alerts) through Usetally's email setup. The pure checks, tested in
// tests/notify.test.mjs.

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

// { to, subject, heading, lines[], details?[[label, value]], button?{ text, url } } → { ok, value } or { error }
export function checkNotify(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send a JSON object" };
  const to = String(body.to ?? "").trim().toLowerCase();
  if (to.length > 200 || !EMAIL.test(to)) return { error: "to must be one email address" };
  const subject = clean(body.subject, 150);
  if (subject.length < 3) return { error: "subject is required" };
  const heading = clean(body.heading, 150) || subject;
  if (!Array.isArray(body.lines ?? []) || (body.lines ?? []).length > 40) return { error: "lines must be a list of at most 40" };
  const lines = (body.lines ?? []).map((l) => clean(l, 600)).filter(Boolean);
  if (!lines.length) return { error: "Add at least one line" };
  const raw = body.details ?? [];
  if (!Array.isArray(raw) || raw.length > 40) return { error: "details must be a list of at most 40" };
  const details = raw.filter((d) => Array.isArray(d) && d.length === 2).map(([k, v]) => [clean(k, 80), clean(v, 120)]).filter(([k]) => k);
  let button = null;
  if (body.button) {
    const text = clean(body.button.text, 40);
    let url = null;
    try { const u = new URL(String(body.button.url || "")); if (u.protocol === "https:" && !u.username && !u.password) url = u.toString(); } catch { /* bad url */ }
    if (!text || !url) return { error: "button needs text and an https url" };
    button = { text, url };
  }
  return { ok: true, value: { to, subject, heading, lines, details, button } };
}
