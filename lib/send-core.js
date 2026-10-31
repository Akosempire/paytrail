// The send sheet: the pure parts (tested in tests/send.test.mjs).
import { formatMoney } from "./money.js";
import { formatDate } from "./format.js";

export const UNDO_SECONDS = 10;
export const CHANNELS = ["email", "whatsapp", "link", "qr", "pdf"];
export const CHANNEL_LABEL = { email: "by email", whatsapp: "on WhatsApp", link: "by link", qr: "by QR code", pdf: "as a PDF", share: "from the share menu" };

// The variables a message can use. The same names as reminders (Settings →
// Reminders), so one way of writing works everywhere.
export const VARIABLES = [
  { key: "client", label: "Client's first name" },
  { key: "amount", label: "Amount due" },
  { key: "due_date", label: "Due date" },
  { key: "number", label: "Invoice number" },
  { key: "link", label: "Link to view and pay" },
  { key: "business", label: "Your business name" },
];

export const DEFAULT_MESSAGE = {
  invoice: "Hello {client},\n\nHere is invoice {number} for {amount}, due {due_date}.\n\nYou can view and pay it here: {link}\n\nThank you,\n{business}",
  quote: "Hello {client},\n\nHere is our quotation {number} for {amount}.\n\nYou can view and accept it here: {link}\n\nThank you,\n{business}",
};

export function defaultSubject(doc, businessName) {
  return `${doc.kind === "quote" ? "Quotation" : "Invoice"} ${doc.number} from ${businessName}`;
}

// {client} {amount} {due_date} {number} {link} {business}; unknown names stay as written
export function fillTemplate(template, vars) {
  return String(template || "").replace(/\{(client|amount|due_date|number|link|business)\}/g, (m, k) => (vars[k] == null || vars[k] === "" ? (k === "due_date" ? "on receipt" : m) : String(vars[k])));
}

export function sendVars(doc, businessName, link) {
  const due = doc.kind === "quote" ? Number(doc.total_minor || 0) : Number(doc.total_minor || 0) - Number(doc.amount_paid_minor || 0);
  return {
    client: String(doc.customer_name || "").trim().split(/\s+/)[0] || "there",
    amount: formatMoney(due, doc.currency),
    due_date: doc.due_date ? formatDate(doc.due_date) : "",
    number: doc.number,
    link,
    business: businessName || "",
  };
}

// emails typed in a CC box: "a@b.co, c@d.co; e@f.co" → clean, unique, lower-case
const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]{2,}$/;
export const looksLikeEmail = (v) => EMAIL.test(String(v || "").trim());
export function parseEmails(text, { not = [] } = {}) {
  const skip = new Set(not.map((x) => String(x || "").trim().toLowerCase()));
  const out = [], bad = [];
  for (const raw of String(text || "").split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e || skip.has(e) || out.includes(e)) continue;
    (EMAIL.test(e) ? out : bad).push(e);
  }
  return { emails: out, bad };
}

// can "Undo" still stop it? (a second of slack for the round trip)
export function undoOpen(sendAfter, now = Date.now()) {
  const t = new Date(sendAfter).getTime();
  return Number.isFinite(t) && now < t - 1000;
}
export function secondsLeft(sendAfter, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(sendAfter).getTime() - now) / 1000));
}

// Repeats. weekly: +7 days. monthly: the same day next month, or that month's
// last day (31 Jan → 28/29 Feb → 31 Mar). Dates are "YYYY-MM-DD".
// Mirrors public.next_recurrence() in the database.
export function nextRecurrence(date, interval, anchorDay) {
  const [y, m, d] = String(date).split("-").map(Number);
  if (interval === "weekly") return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay || d, last))).toISOString().slice(0, 10);
}
export function upcoming(date, interval, count = 3) {
  const out = [date];
  const anchor = Number(String(date).slice(8, 10));
  while (out.length < count) out.push(nextRecurrence(out[out.length - 1], interval, anchor));
  return out;
}

// What the QR code holds: the public link and nothing else, so any phone
// camera opens the invoice. Only http(s) links are encoded.
export function qrPayload(link) {
  const s = String(link || "").trim();
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!["https:", "http:"].includes(u.protocol)) return null;
  return u.toString();
}

export function whatsappText(doc, businessName, link) {
  const v = sendVars(doc, businessName, link);
  return doc.kind === "quote"
    ? `Hello ${v.client}, here is our quotation ${v.number} from ${v.business} for ${v.amount}: ${link}`
    : `Hello ${v.client}, here is invoice ${v.number} from ${v.business} for ${v.amount}${v.due_date ? `, due ${v.due_date}` : ""}. You can view and pay it here: ${link}`;
}
export function whatsappUrl(phone, text) {
  const digits = String(phone || "").replace(/[^\d]/g, "").replace(/^0(\d{10})$/, "234$1");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// The next reminder for an unpaid invoice, from the reminder rules (Settings →
// Reminders) and what was already sent. null when there is none to show.
export function nextReminder({ dueDate, rules, sentRuleIds = [], today }) {
  if (!dueDate || !Array.isArray(rules)) return null;
  const sent = new Set(sentRuleIds);
  const dates = rules.filter((r) => r.enabled !== false && !sent.has(r.id)).map((r) => {
    const d = new Date(`${dueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Math.round(Number(r.offset_days) || 0));
    return d.toISOString().slice(0, 10);
  }).filter((d) => d >= today).sort();
  return dates[0] || null;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// the email body: paragraphs from the message, with the link line left out
// (the email has its own button for it)
export function messageParagraphs(message, link) {
  return String(message || "").replace(/\r\n/g, "\n").split(/\n{2,}/)
    .map((p) => p.split("\n").filter((line) => !(link && line.trim() === link) && !/^(you can )?(view|pay|open)[^:]*:\s*https?:\/\/\S+$/i.test(line.trim())).join("\n").trim())
    .filter(Boolean);
}
