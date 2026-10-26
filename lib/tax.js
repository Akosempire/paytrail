import "server-only";

// A month of tax for one business: VAT on invoices issued that month, and
// withholding tax customers deducted from payments that month.
export function monthOf(value) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ""));
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear(), month = m ? Number(m[2]) : now.getUTCMonth() + 1;
  const pad = (n) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  // VAT returns are due on the 21st of the following month
  const due = month === 12 ? `${year + 1}-01-21` : `${year}-${pad(month + 1)}-21`;
  return { key: `${year}-${pad(month)}`, start, next, due, label: new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export function recentMonths(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return monthOf(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  });
}

const DOC_COLS = "id, kind, number, issue_date, due_date, customer_address, customer_name, customer_company, subtotal_minor, discount_minor, tax_minor, tax_rate, tax_label, total_minor, amount_paid_minor, currency, status";

// sales before tax split by VAT category, with the discount shared across lines
export function salesByCategory(doc, items) {
  const line = (i) => Math.round(Number(i.quantity || 0) * Number(i.unit_price_minor || 0));
  const sub = items.reduce((t, i) => t + line(i), 0);
  const disc = Math.min(Number(doc.discount_minor || 0), sub);
  const out = { standard: 0, zero: 0, exempt: 0 };
  for (const i of items) { const amt = line(i); out[i.vat_category && i.vat_category !== "standard" ? i.vat_category : "standard"] += sub ? amt - (disc * amt) / sub : 0; }
  if (doc.prices_include_vat) out.standard -= Number(doc.tax_minor || 0);
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  // no items on file (older data): everything is standard
  if (!items.length) out.standard = Number(doc.total_minor) - Number(doc.tax_minor || 0);
  return out;
}

export async function loadTaxMonth(ctx, monthKey) {
  const month = monthOf(monthKey);
  const sb = ctx.supabase, biz = ctx.business.id;
  const docsQuery = (cols) => sb.from("documents").select(cols).eq("business_id", biz).eq("kind", "invoice")
    .not("sent_at", "is", null).neq("status", "void").gte("issue_date", month.start).lt("issue_date", month.next).order("issue_date").limit(2000);
  let tinReady = true;
  let { data: invoices, error } = await docsQuery(`${DOC_COLS}, customer_tax_id, prices_include_vat`);
  if (error) ({ data: invoices, error } = await docsQuery(`${DOC_COLS}, customer_tax_id`));
  if (error) { tinReady = false; ({ data: invoices } = await docsQuery(DOC_COLS)); } // tax SQL not run yet
  invoices ||= [];
  // the lines, to split sales into standard-rated, zero-rated and exempt
  const ids = invoices.map((d) => d.id), lines = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("document_items").select("*").in("document_id", ids.slice(i, i + 200));
    for (const it of data || []) (lines[it.document_id] ||= []).push(it);
  }
  const { readiness } = await import("@/lib/einvoice");
  for (const d of invoices) { d.sales = salesByCategory(d, lines[d.id] || []); d.einvoice = readiness(d, lines[d.id] || [], ctx.business); }
  const whtQuery = await sb.from("payments").select("id, document_id, amount_minor, wht_minor, currency, paid_at, documents(number, customer_name, customer_company)")
    .eq("business_id", biz).gt("wht_minor", 0).gte("paid_at", `${month.start}T00:00:00Z`).lt("paid_at", `${month.next}T00:00:00Z`).order("paid_at").limit(2000);
  const whtReady = !whtQuery.error;
  const wht = whtQuery.data || [];

  const totals = {}; // per currency
  const add = (cur, k, v) => { totals[cur] ||= { taxable: 0, vat: 0, gross: 0, wht: 0, invoices: 0, standard: 0, zero: 0, exempt: 0 }; totals[cur][k] += Number(v || 0); };
  for (const d of invoices || []) {
    add(d.currency, "taxable", Number(d.total_minor) - Number(d.tax_minor || 0));
    for (const k of ["standard", "zero", "exempt"]) add(d.currency, k, d.sales[k]);
    add(d.currency, "vat", d.tax_minor);
    add(d.currency, "gross", d.total_minor);
    add(d.currency, "invoices", 1);
  }
  for (const p of wht) add(p.currency, "wht", p.wht_minor);
  return { month, invoices: invoices || [], wht, totals, tinReady, whtReady };
}

// a CSV an accountant can open in Excel or Google Sheets
export function taxCsv({ month, invoices, wht }) {
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const naira = (minor) => (Number(minor || 0) / 100).toFixed(2);
  const rows = [
    [`Usetally tax report: ${month.label}`],
    [`VAT return due: ${month.due}`],
    [],
    ["Invoices issued"],
    ["Invoice", "Date", "Customer", "Customer TIN", "Currency", "Before tax", "Standard-rated", "Zero-rated", "Exempt", "Tax", "Tax rate %", "Prices include tax", "Total", "Paid so far", "Status"],
    ...invoices.map((d) => [d.number, d.issue_date, [d.customer_name, d.customer_company].filter(Boolean).join(", "), d.customer_tax_id || "", d.currency,
      naira(Number(d.total_minor) - Number(d.tax_minor || 0)), naira(d.sales?.standard), naira(d.sales?.zero), naira(d.sales?.exempt), naira(d.tax_minor), d.tax_rate, d.prices_include_vat ? "yes" : "no", naira(d.total_minor), naira(d.amount_paid_minor), d.status]),
    [],
    ["Withholding tax deducted by customers"],
    ["Date", "Invoice", "Customer", "Currency", "Payment settled", "WHT deducted"],
    ...wht.map((p) => [String(p.paid_at).slice(0, 10), p.documents?.number || "", [p.documents?.customer_name, p.documents?.customer_company].filter(Boolean).join(", "), p.currency, naira(p.amount_minor), naira(p.wht_minor)]),
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
