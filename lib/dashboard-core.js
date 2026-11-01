// The dashboard's "money story": this month's money as one picture, and the
// single most useful thing to do next. Pure, tested in node.
import { formatMoney } from "@/lib/money";
import { balanceOf, dueIn, urgencySort } from "@/lib/collect-core";

// collected | owed (not yet due) | overdue, as shares of everything in play
export function moneyFlow({ collected = 0, outstanding = 0, overdue = 0 }) {
  const c = Math.max(0, Number(collected) || 0);
  const od = Math.max(0, Math.min(Number(overdue) || 0, Number(outstanding) || 0));
  const owed = Math.max(0, (Number(outstanding) || 0) - od);
  const total = c + owed + od;
  if (!total) return { total: 0, parts: [] };
  const pct = (v) => Math.round((v / total) * 1000) / 10;
  return {
    total,
    parts: [
      { key: "collected", minor: c, pct: pct(c) },
      { key: "owed", minor: owed, pct: pct(owed) },
      { key: "overdue", minor: od, pct: pct(od) },
    ].filter((p) => p.minor > 0),
  };
}

const days = (n) => `${n} day${n === 1 ? "" : "s"}`;

// what to do next, most valuable first: confirm money that may already be in
// the bank, chase overdue money, turn yes into an invoice, sign off drafts,
// nudge what's due soon; otherwise, all caught up
export function nextAction({ claims = [], unpaid = [], accepted = [], approvals = [], today, perms = {} }) {
  const money = (m, c) => formatMoney(m, c);
  if (claims.length && perms.canRecord !== false) {
    const c = claims[0];
    return { kind: "claim", href: `/app/documents/${c.document_id}`, cta: "Check and confirm",
      title: `Confirm ${c.payer_name || "a customer"}'s ${money(c.amount_minor, c.currency)} transfer`,
      detail: `For ${c.documents?.number || "an invoice"}. Check your bank, then confirm it to send their receipt.` };
  }
  const queue = urgencySort(unpaid, today);
  const late = queue.find((d) => { const n = dueIn(d, today); return n != null && n < 0; });
  if (late && perms.canSend !== false) {
    return { kind: "remind", doc: late,
      title: `Remind ${late.customer_company || late.customer_name || "your customer"}`,
      detail: `${money(balanceOf(late), late.currency)} on ${late.number} · ${days(-dueIn(late, today))} overdue` };
  }
  if (accepted.length && perms.canConvert !== false) {
    const q = accepted[0];
    return { kind: "convert", href: `/app/documents/${q.id}`, cta: "Make the invoice",
      title: `Turn ${q.number} into an invoice`, detail: `${q.customer_name} said yes to ${money(q.total_minor, q.currency)}.` };
  }
  if (approvals.length && perms.canApprove) {
    const a = approvals[0];
    return { kind: "approve", href: `/app/documents/${a.id}`, cta: "Review",
      title: approvals.length === 1 ? `Approve ${a.number}` : `Approve ${approvals.length} drafts`,
      detail: `${a.customer_name} · ${money(a.total_minor, a.currency)} is waiting for your sign-off.` };
  }
  const soon = queue.find((d) => { const n = dueIn(d, today); return n != null && n >= 0 && n <= 3; });
  if (soon && perms.canSend !== false) {
    const n = dueIn(soon, today);
    return { kind: "remind", doc: soon,
      title: `Give ${soon.customer_company || soon.customer_name || "your customer"} a friendly nudge`,
      detail: `${money(balanceOf(soon), soon.currency)} on ${soon.number} is due ${n === 0 ? "today" : `in ${days(n)}`}.` };
  }
  return { kind: "clear", href: "/app/quotes/new", cta: "New quote", title: "You're all caught up",
    detail: unpaid.length ? "Nothing overdue. Your customers' links are out there working." : "Nothing waiting on you. A good moment to send a quote." };
}

// the month in Lagos time, e.g. "November"
export function monthName(now = new Date()) {
  return now.toLocaleString("en-GB", { month: "long", timeZone: "Africa/Lagos" });
}

// Recent activity, without the repetition: back-to-back events on the same
// document by the same person become one line ("created and sent QT-0002").
const VERB = {
  "document.created": "created", "document.updated": "edited", "document.submitted": "sent for approval",
  "document.approved_and_sent": "approved and sent", "document.sent": "sent", "document.emailed": "emailed",
  "document.shared": "shared", "document.viewed": "opened", "document.reminder_sent": "reminded the customer about",
  "document.voided": "voided", "quote.accepted": "accepted", "quote.declined": "declined", "quote.converted": "converted",
  "payment.recorded": "recorded a payment on",
};
export function activityKind(a) {
  if (/^(payment|receipt)\./.test(a.action)) return "payments";
  const k = a.documents?.kind;
  return k === "quote" ? "quotes" : k === "invoice" ? "invoices" : "other";
}
export function groupActivity(rows = []) {
  const out = [];
  for (const a of rows) {
    const prev = out[out.length - 1];
    const verb = VERB[a.action];
    if (prev && verb && prev.verbs && a.document_id && prev.document_id === a.document_id && prev.actor_label === a.actor_label && !prev.verbs.includes(verb)) {
      prev.verbs.push(verb);
      continue;
    }
    out.push({ ...a, kind: activityKind(a), verbs: verb && a.document_id ? [verb] : null });
  }
  // rows come newest first, so verbs read backwards: "sent" then "created" → "created and sent"
  for (const g of out) if (g.verbs) g.verbs.reverse();
  return out;
}
export const joinVerbs = (verbs) => (verbs.length < 2 ? verbs[0] : `${verbs.slice(0, -1).join(", ")} and ${verbs[verbs.length - 1]}`);
