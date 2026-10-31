// The quote/invoice builder: pure helpers (tested in tests/builder.test.mjs).
// Quantity maths, amount formatting, due-date sentences, email typo hints,
// and "what's missing before this can be sent".

// ---- quantity maths: "3*8", "2.5 + 1", "(4+2)/3" — no eval ------------------

// Returns a number, or null when the text isn't a simple sum.
export function evalQty(input) {
  const s = String(input ?? "").replace(/[x×]/gi, "*").replace(/÷/g, "/").replace(/,/g, "").replace(/\s+/g, "");
  if (!s) return null;
  if (!/^[\d.+\-*/()]+$/.test(s) || s.length > 40) return null;
  let i = 0;
  const peek = () => s[i];
  function number() {
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return Number(m[0]);
  }
  function factor() {
    if (peek() === "-") { i++; return -factor(); }
    if (peek() === "+") { i++; return factor(); }
    if (peek() === "(") { i++; const v = expr(); if (peek() !== ")") throw new Error(")"); i++; return v; }
    return number();
  }
  function term() {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++]; const r = factor();
      if (op === "/" && r === 0) throw new Error("div0");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch { return null; }
}

// what a quantity field counts as right now (maths or a plain number); 0 if unreadable
export const qtyValue = (input) => { const v = evalQty(input); return v != null && v > 0 ? v : 0; };

// ---- amounts ----------------------------------------------------------------

// "150000" → "150,000.00"; "1500.5" → "1,500.50"; anything unreadable is left as typed
export function formatAmountInput(input) {
  const text = String(input ?? "").replace(/[,\s]/g, "");
  if (!text) return "";
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return String(input);
  const [whole, frac = ""] = text.split(".");
  return `${Number(whole).toLocaleString("en-NG")}.${frac.padEnd(2, "0")}`;
}
// for editing: "150,000.00" → "150000"; "1,500.50" → "1500.50"
export function unformatAmountInput(input) {
  const text = String(input ?? "").replace(/,/g, "");
  return /^\d+\.00$/.test(text) ? text.slice(0, -3) : text;
}

// ---- dates ------------------------------------------------------------------

const DAY = 86400000;
const parse = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const addDaysIso = (iso, n) => new Date(parse(iso) + Number(n || 0) * DAY).toISOString().slice(0, 10);
export const daysBetween = (fromIso, toIso) => Math.round((parse(toIso) - parse(fromIso)) / DAY);
const short = (iso) => new Date(parse(iso)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// "Due in 14 days · Fri 14 Nov", "Due today · Fri 14 Nov", "Was due 3 days ago · …", "Due on receipt"
export function dueSentence(dueIso, todayIso, { quote = false, issueIso } = {}) {
  if (!dueIso) return "";
  const n = daysBetween(todayIso, dueIso);
  const when = short(dueIso);
  if (quote) {
    if (n < 0) return `Expired ${-n} day${n === -1 ? "" : "s"} ago · ${when}`;
    if (n === 0) return `Valid until today · ${when}`;
    return `Valid for ${n} day${n === 1 ? "" : "s"} · until ${when}`;
  }
  if (issueIso && dueIso === issueIso) return `Due on receipt · ${when}`;
  if (n < 0) return `Was due ${-n} day${n === -1 ? "" : "s"} ago · ${when}`;
  if (n === 0) return `Due today · ${when}`;
  return `Due in ${n} day${n === 1 ? "" : "s"} · ${when}`;
}
export const TERM_CHIPS = [[0, "On receipt"], [7, "7 days"], [14, "14 days"], [30, "30 days"]];
export const VALIDITY_CHIPS = [[7, "7 days"], [14, "14 days"], [30, "30 days"]];

// ---- email typos ------------------------------------------------------------

const DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "ymail.com", "live.com", "aol.com", "protonmail.com", "yahoo.co.uk", "googlemail.com"];
const TLD_FIX = { con: "com", cpm: "com", vom: "com", xom: "com", comm: "com", cm: "com", om: "com", co: null, ng: null };
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

// "ade@gmial.com" → "ade@gmail.com"; null when it looks fine or we can't tell
export function suggestEmail(input) {
  const v = String(input || "").trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const local = v.slice(0, at);
  let domain = v.slice(at + 1);
  if (!domain || DOMAINS.includes(domain)) return null;
  const dot = domain.lastIndexOf(".");
  if (dot > 0) {
    const tld = domain.slice(dot + 1);
    if (TLD_FIX[tld]) domain = `${domain.slice(0, dot)}.${TLD_FIX[tld]}`;
  } else {
    // "gmailcom" or "gmail"
    const bare = DOMAINS.find((d) => d.replace(".", "") === domain || d.split(".")[0] === domain);
    if (bare) return `${local}@${bare}`;
  }
  let best = null, bestD = 3;
  for (const d of DOMAINS) { const n = distance(domain, d); if (n < bestD) { best = d; bestD = n; } }
  const out = best && bestD <= 2 ? best : domain;
  const fixed = `${local}@${out}`;
  return fixed !== v ? fixed : null;
}

// ---- what's missing before sending -------------------------------------------

// { step, label, field } or null when it can go. field = the element id to focus.
export function missingStep({ hasCustomer, customerName, items, badPrice, quote = false, approval = false }) {
  const verb = approval ? "submit" : "send";
  if (!hasCustomer && !String(customerName || "").trim()) return { step: "customer", label: `Add a customer to ${verb}`, field: "customer-search" };
  const filled = (items || []).filter((i) => String(i.description || "").trim());
  if (!filled.length) return { step: "items", label: `Add an item to ${verb}`, field: "item-0-desc" };
  if (badPrice) return { step: "price", label: `Fix a price to ${verb}`, field: `item-${badPrice}-price` };
  return null;
}

// ---- customers ----------------------------------------------------------------

// recent first (by last document), then A–Z; matches name, company, email or phone
export function rankCustomers(customers, query, recentIds = []) {
  const q = String(query || "").trim().toLowerCase();
  const order = new Map(recentIds.map((id, i) => [id, i]));
  return (customers || [])
    .filter((c) => !q || [c.name, c.company, c.email, c.phone].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || String(a.name).localeCompare(String(b.name)));
}
