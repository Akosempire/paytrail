// TrackOja POS ↔ Usetally (docs/POS_CONNECT.md): the pure parts, so they can
// be tested. Keys, one-time codes, return_to checks, and checking and tidying
// what TrackOja sends before the database sees it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { formatMoney } from "./money.js";

export const KEY_PREFIX = "utpos_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_RE = /^utpos_[0-9A-Za-z]{40}$/;
const CODE_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url
const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// utpos_ + 40 base62 characters (unbiased: bytes ≥ 248 are skipped)
export function generateKey(random = randomBytes) {
  let out = "";
  while (out.length < 40) {
    for (const b of random(48)) {
      if (b < 248 && out.length < 40) out += BASE62[b % 62];
    }
  }
  return KEY_PREFIX + out;
}

export const isKey = (v) => typeof v === "string" && KEY_RE.test(v);
export const hashSecret = (v) => createHash("sha256").update(String(v)).digest("hex");
export const keyHint = (key) => String(key || "").slice(-4);

export function sameHash(a, b) {
  const x = Buffer.from(String(a || ""), "utf8"), y = Buffer.from(String(b || ""), "utf8");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// "Bearer utpos_…" → the key, or null when it isn't one of ours
export function bearerKey(header) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(header || ""));
  return m && isKey(m[1]) ? m[1] : null;
}

export const newLinkCode = (random = randomBytes) => random(32).toString("base64url");
export const isLinkCode = (v) => typeof v === "string" && CODE_RE.test(v);

// ---- where the approval page may send the browser back to ----

export const DEFAULT_RETURN_ORIGINS = "https://trackoja.cv,http://localhost:5173,http://127.0.0.1:5173";

export function returnOrigins(env = DEFAULT_RETURN_ORIGINS) {
  return String(env || DEFAULT_RETURN_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean).flatMap((s) => {
    try {
      const u = new URL(s);
      return /^https?:$/.test(u.protocol) && !u.username && !u.password ? [u.origin] : [];
    } catch { return []; }
  });
}

// the full return_to URL when its origin is exactly one we allow, else null.
// (A plain "starts with" test would let https://trackoja.cv.evil.example in.)
export function checkReturnTo(value, origins) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2000) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (!origins.includes(u.origin)) return null;
  u.hash = "";
  return u.toString();
}

// return_to with ?code=…&state=… (or ?error=…&state=…) added
export function returnUrl(returnTo, params) {
  const u = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

// TrackOja's random state, sent back untouched: printable, no spaces, ≤ 256
export function cleanState(v) {
  const s = String(v ?? "").trim();
  return s && s.length <= 256 && /^[\x21-\x7e]+$/.test(s) ? s : null;
}

export function cleanText(v, max) {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// ---- POST /api/pos/link ----

// TrackOja's Edge Functions base, e.g. https://<ref>.supabase.co/functions/v1.
// https only (plain http for localhost while developing), no query or fragment.
export function cleanCallbackBase(value, { allowLocal = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 300) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.username || u.password || u.search || u.hash) return null;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  if (local && !allowLocal) return null;
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  // no bare IP addresses: the server calls this URL with the key
  if (!local && (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.startsWith("["))) return null;
  return (u.origin + u.pathname).replace(/\/+$/, "");
}

export function validateLink(body, opts) {
  if (!body || typeof body !== "object") return { error: "Send a JSON body" };
  if (!isLinkCode(body.code)) return { error: "Code is invalid or expired" };
  if (!UUID_RE.test(String(body.store_id || ""))) return { error: "store_id must be a uuid" };
  const callback_base = cleanCallbackBase(body.callback_base, opts);
  if (!callback_base) return { error: "callback_base must be an https URL" };
  return { ok: true, value: { code: body.code, store_id: String(body.store_id).toLowerCase(), store_name: cleanText(body.store_name, 120), callback_base } };
}

// ---- POST /api/pos/sales ----

export const PAYMENT_METHODS = { cash: "cash", card: "pos", transfer: "bank_transfer", other: "other" };
const MAX_MINOR = 1e14; // ₦1 trillion: well inside bigint and a JS safe integer
const isMinor = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_MINOR;
const minorOr = (v, fallback) => (v === undefined || v === null ? fallback : v);
const cleanEmail = (v) => { const e = cleanText(v, 200).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; };

// Checks a sale from TrackOja and turns it into what pos_import_sale expects.
// { ok, sale } or { error } (→ 422). The money must add up: items, tax and
// discounts to TrackOja's total; the payments, less change, to no more than it.
export function normalizeSale(body, { currency } = {}) {
  const bad = (error) => ({ error });
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Send the sale as a JSON object");
  if (!ID_RE.test(String(body.id ?? ""))) return bad("id is missing or not an id");
  const cur = String(body.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return bad("currency must be a 3-letter code");
  if (currency && cur !== currency) return bad(`This sale is in ${cur}, but this Usetally business records ${currency}`);
  const when = new Date(String(body.created_at || ""));
  if (!body.created_at || Number.isNaN(when.getTime()) || when.getFullYear() < 2000 || when.getTime() > Date.now() + 86400000) return bad("created_at must be an ISO date and time");

  if (!Array.isArray(body.items) || body.items.length === 0) return bad("A sale needs at least one item");
  if (body.items.length > 200) return bad("A sale can have at most 200 items");
  const items = [];
  for (const [n, it] of body.items.entries()) {
    const at = `Item ${n + 1}`;
    if (!it || typeof it !== "object") return bad(`${at} is not an object`);
    const qty = Number(it.quantity), unit = it.unit_price_minor, disc = minorOr(it.discount_minor, 0), tax = minorOr(it.tax_minor, 0);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) return bad(`${at}: quantity must be more than 0`);
    if (!isMinor(unit)) return bad(`${at}: unit_price_minor must be a whole number of minor units`);
    if (!isMinor(disc) || !isMinor(tax)) return bad(`${at}: discount_minor and tax_minor must be whole numbers of minor units`);
    const lineSub = Math.round(qty * unit);
    if (disc > lineSub) return bad(`${at}: the discount is more than the line`);
    if (it.product_id != null && it.product_id !== "" && !ID_RE.test(String(it.product_id))) return bad(`${at}: product_id is not an id`);
    // Usetally keeps two decimals of quantity: 2.375 kg becomes one line of the full amount
    const whole = Math.abs(qty * 100 - Math.round(qty * 100)) < 1e-6;
    const sku = cleanText(it.sku, 60);
    items.push({
      product_id: it.product_id ? String(it.product_id) : null,
      name: cleanText(it.name, 300) || "Item",
      details: [sku && `SKU ${sku}`, !whole && `${+qty.toFixed(6)} × ${formatMoney(unit, cur)}`].filter(Boolean).join(" · "),
      quantity: whole ? Math.round(qty * 100) / 100 : 1,
      unit_price_minor: whole ? unit : lineSub,
      discount_minor: disc,
      tax_minor: tax,
    });
  }

  const tax = body.tax_minor, total = body.total_minor;
  if (!isMinor(tax) || !isMinor(total)) return bad("tax_minor and total_minor must be whole numbers of minor units");
  const sub = items.reduce((s, i) => s + Math.round(i.quantity * i.unit_price_minor), 0);
  const discount = sub + tax - total;
  if (discount < 0 || discount > sub) return bad("The total doesn't match the items, discount and tax");

  const pays = body.payments ?? [];
  if (!Array.isArray(pays) || pays.length > 20) return bad("payments must be a list of at most 20");
  let change = minorOr(body.change_minor, 0);
  if (!isMinor(change)) return bad("change_minor must be a whole number of minor units");
  const taken = [];
  let credit = 0;
  for (const [n, p] of pays.entries()) {
    if (!p || typeof p !== "object") return bad(`Payment ${n + 1} is not an object`);
    if (!isMinor(p.amount_minor)) return bad(`Payment ${n + 1}: amount_minor must be a whole number of minor units`);
    if (p.method === "credit") { credit += p.amount_minor; continue; }
    if (!PAYMENT_METHODS[p.method]) return bad(`Payment ${n + 1}: method must be cash, card, transfer, credit or other`);
    taken.push({ method: PAYMENT_METHODS[p.method], amount_minor: p.amount_minor, reference: cleanText(p.reference, 120), cash: p.method === "cash" });
  }
  // change comes out of cash first, then the other payments
  for (const pass of [true, false]) {
    for (const p of taken) {
      if (change > 0 && p.cash === pass) { const c = Math.min(change, p.amount_minor); p.amount_minor -= c; change -= c; }
    }
  }
  if (change > 0) return bad("change_minor is more than what was paid");
  const payments = taken.filter((p) => p.amount_minor > 0).map(({ cash, ...p }) => p);
  const paid = payments.reduce((s, p) => s + p.amount_minor, 0);
  if (paid > total) return bad("The payments are more than the sale total");

  const c = body.customer && typeof body.customer === "object" ? body.customer : null;
  const customer = c && cleanText(c.name, 120) ? { name: cleanText(c.name, 120), phone: cleanText(c.phone, 40), email: cleanEmail(c.email) } : null;
  return {
    ok: true,
    sale: {
      id: String(body.id),
      number: cleanText(body.number, 40),
      created_at: when.toISOString(),
      currency: cur,
      store_name: cleanText(body.store?.name, 120),
      cashier: cleanText(body.cashier, 80),
      customer,
      items,
      tax_minor: tax,
      total_minor: total,
      payments,
    },
    summary: { subtotal_minor: sub, discount_minor: discount, paid_minor: paid, credit_minor: credit, balance_minor: total - paid },
  };
}

// ---- TrackOja's catalog (GET <base>/usetally-catalog) ----

// keeps only what the editor needs, tidied; bad rows are dropped
export function cleanCatalog(data, limit = 50) {
  const list = Array.isArray(data?.products) ? data.products : [];
  const out = [];
  for (const p of list) {
    if (out.length >= limit) break;
    if (!p || !ID_RE.test(String(p.id ?? ""))) continue;
    const price = Number(p.price_minor);
    const name = cleanText(p.name, 300);
    if (!name || !Number.isSafeInteger(price) || price < 0 || price > MAX_MINOR) continue;
    const stock = Number(p.stock_qty);
    out.push({ id: String(p.id), name, sku: cleanText(p.sku, 60), unit: cleanText(p.unit, 20), price_minor: price,
      stock_qty: Number.isFinite(stock) ? stock : null, track_inventory: Boolean(p.track_inventory) });
  }
  return out;
}

// retry a failed stock update after 1, 5, 15, 60 minutes, then every 6 hours
export function nextAttemptDelayMs(attempts) {
  return ([1, 5, 15, 60][attempts - 1] ?? 360) * 60000;
}
export const MAX_STOCK_ATTEMPTS = 20;
