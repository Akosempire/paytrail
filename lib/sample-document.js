// A realistic sample quote, invoice or receipt in the business's own
// currency, tax and branding, so layout previews always show the template
// being chosen, even before the first real document exists. Client-safe.
const ITEMS = [
  { description: "Brand identity design", details: "Logo, colour palette and typography", quantity: 1, unit: 25000000 },
  { description: "Website design & build", details: "Five pages, mobile-friendly", quantity: 1, unit: 40000000 },
  { description: "Product photography", details: "Per image, edited", quantity: 10, unit: 1500000 },
];
const isoDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export function sampleDocument(kind, business) {
  const docKind = kind === "receipt" ? "invoice" : kind;
  // smaller round amounts for currencies like USD/GBP/EUR
  const scale = (business.currency || "NGN") === "NGN" ? 1 : 0.002;
  const items = ITEMS.map((i, n) => ({ description: i.description, details: i.details, quantity: i.quantity, unit_price_minor: Math.round(i.unit * scale / 100) * 100, sort_order: n }));
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price_minor, 0);
  const rate = Number(business.tax_rate || 0);
  const tax = Math.round((subtotal * rate) / 100);
  const total = subtotal + tax;
  const prefix = docKind === "quote" ? business.quote_prefix || "QT" : business.invoice_prefix || "INV";
  const doc = {
    kind: docKind, number: `${prefix}-0001`, status: "sent", currency: business.currency || "NGN",
    issue_date: isoDays(0), valid_until: isoDays(Number(business.quote_validity_days || 14)), due_date: isoDays(Number(business.invoice_due_days || 7)),
    title: "Brand and website refresh",
    customer_name: "Ada Okafor", customer_company: "Okafor Foods Ltd", customer_address: "14 Marina Road",
    customer_email: "ada@okaforfoods.com", customer_phone: "+234 803 000 0000",
    subtotal_minor: subtotal, discount_minor: 0, tax_rate: rate, tax_label: business.tax_label || "VAT", tax_minor: tax, total_minor: total,
    amount_paid_minor: kind === "receipt" ? total : 0,
    payment_instructions: "", notes: "Thank you for choosing us.", terms: business.default_terms || "50% deposit to start, balance on delivery.",
    layout: {},
  };
  if (kind !== "receipt") return { doc, items };
  return {
    doc, items,
    receipt: { number: `${business.receipt_prefix || "RCT"}-0001`, issued_at: new Date().toISOString(), amount_minor: total, balance_after_minor: 0, currency: doc.currency, template: null, paper: null },
    payment: { method: "bank_transfer", reference: "TRF-204518", paid_at: new Date().toISOString() },
  };
}
