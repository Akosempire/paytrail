// Pure helpers for the AI assistants' tools (lib/ai/tools.js): amounts in and
// out, building a document payload the same way the app's builder does, and
// short summaries the assistant can read back to the person. Tested in node.
import { formatMoney } from "@/lib/money";

// assistants speak in whole amounts ("150000", 1500.5); Usetally stores kobo/cents
export function toMinorAmount(value) {
  const n = typeof value === "string" ? Number(value.replace(/[,\s₦$£€]/g, "")) : Number(value);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}
export const money = (minor, currency) => formatMoney(Number(minor) || 0, currency);

const pad = (n) => String(n).padStart(2, "0");
export function addDays(days, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export const today = (from = new Date()) => addDays(0, from);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(s));

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "unpaid" and "overdue" are what people say; these are the statuses behind them
export const OPEN = ["sent", "viewed", "partially_paid"];
export function statusFilter(status, todayStr = today()) {
  switch (status) {
    case undefined: case null: case "": case "all": return {};
    case "unpaid": return { in: OPEN };
    case "overdue": return { in: OPEN, dueBefore: todayStr };
    case "awaiting_approval": return { eq: "pending_approval" };
    default: return { eq: status };
  }
}

const STATUS_WORDS = {
  draft: "draft", pending_approval: "waiting for approval", sent: "sent", viewed: "viewed by the customer", accepted: "accepted",
  declined: "declined", partially_paid: "part paid", paid: "paid", void: "void",
};
export function statusWords(doc, todayStr = today()) {
  if (doc.kind === "invoice" && OPEN.includes(doc.status) && doc.due_date && doc.due_date < todayStr) return `overdue (was due ${doc.due_date})`;
  return STATUS_WORDS[doc.status] || doc.status;
}

// one line per document in lists
export function docLine(doc, todayStr) {
  const kind = doc.kind === "quote" ? "Quote" : "Invoice";
  const owed = doc.kind === "invoice" && OPEN.includes(doc.status) ? `, ${money(Number(doc.total_minor) - Number(doc.amount_paid_minor || 0), doc.currency)} still owed` : "";
  return `${kind} ${doc.number} · ${doc.customer_name || "No customer"}${doc.customer_company ? ` (${doc.customer_company})` : ""} · ${money(doc.total_minor, doc.currency)} · ${statusWords(doc, todayStr)}${owed}`;
}

export function links(site, doc) {
  const sent = !["draft", "pending_approval"].includes(doc.status);
  return {
    open_in_usetally: `${site}/app/documents/${doc.id}`,
    ...(sent && doc.access_token ? { customer_link: `${site}/d/${doc.access_token}`, pdf: `${site}/d/${doc.access_token}/pdf` } : {}),
  };
}

// the document as the assistant sees it
export function docView(site, doc, items = [], { payments = [], costs = null, todayStr } = {}) {
  const v = {
    id: doc.id, kind: doc.kind, number: doc.number, status: doc.status, status_in_words: statusWords(doc, todayStr), title: doc.title || "",
    customer: { name: doc.customer_name, company: doc.customer_company || "", email: doc.customer_email || "", phone: doc.customer_phone || "" },
    currency: doc.currency, issue_date: doc.issue_date, ...(doc.kind === "invoice" ? { due_date: doc.due_date } : { valid_until: doc.valid_until }),
    items: items.map((i) => ({ description: i.description, ...(i.details ? { details: i.details } : {}), quantity: Number(i.quantity), unit_price: money(i.unit_price_minor, doc.currency), amount: money(Math.round(Number(i.quantity) * Number(i.unit_price_minor)), doc.currency) })),
    subtotal: money(doc.subtotal_minor, doc.currency),
    ...(Number(doc.discount_minor) ? { discount: money(doc.discount_minor, doc.currency) } : {}),
    ...(Number(doc.tax_minor) ? { tax: `${money(doc.tax_minor, doc.currency)} (${doc.tax_label || "Tax"} ${Number(doc.tax_rate)}%)` } : {}),
    total: money(doc.total_minor, doc.currency),
    ...(doc.kind === "invoice" ? { paid: money(doc.amount_paid_minor, doc.currency), still_owed: money(Math.max(0, Number(doc.total_minor) - Number(doc.amount_paid_minor || 0)), doc.currency) } : {}),
    ...(doc.notes ? { notes: doc.notes } : {}),
    ...(payments.length ? { payments: payments.map((p) => ({ amount: money(p.amount_minor, p.currency || doc.currency), method: p.method, date: String(p.paid_at || p.created_at || "").slice(0, 10), reference: p.reference || "" })) } : {}),
    links: links(site, doc),
  };
  if (costs) {
    const spent = costs.reduce((s, c) => s + Number(c.amount_minor || 0), 0);
    v.hidden_costs = { total: money(spent, doc.currency), profit: money(Number(doc.subtotal_minor) - Number(doc.discount_minor || 0) - spent, doc.currency), lines: costs.map((c) => `${c.label}: ${money(c.amount_minor, doc.currency)}`) };
  }
  return v;
}

// builds the save_document payload from what the assistant sent, filling in
// the business's defaults the way the app's builder does
export function buildPayload(kind, input, business, { existing, existingItems, todayStr = today() } = {}) {
  const errors = [];
  const items = input.items ? input.items : existingItems?.map((i) => ({ description: i.description, details: i.details, quantity: Number(i.quantity), unit_price_minor: Number(i.unit_price_minor), vat_category: i.vat_category }));
  const cleanItems = (items || []).map((i, n) => {
    const minor = i.unit_price_minor != null ? Number(i.unit_price_minor) : toMinorAmount(i.unit_price);
    if (!String(i.description || "").trim()) errors.push(`Item ${n + 1} needs a description.`);
    if (!Number.isFinite(minor)) errors.push(`Item ${n + 1}: the price "${i.unit_price}" isn't a number.`);
    const qty = Number(i.quantity ?? 1);
    if (!(qty > 0)) errors.push(`Item ${n + 1}: the quantity must be more than 0.`);
    return { description: String(i.description || "").trim().slice(0, 300), details: String(i.details || "").slice(0, 1000), quantity: Math.round(qty * 100) / 100, unit_price_minor: Number.isFinite(minor) ? minor : 0, vat_category: ["zero", "exempt"].includes(i.vat) ? i.vat : ["zero", "exempt"].includes(i.vat_category) ? i.vat_category : "standard" };
  });
  if (!cleanItems.length) errors.push("Add at least one item.");
  const date = (k, fallbackDays) => {
    const v = input[k];
    if (v != null && v !== "") { if (!isDate(v)) errors.push(`${k} must be a date like ${todayStr}.`); return String(v); }
    if (existing) return existing[k] || "";
    return addDays(fallbackDays, new Date(`${todayStr}T00:00:00Z`));
  };
  const discount = input.discount != null ? toMinorAmount(input.discount) : Number(existing?.discount_minor || 0);
  if (!Number.isFinite(discount)) errors.push("The discount isn't a number.");
  const taxRate = input.tax_rate != null ? Number(input.tax_rate) : existing ? Number(existing.tax_rate || 0) : Number(business.tax_rate || 0);
  if (!(taxRate >= 0 && taxRate <= 100)) errors.push("The tax rate must be between 0 and 100.");
  const payload = {
    kind,
    title: String(input.title ?? existing?.title ?? "").slice(0, 200),
    issue_date: existing?.issue_date || todayStr,
    due_date: kind === "invoice" ? date("due_date", business.invoice_due_days ?? 14) : "",
    valid_until: kind === "quote" ? date("valid_until", business.quote_validity_days ?? 30) : "",
    discount_minor: Number.isFinite(discount) ? discount : 0,
    tax_rate: Math.round(taxRate * 1000) / 1000,
    tax_label: String(input.tax_label ?? existing?.tax_label ?? business.tax_label ?? "").slice(0, 30),
    notes: String(input.notes ?? existing?.notes ?? "").slice(0, 2000),
    terms: String(input.terms ?? existing?.terms ?? business.default_terms ?? "").slice(0, 2000),
    items: cleanItems,
  };
  // a second tax the business always charges (e.g. PST), on new documents
  if (!existing && Number(business.tax2_rate) > 0) { payload.tax2_rate = Number(business.tax2_rate); payload.tax2_label = String(business.tax2_label || "").slice(0, 30); }
  return { payload, errors };
}

// "obi foods" finds "Obi Foods Ltd": the customer the assistant meant, or none
export function pickCustomer(candidates, wanted) {
  const name = String(wanted?.name || "").trim().toLowerCase();
  const email = String(wanted?.email || "").trim().toLowerCase();
  if (email) { const byEmail = candidates.find((c) => String(c.email || "").toLowerCase() === email); if (byEmail) return byEmail; }
  if (!name) return null;
  const exact = candidates.filter((c) => c.name.toLowerCase() === name || String(c.company || "").toLowerCase() === name);
  return exact.length === 1 ? exact[0] : null;
}

// totals for the overview, per currency
export function sumByCurrency(rows, pick) {
  const out = {};
  for (const r of rows) out[r.currency] = (out[r.currency] || 0) + pick(r);
  return Object.entries(out).filter(([, v]) => v).map(([c, v]) => money(v, c)).join(" + ") || "nothing";
}
