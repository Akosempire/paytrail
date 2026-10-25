// Turns a document (or receipt) plus its business into one plain object that
// every renderer uses: the live preview, the print page and the PDF. It never
// receives hidden costs. Client-safe.
import { formatMoney } from "@/lib/money";
import { formatDate, isOverdue, PAYMENT_METHODS } from "@/lib/format";
import { accentFor, PAPERS, resolveLayout, TEMPLATES } from "@/lib/doc-templates";
import { logoUrl } from "@/lib/site";

const lineAmount = (i) => Math.round(Number(i.quantity || 0) * Number(i.unit_price_minor || 0));

// issued documents use the branding frozen when they were sent
export function brandingFor(doc, business) {
  return doc?.snapshot ? { ...business, ...doc.snapshot } : business;
}

export function buildModel({ doc, items = [], business, receipt = null, payment = null, payLink = null, override = {} }) {
  const kind = receipt ? "receipt" : doc.kind;
  const brand = brandingFor(doc, business);
  const stored = receipt ? { template: receipt.template, paper: receipt.paper, layout: {} } : { template: doc.template, paper: doc.paper, layout: doc.layout };
  const look = resolveLayout({ kind, template: override.template || stored.template, paper: override.paper || stored.paper, layout: override.layout || stored.layout }, business);
  const s = look.sections;
  const currency = receipt?.currency || doc.currency;
  const money = (v) => formatMoney(v, currency, { decimals: 2 });
  const quote = kind === "quote";

  const fromLines = s.business_details ? [
    brand.legal_name && brand.legal_name !== brand.name ? brand.legal_name : null,
    brand.address, [brand.city, brand.country].filter(Boolean).join(", "), brand.phone, brand.email, brand.website,
  ].filter(Boolean) : [];
  if (s.tax_id && brand.tax_id) fromLines.push(`TIN ${brand.tax_id}`);
  const toLines = s.customer_details ? [doc.customer_company, doc.customer_address, doc.customer_phone, doc.customer_email].filter(Boolean) : [doc.customer_company].filter(Boolean);

  const status = receipt ? "receipt" : doc.status === "paid" ? "paid" : isOverdue(doc) ? "overdue" : doc.status;
  const paidBalance = Number(doc.total_minor || 0) - Number(doc.amount_paid_minor || 0);

  const meta = receipt
    ? [["Receipt", receipt.number], ["Date", formatDate(payment?.paid_at || receipt.issued_at)], ["For", doc.number]]
    : [[quote ? "Quotation" : "Invoice", doc.number], ["Issued", formatDate(doc.issue_date)],
       quote ? ["Valid until", doc.valid_until ? formatDate(doc.valid_until) : null] : ["Due", doc.due_date ? formatDate(doc.due_date) : null]].filter(([, v]) => v);

  const totals = [["Subtotal", money(doc.subtotal_minor)]];
  if (Number(doc.discount_minor) > 0) totals.push(["Discount", `−${money(doc.discount_minor)}`]);
  if (Number(doc.tax_rate) > 0 || Number(doc.tax_minor) > 0) totals.push([`${doc.tax_label || "Tax"} (${Number(doc.tax_rate)}%)`, money(doc.tax_minor)]);

  const settled = !receipt && !quote && Number(doc.amount_paid_minor) > 0;
  const payBlocks = [];
  if (!receipt && status !== "paid" && status !== "void") {
    if (s.payment_instructions && doc.payment_instructions) payBlocks.push({ title: "How to pay", text: doc.payment_instructions });
    if (s.payment_instructions && payLink) payBlocks.push({ title: "Pay online", text: payLink, link: payLink });
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
    // authorised signature, when the business has one (frozen on issued documents)
    signature: s.signature !== false && (brand.signature_path || brand.signatory_name) ? {
      image: brand.signature_path ? logoUrl(brand.signature_path) : null,
      name: brand.signatory_name || "",
      title: brand.signatory_title || "",
    } : null,
    customer: { label: receipt ? "Received from" : quote ? "Prepared for" : "Bill to", name: doc.customer_name || "—", lines: toLines },
    meta,
    docTitle: doc.title || "",
    showTotals: !receipt || look.template === "pos",
    items: (receipt && look.template !== "pos" ? [] : items).map((i) => ({
      description: i.description,
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
