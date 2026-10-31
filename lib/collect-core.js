// Getting paid: what each unpaid invoice needs, in words, and the order to
// chase them in. Used by the dashboard's Collect queue, the invoices list and
// the invoice page. Pure functions (no React, no database), so they're tested
// in node. Dates are "YYYY-MM-DD" strings in the business's day.
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const OPEN_INVOICE = ["sent", "viewed", "partially_paid"];

const dayNum = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 864e5);
export const todayIso = (now = new Date()) => new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const balanceOf = (doc) => Math.max(0, Number(doc.total_minor || 0) - Number(doc.amount_paid_minor || 0));
export const isOpenInvoice = (doc) => doc.kind === "invoice" && OPEN_INVOICE.includes(doc.status);

// whole days from today to the due date: negative = overdue
export function dueIn(doc, today) {
  if (!doc.due_date) return null;
  return dayNum(doc.due_date) - dayNum(today);
}

// "today", "yesterday", "3 days ago", or a date
export function relativeDay(iso, today) {
  if (!iso) return "";
  const n = dayNum(today) - dayNum(iso);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 7) return `${n} days ago`;
  return formatDate(String(iso).slice(0, 10), { day: "numeric", month: "short" });
}

const dueWords = (n) => (n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : n > 1 ? `Due in ${n} days` : `${-n} day${n === -1 ? "" : "s"} overdue`);

// What an invoice's status means for getting paid, in a few words.
// tone: danger (overdue) · warn (due within 3 days, or viewed and not paid) · info · neutral · success
export function collectStatus(doc, today) {
  if (doc.status === "draft" || doc.status === "pending_approval") return { text: doc.status === "draft" ? "Draft · not sent" : "Waiting for approval", tone: "neutral" };
  if (doc.status === "void") return { text: "Cancelled", tone: "neutral" };
  if (doc.status === "paid") return { text: doc.paid_at ? `Paid ${relativeDay(doc.paid_at, today)}` : "Paid", tone: "success" };
  if (doc.kind === "quote") {
    if (doc.status === "accepted") return { text: "Accepted · ready to invoice", tone: "success" };
    if (doc.status === "declined") return { text: "Declined", tone: "neutral" };
    return doc.viewed_at ? { text: `Viewed ${relativeDay(doc.viewed_at, today)} · no answer yet`, tone: "info" } : { text: "Sent · not opened yet", tone: "neutral" };
  }
  const n = dueIn(doc, today);
  if (n != null && n < 0) return { text: dueWords(n), tone: "danger" };
  if (doc.status === "partially_paid") return { text: `Part paid${n != null ? ` · ${dueWords(n).toLowerCase()}` : ""}`, tone: n != null && n <= 3 ? "warn" : "info" };
  if (n != null && n <= 3) return { text: dueWords(n), tone: "warn" };
  if (doc.status === "viewed") return { text: `Viewed ${doc.viewed_at ? relativeDay(doc.viewed_at, today) : ""}, not paid`.replace(" ,", ","), tone: "warn" };
  return { text: n != null ? `${dueWords(n)} · not opened yet` : "Sent · not opened yet", tone: "info" };
}

// overdue first (most overdue first), then due soonest, then the largest balance
export function urgencySort(docs, today) {
  const key = (d) => {
    const n = dueIn(d, today);
    return [n != null && n < 0 ? 0 : 1, n == null ? 1e9 : n, -balanceOf(d)];
  };
  return [...docs].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return String(a.number || "").localeCompare(String(b.number || ""));
  });
}

// "₦9,300,000 owed by 2 customers. Next due 6 Nov."
export function collectSummary(docs, today, currency) {
  const open = docs.filter(isOpenInvoice);
  const total = open.reduce((s, d) => s + balanceOf(d), 0);
  const customers = new Set(open.map((d) => d.customer_id || d.customer_name)).size;
  const overdue = open.filter((d) => (dueIn(d, today) ?? 1) < 0);
  const next = open.map((d) => d.due_date).filter((d) => d && d >= today).sort()[0];
  return {
    count: open.length, total, customers, overdueCount: overdue.length, overdueTotal: overdue.reduce((s, d) => s + balanceOf(d), 0), nextDue: next || null,
    text: open.length
      ? `${formatMoney(total, currency)} owed by ${customers} customer${customers === 1 ? "" : "s"}.${overdue.length ? ` ${overdue.length} overdue.` : ""}${next ? ` Next due ${formatDate(next, { day: "numeric", month: "short" })}.` : ""}`
      : "Nothing owed to you right now.",
  };
}

// a short, friendly reminder for WhatsApp or email
export function reminderText(doc, businessName, link, today) {
  const first = String(doc.customer_name || "").trim().split(/\s+/)[0] || "there";
  const amount = formatMoney(balanceOf(doc), doc.currency);
  const n = dueIn(doc, today);
  const when = n == null ? "" : n < 0 ? ` was due ${formatDate(doc.due_date)}` : n === 0 ? " is due today" : ` is due ${formatDate(doc.due_date)}`;
  return `Hello ${first}, a friendly reminder that invoice ${doc.number} from ${businessName} for ${amount}${when}.${link ? ` You can view and pay it here: ${link}` : ""}\n\nThank you.`;
}

// "Draft → Send · Edit; Sent/Viewed → Remind · Record payment; Paid → Receipt"
export function rowActions(doc) {
  if (doc.status === "draft" || doc.status === "pending_approval") return ["send", "edit"];
  if (doc.kind === "invoice" && OPEN_INVOICE.includes(doc.status)) return ["remind", "record"];
  if (doc.status === "paid") return ["receipt"];
  return [];
}
