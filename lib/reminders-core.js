// Invoice reminders: the pure parts (tested in tests/invoice-lists.test.mjs).
import { formatMoney } from "./money.js";
import { formatDate } from "./format.js";

// "-3" → "3 days before the due date", "0" → "On the due date", "7" → "7 days after"
export function reminderWhen(offset) {
  const n = Math.round(Number(offset) || 0);
  if (n === 0) return "On the due date";
  const days = `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`;
  return n < 0 ? `${days} before the due date` : `${days} after the due date`;
}

// the date a rule fires for an invoice due on dueDate (YYYY-MM-DD)
export function reminderDate(dueDate, offset) {
  const d = new Date(`${dueDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(Number(offset) || 0));
  return d.toISOString().slice(0, 10);
}

// {client} {amount} {due_date} {number} {link} {business}; unknown names stay as written
export function fillTemplate(template, vars) {
  return String(template || "").replace(/\{(client|amount|due_date|number|link|business)\}/g, (m, k) => (vars[k] ?? m));
}

export function reminderVars(doc, business, link) {
  const due = Number(doc.total_minor || 0) - Number(doc.amount_paid_minor || 0);
  return {
    client: String(doc.customer_name || "").trim().split(/\s+/)[0] || "there",
    amount: formatMoney(due, doc.currency),
    due_date: doc.due_date ? formatDate(doc.due_date) : "",
    number: doc.number,
    link,
    business: business?.name || "",
  };
}

// checks a rule from the settings form → { ok, value } or { error }
export function checkRule({ offset_days, subject, message, enabled }) {
  const n = Number(offset_days);
  if (!Number.isInteger(n) || n < -30 || n > 90) return { error: "Choose between 30 days before and 90 days after the due date." };
  const s = String(subject ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const msg = String(message ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
  if (!s) return { error: "Add a subject." };
  if (!msg) return { error: "Add a message." };
  if (!msg.includes("{link}")) return { error: "Keep {link} in the message so your client can open and pay the invoice." };
  return { ok: true, value: { offset_days: n, subject: s, message: msg, enabled: enabled !== false } };
}

// a document is overdue when unpaid and past its due date (Lagos day)
export function isOverdueOn(doc, today) {
  return doc.kind !== "quote" && ["sent", "viewed", "partially_paid"].includes(doc.status) && Boolean(doc.due_date) && doc.due_date < today;
}

// Invoice list summary per currency: outstanding, overdue, paid this month
export function invoiceSummary(rows, { today, monthStart }) {
  const out = {};
  const bucket = (c) => (out[c] ||= { currency: c, outstanding: 0, overdue: 0, overdueCount: 0, paidThisMonth: 0 });
  for (const d of rows || []) {
    if (d.kind && d.kind !== "invoice") continue;
    const b = bucket(d.currency || "NGN");
    const balance = Math.max(0, Number(d.total_minor || 0) - Number(d.amount_paid_minor || 0));
    if (["sent", "viewed", "partially_paid"].includes(d.status)) {
      b.outstanding += balance;
      if (isOverdueOn(d, today)) { b.overdue += balance; b.overdueCount += 1; }
    }
    if (d.status === "paid" && d.paid_at && String(d.paid_at).slice(0, 10) >= monthStart) b.paidThisMonth += Number(d.total_minor || 0);
  }
  return out;
}

// the email that goes with a new invoice when the business hasn't written its own
// (businesses.email_template_invoice is empty)
export const DEFAULT_INVOICE_EMAIL = "Hi {client},\n\nHere is invoice {number} for {amount}, due on {due_date}. You can view and pay it here: {link}\n\nThank you.";
