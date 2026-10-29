// Time in the app, by area: the pure parts (tested in tests/usage.test.mjs).

const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[^/]*\d[^/]*)$/i;

// "/app/invoices/6f1c…?tab=x" → "/app/invoices/:id". Only /app pages count;
// anything else (or a strange path) is null and isn't recorded.
export function usageArea(pathname) {
  const path = String(pathname || "").split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") || "/";
  if (path !== "/app" && !path.startsWith("/app/")) return null;
  const parts = path.split("/").slice(1, 6).map((p) => (ID_LIKE.test(p) ? ":id" : p.replace(/[^a-z0-9_-]/g, "")));
  const area = "/" + parts.filter(Boolean).join("/");
  return /^\/[a-z0-9/:_-]{0,79}$/.test(area) ? area : null;
}

// friendly names for the admin page
const NAMES = [
  [/^\/app$/, "Dashboard"],
  [/^\/app\/invoices\/new$/, "New invoice"], [/^\/app\/quotes\/new$/, "New quote"],
  [/^\/app\/(invoices|quotes)\/:id\/edit$/, "Editing a document"],
  [/^\/app\/(invoices|quotes|receipts)\/:id/, "Viewing a document"],
  [/^\/app\/invoices/, "Invoices"], [/^\/app\/quotes/, "Quotes"], [/^\/app\/receipts/, "Receipts"],
  [/^\/app\/customers/, "Customers"], [/^\/app\/payments/, "Payments & receipts"], [/^\/app\/tax/, "Tax"],
  [/^\/app\/feedback/, "Ideas & help"], [/^\/app\/settings\/billing/, "Plan & billing"], [/^\/app\/settings/, "Settings"],
];
export function areaName(area) {
  for (const [re, name] of NAMES) if (re.test(area)) return name;
  return area.replace(/^\/app\/?/, "") || "Dashboard";
}

// "1h 05m", "12m", "45s"
export function duration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

// rows of { user_id, business_id, day, area, seconds } → the admin summaries
export function summarizeUsage(rows, { businesses = {} } = {}) {
  const byArea = new Map(), byBusiness = new Map(), byDay = new Map(), people = new Set(), personDays = new Set();
  let total = 0;
  for (const r of rows || []) {
    const s = Number(r.seconds) || 0;
    total += s;
    people.add(r.user_id);
    personDays.add(`${r.user_id}|${r.day}`);
    const name = areaName(r.area);
    byArea.set(name, (byArea.get(name) || 0) + s);
    const b = byBusiness.get(r.business_id) || { id: r.business_id, name: businesses[r.business_id] || "Unknown business", seconds: 0, people: new Set(), last: r.day };
    b.seconds += s; b.people.add(r.user_id); if (r.day > b.last) b.last = r.day;
    byBusiness.set(r.business_id, b);
    const d = byDay.get(r.day) || { day: r.day, seconds: 0, people: new Set() };
    d.seconds += s; d.people.add(r.user_id);
    byDay.set(r.day, d);
  }
  return {
    totalSeconds: total,
    people: people.size,
    avgPerPersonDay: personDays.size ? Math.round(total / personDays.size) : 0,
    areas: [...byArea].map(([name, seconds]) => ({ name, seconds, share: total ? seconds / total : 0 })).sort((a, b) => b.seconds - a.seconds),
    businesses: [...byBusiness.values()].map((b) => ({ id: b.id, name: b.name, seconds: b.seconds, people: b.people.size, last: b.last })).sort((a, b) => b.seconds - a.seconds),
    days: [...byDay.values()].map((d) => ({ day: d.day, seconds: d.seconds, people: d.people.size })).sort((a, b) => (a.day < b.day ? -1 : 1)),
  };
}
