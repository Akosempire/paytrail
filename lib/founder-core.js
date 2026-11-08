// Plain-language helpers for the founder dashboard (app/founder). Pure: tested in node.
import { formatMoney } from "./money.js";

export const GATEWAYS = { bachs: "Bachs", flutterwave: "Flutterwave", paystack: "Paystack", stripe: "Stripe", manual: "None (recorded by hand)" };
const METHODS = { ...GATEWAYS, manual: "Recorded by hand", bank_transfer: "Bank transfer", admin: "Recorded by hand", free: "Free access" };

export const gatewayName = (p) => GATEWAYS[p] || (p ? p[0].toUpperCase() + p.slice(1) : "Not set up");
export const methodName = (m) => METHODS[m] || (m ? m.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Other");

// "₦1,200 + $40" for money in several currencies; NGN first
export function moneyText(map, empty = "₦0") {
  const entries = Object.entries(map || {}).filter(([, v]) => Number(v) > 0).sort(([a], [b]) => (a === "NGN" ? -1 : b === "NGN" ? 1 : a.localeCompare(b)));
  return entries.length ? entries.map(([c, v]) => formatMoney(Number(v), c)).join(" + ") : empty;
}

// the main currency's figure (for charts and month-on-month change)
export const mainAmount = (map, currency = "NGN") => Number((map || {})[currency] || 0);

// change against last month, as a trend pill: null when there's nothing to compare
export function change(now, before) {
  now = Number(now || 0); before = Number(before || 0);
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return null;
  return { value: `${Math.abs(pct)}% vs last month`, direction: pct > 0 ? "up" : "down" };
}

// is the gateway taking real money? one status for a non-technical reader
export function gatewayStatus(g) {
  if (!g || !g.provider || g.provider === "manual") return { tone: "neutral", label: "Not set up", text: "Plan payments are recorded by hand. An admin can connect a payment gateway." };
  if (!g.connected) return { tone: "warn", label: "Not connected", text: `${gatewayName(g.provider)} is chosen but not connected yet, so customers can't pay online. An admin needs to finish setting it up.` };
  if (g.mode === "test") return { tone: "warn", label: "Test mode", text: `${gatewayName(g.provider)} is in test mode: payments made now are not real money.` };
  return { tone: "success", label: "Receiving payments", text: `Customers pay for Usetally plans through ${gatewayName(g.provider)}, straight into Usetally's account.` };
}

// share of this month's checkouts that ended in a payment
export function successRate(c) {
  const done = Number(c?.paid || 0) + Number(c?.unfinished || 0);
  return done ? Math.round((Number(c.paid || 0) / done) * 100) : null;
}

// "₦1.2m", "₦560k": fits under a bar on a phone
export function shortMoney(minor, currency = "NGN") {
  const v = Number(minor || 0) / 100;
  const sym = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" }[currency] ?? `${currency} `;
  if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}m`;
  if (v >= 1e3) return `${sym}${Math.round(v / 1e3)}k`;
  return `${sym}${Math.round(v)}`;
}

export const monthLabel = (ym) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
