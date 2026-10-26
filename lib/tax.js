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

const DOC_COLS = "id, number, issue_date, customer_name, customer_company, subtotal_minor, discount_minor, tax_minor, tax_rate, tax_label, total_minor, amount_paid_minor, currency, status";

export async function loadTaxMonth(ctx, monthKey) {
  const month = monthOf(monthKey);
  const sb = ctx.supabase, biz = ctx.business.id;
  const docsQuery = (cols) => sb.from("documents").select(cols).eq("business_id", biz).eq("kind", "invoice")
    .not("sent_at", "is", null).neq("status", "void").gte("issue_date", month.start).lt("issue_date", month.next).order("issue_date").limit(2000);
  let tinReady = true;
  let { data: invoices, error } = await docsQuery(`${DOC_COLS}, customer_tax_id`);
  if (error) { tinReady = false; ({ data: invoices } = await docsQuery(DOC_COLS)); } // tax SQL not run yet
  const whtQuery = await sb.from("payments").select("id, document_id, amount_minor, wht_minor, currency, paid_at, documents(number, customer_name, customer_company)")
    .eq("business_id", biz).gt("wht_minor", 0).gte("paid_at", `${month.start}T00:00:00Z`).lt("paid_at", `${month.next}T00:00:00Z`).order("paid_at").limit(2000);
  const whtReady = !whtQuery.error;
  const wht = whtQuery.data || [];

  const totals = {}; // per currency
  const add = (cur, k, v) => { totals[cur] ||= { taxable: 0, vat: 0, gross: 0, wht: 0, invoices: 0 }; totals[cur][k] += Number(v || 0); };
  for (const d of invoices || []) {
    add(d.currency, "taxable", Number(d.subtotal_minor) - Number(d.discount_minor || 0));
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
    ["Invoice", "Date", "Customer", "Customer TIN", "Currency", "Before tax", "Tax", "Tax rate %", "Total", "Paid so far", "Status"],
    ...invoices.map((d) => [d.number, d.issue_date, [d.customer_name, d.customer_company].filter(Boolean).join(", "), d.customer_tax_id || "", d.currency,
      naira(Number(d.subtotal_minor) - Number(d.discount_minor || 0)), naira(d.tax_minor), d.tax_rate, naira(d.total_minor), naira(d.amount_paid_minor), d.status]),
    [],
    ["Withholding tax deducted by customers"],
    ["Date", "Invoice", "Customer", "Currency", "Payment settled", "WHT deducted"],
    ...wht.map((p) => [String(p.paid_at).slice(0, 10), p.documents?.number || "", [p.documents?.customer_name, p.documents?.customer_company].filter(Boolean).join(", "), p.currency, naira(p.amount_minor), naira(p.wht_minor)]),
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
