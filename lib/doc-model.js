// Turns a document (or receipt) plus its business into one plain object that
// every renderer uses: the live preview, the print page and the PDF. It never
// receives hidden costs. Client-safe.
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue, PAYMENT_METHODS } from "@/lib/format";
import { accentFor, PAPERS, resolveLayout, SHEET_TEMPLATES, TEMPLATES } from "@/lib/doc-templates";
import { logoUrl } from "@/lib/site";
import { amountInWords } from "@/lib/amount-words";
import { showsPoweredBy } from "@/lib/plans";
import QRCode from "qrcode";

const lineAmount = (i) => Math.round(Number(i.quantity || 0) * Number(i.unit_price_minor || 0));

// Sent quotes and invoices keep their business details (name, address, tax
// ID, bank details, colour) as they were when sent. The logo and signature are
// set up once and always the current ones, on every document: upload a new
// logo or signature and old and new documents show it. Receipts use the
// current branding and receipt template for everything.
const ALWAYS_CURRENT = ["logo_path", "signature_path", "signatory_name", "signatory_title"];
export function brandingFor(doc, business, { live = false } = {}) {
  if (live || !doc?.snapshot) return business;
  const merged = { ...business, ...doc.snapshot };
  for (const k of ALWAYS_CURRENT) if (k in business) merged[k] = business[k];
  return merged;
}

export function buildModel({ doc, items = [], business, receipt = null, payment = null, payLink = null, override = {} }) {
  const kind = receipt ? "receipt" : doc.kind;
  const brand = brandingFor(doc, business, { live: Boolean(receipt) || Boolean(override.live) });
  // receipts follow the business's current receipt default (template, paper, sections)
  const stored = receipt ? { template: null, paper: null, layout: {} } : { template: doc.template, paper: doc.paper, layout: doc.layout };
  const look = resolveLayout({ kind, template: override.template || stored.template, paper: override.paper || stored.paper, layout: override.layout || stored.layout }, business);
  const s = look.sections;
  const currency = receipt?.currency || doc.currency;
  const money = (v) => formatMoney(v, currency, { decimals: 2 });
  const quote = kind === "quote";

  const fromLines = s.business_details ? [
    brand.legal_name && brand.legal_name !== brand.name ? brand.legal_name : null,
    brand.address, [brand.city, brand.country].filter(Boolean).join(", "), brand.postcode ? `Postcode ${brand.postcode}` : null, brand.phone, brand.email, brand.website,
  ].filter(Boolean) : [];
  if (s.tax_id && brand.tax_id) fromLines.push(`TIN ${brand.tax_id}`);
  const toLines = s.customer_details ? [doc.customer_company, doc.customer_address, doc.customer_postcode ? `Postcode ${doc.customer_postcode}` : null, doc.customer_phone, doc.customer_email].filter(Boolean) : [doc.customer_company].filter(Boolean);
  if (s.tax_id && doc.customer_tax_id) toLines.push(`TIN ${doc.customer_tax_id}`);

  const status = receipt ? "receipt" : doc.status === "paid" ? "paid" : isOverdue(doc) ? "overdue" : doc.status;
  const paidBalance = Number(doc.total_minor || 0) - Number(doc.amount_paid_minor || 0);

  const meta = receipt
    ? [["Receipt", receipt.number], ["Date", formatDate(payment?.paid_at || receipt.issued_at)], ["For", doc.number]]
    : [[quote ? "Quotation" : "Invoice", doc.number], ["Issued", formatDate(doc.issue_date)],
       quote ? ["Valid until", doc.valid_until ? formatDate(doc.valid_until) : null] : ["Due", doc.due_date ? formatDate(doc.due_date) : null]].filter(([, v]) => v);

  const totals = [["Subtotal", money(doc.subtotal_minor)]];
  if (Number(doc.discount_minor) > 0) totals.push(["Discount", `−${money(doc.discount_minor)}`]);
  // each tax on its own line (Canada: GST, then PST or QST); tax_minor is both
  const tax2 = Number(doc.tax2_minor || 0), inc = doc.prices_include_vat ? " included" : "";
  if (Number(doc.tax_rate) > 0 || Number(doc.tax_minor) - tax2 > 0) totals.push([`${doc.tax_label || "Tax"}${inc} (${Number(doc.tax_rate)}%)`, money(Number(doc.tax_minor) - tax2)]);
  if (Number(doc.tax2_rate) > 0 || tax2 > 0) totals.push([`${doc.tax2_label || "Tax"}${inc} (${Number(doc.tax2_rate)}%)`, money(tax2)]);

  const settled = !receipt && !quote && Number(doc.amount_paid_minor) > 0;
  const payBlocks = [];
  if (!receipt && status !== "paid" && status !== "void") {
    if (s.payment_instructions && doc.payment_instructions) payBlocks.push({ title: "How to pay", text: doc.payment_instructions });
    if (s.bank_details && brand.bank_account_number) payBlocks.push({
      title: "Bank transfer", bank: { name: brand.bank_name, number: brand.bank_account_number, account: brand.bank_account_name || brand.name },
      text: `Use ${doc.number} as your reference.`,
    });
  }

  return {
    kind,
    title: { quote: "Quotation", invoice: "Invoice", receipt: "Receipt" }[kind],
    number: receipt ? receipt.number : doc.number,
    status,
    template: look.template,
    paper: look.paper,
    paperSpec: PAPERS[look.paper],
    templateSpec: TEMPLATES[look.template],
    accent: accentFor(look.template, look.accent, brand.brand_color),
    sections: s,
    currency,
    business: {
      name: brand.name || "",
      logo: s.logo ? logoUrl(brand.logo_path) : null,
      lines: fromLines,
      footer: s.footer ? brand.footer_note || "" : "",
    },
    // authorised signature, when the business has one (always the current one)
    // Notebook and Case file already show the name under the logo: only a drawn signature adds anything
    signature: s.signature !== false && (brand.signature_path || (brand.signatory_name && !SHEET_TEMPLATES.includes(look.template))) ? {
      image: brand.signature_path ? logoUrl(brand.signature_path) : null,
      name: brand.signatory_name || "",
      title: brand.signatory_title || "",
    } : null,
    poweredBy: showsPoweredBy(business),
    // where the goods go (quotes and invoices)
    delivery: !receipt && (doc.delivery_address || doc.delivery_postcode) ? { address: doc.delivery_address || "", postcode: doc.delivery_postcode || "", area: doc.delivery_postcode_area || "", contact: doc.delivery_contact || "" } : null,
    customer: { label: receipt ? "Received from" : quote ? "Prepared for" : "Bill to", name: doc.customer_name || "—", lines: toLines },
    meta,
    docTitle: doc.title || "",
    showTotals: !receipt || look.template === "pos",
    // "Scan or tap to pay": a QR code and a tappable link on every open invoice (and quote) that's been sent
    payNow: !receipt && payLink && status !== "paid" && status !== "void" ? payNowParts(payLink, { quote, accepted: Boolean(doc.accepted_at), amount: money(quote ? doc.total_minor : paidBalance) }) : null,
    sheet: SHEET_TEMPLATES.includes(look.template) ? sheetParts({ doc, receipt, brand, s, quote, status }) : null,
    merchant: look.template === "merchant" ? merchantParts({ doc, items, receipt, payment, brand, s, money, quote, currency, paidBalance }) : null,
    items: (receipt && !["pos", "merchant"].includes(look.template) ? [] : items).map((i) => ({
      // zero-rated and exempt lines say so, so the customer can see why there's no VAT on them
      description: i.vat_category && i.vat_category !== "standard" && (Number(doc.tax_rate) > 0 || Number(doc.tax_minor) > 0)
        ? `${i.description} (${i.vat_category === "zero" ? `0% ${doc.tax_label || "VAT"}` : `${doc.tax_label || "VAT"} exempt`})` : i.description,
      details: s.item_details ? i.details || "" : "",
      quantity: Number(i.quantity),
      unit: money(i.unit_price_minor),
      amount: money(lineAmount(i)),
    })),
    totals,
    total: { label: receipt ? "Invoice total" : quote ? "Total" : "Total due", value: money(doc.total_minor) },
    paid: settled ? { paid: `−${money(doc.amount_paid_minor)}`, balance: money(paidBalance) } : null,
    receipt: receipt ? {
      amount: money(receipt.amount_minor),
      rows: [
        ...(Number(receipt.wht_minor) > 0 ? [["Received", money(receipt.amount_minor - receipt.wht_minor)], ["Withholding tax deducted", money(receipt.wht_minor)]] : []),
        ["Payment method", PAYMENT_METHODS[payment?.method] || payment?.method || "—"],
        payment?.reference ? ["Reference", payment.reference] : null,
        ["Paid on", formatDate(payment?.paid_at || receipt.issued_at, { day: "numeric", month: "long", year: "numeric" })],
        ["For", `${doc.kind === "invoice" ? "Invoice" : "Quote"} ${doc.number}${doc.title ? ` — ${doc.title}` : ""}`],
        ["Invoice total", money(doc.total_minor)],
        ["Balance remaining", money(receipt.balance_after_minor)],
      ].filter(Boolean),
      fullyPaid: Number(receipt.balance_after_minor) === 0,
    } : null,
    payBlocks,
    notes: s.notes && !receipt ? doc.notes || "" : "",
    terms: s.terms && !receipt ? doc.terms || "" : "",
    accepted: quote && doc.accepted_at ? `Accepted by ${doc.accepted_name || doc.customer_name} on ${formatDate(doc.accepted_at)}` : "",
    stamp: receipt ? (Number(receipt.balance_after_minor) === 0 ? "PAID" : "PART PAID") : status === "paid" ? "PAID" : status === "void" ? "VOID" : null,
  };
}

// extra pieces the Merchant template shows: item count, paid lines, what's
// still owed, the amount in words, numbered terms and the bank boxes
function merchantParts({ doc, items, receipt, payment, brand, s, money, quote, currency, paidBalance }) {
  const qty = items.reduce((n, i) => n + Number(i.quantity || 0), 0);
  const total = Number(doc.total_minor || 0);
  const paid = [];
  let outstanding = null, wordsMinor = total;
  if (receipt) {
    const method = PAYMENT_METHODS[payment?.method] || payment?.method || "";
    const when = formatDate(payment?.paid_at || receipt.issued_at);
    const earlier = total - Number(receipt.amount_minor || 0) - Number(receipt.balance_after_minor || 0);
    if (earlier > 0) paid.push(["(−) Paid earlier", money(earlier)]);
    paid.push([`(−) Paid (${when}${method ? ` · ${method}` : ""})`, money(receipt.amount_minor)]);
    outstanding = { label: `Total outstanding as on ${when}`, value: money(receipt.balance_after_minor) };
    wordsMinor = Number(receipt.amount_minor || 0);
  } else if (!quote) {
    if (Number(doc.amount_paid_minor) > 0) paid.push(["(−) Paid so far", money(doc.amount_paid_minor)]);
    outstanding = { label: doc.due_date ? `Balance due by ${formatDate(doc.due_date)}` : "Balance due", value: money(paidBalance) };
  }
  const terms = s.terms ? String(doc.terms || "").split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim()).filter(Boolean) : [];
  return {
    qty: Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
    grand: money(total),
    itemsTotal: money(items.reduce((n, i) => n + lineAmount(i), 0)),
    paid,
    outstanding,
    words: amountInWords(wordsMinor, currency),
    wordsLabel: receipt ? "Amount received in words" : "Amount in words",
    terms,
    notes: s.notes ? String(doc.notes || "").trim() : "",
    taxLine: s.tax_id && brand.tax_id ? `TIN: ${brand.tax_id}` : "",
    bank: s.bank_details && brand.bank_account_number ? { payee: brand.bank_account_name || brand.name, bank: brand.bank_name || "", number: brand.bank_account_number } : null,
  };
}

// extra pieces the Notebook and Case file templates show (components/doc-sheet.js)
function sheetParts({ doc, receipt, brand, s, quote, status }) {
  const days = doc.issue_date && doc.due_date ? Math.round((new Date(`${doc.due_date}T00:00:00Z`) - new Date(`${doc.issue_date}T00:00:00Z`)) / 864e5) : null;
  const due = receipt ? "" : quote
    ? (doc.valid_until ? `This quotation is valid until ${formatDate(doc.valid_until)}.` : "")
    : days == null ? "" : days <= 0 ? "Payment due on receipt." : `Payment due within ${days} day${days === 1 ? "" : "s"}.`;
  const partly = !receipt && !quote && Number(doc.amount_paid_minor) > 0 && status !== "paid";
  const stamp = receipt ? (Number(receipt.balance_after_minor) === 0 ? "PAID" : "PART PAID")
    : status === "void" ? "VOID" : status === "paid" ? "PAID"
    : quote ? (doc.accepted_at ? "ACCEPTED" : status === "declined" ? "DECLINED" : "QUOTE")
    : status === "overdue" ? "OVERDUE" : partly ? "PART PAID" : "DUE";
  const showPay = !receipt && status !== "paid" && status !== "void";
  return {
    // under the business name, in small capitals: the person and what they do
    tagline: [brand.signatory_name, brand.signatory_title].filter(Boolean).join(" · "),
    fromName: brand.signatory_name || brand.name || "",
    contact: s.business_details ? brand.email || brand.phone || "" : "",
    band: `Case file · ${receipt ? "Receipt" : quote ? "Estimate" : "Billing"}`,
    stamp,
    stampTone: ["PAID", "ACCEPTED"].includes(stamp) ? "good" : stamp === "QUOTE" || stamp === "PART PAID" ? "neutral" : "bad",
    due: showPay ? due : "",
    bank: showPay && s.bank_details && brand.bank_account_number ? { bank: brand.bank_name || "", name: brand.bank_account_name || brand.name || "", number: brand.bank_account_number } : null,
    instructions: showPay && s.payment_instructions ? String(doc.payment_instructions || "").trim() : "",
  };
}

// the QR code is kept as rows of "0"/"1" so the model stays plain data
// (it's passed from the server to the browser and drawn by both renderers)
export function payNowParts(link, { quote = false, accepted = false, amount = "" } = {}) {
  let qr = [];
  try {
    const q = QRCode.create(link, { errorCorrectionLevel: "M" });
    const n = q.modules.size, d = q.modules.data;
    for (let r = 0; r < n; r++) { let row = ""; for (let c = 0; c < n; c++) row += d[r * n + c] ? "1" : "0"; qr.push(row); }
  } catch { qr = []; }
  let short = link;
  try { const u = new URL(link); const tail = u.pathname.split("/").pop() || ""; short = `${u.host}${u.pathname.slice(0, u.pathname.length - tail.length)}${tail.slice(0, 6)}${tail.length > 6 ? "…" : ""}`; } catch { /* keep the full link */ }
  return {
    link, short, qr,
    label: quote && !accepted ? "Scan or tap to view and accept" : "Scan or tap to pay",
    amount: quote && !accepted ? `${amount} total` : `${amount} due`,
  };
}
