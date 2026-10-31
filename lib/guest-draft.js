// "Try it" on the website: an invoice made without an account is kept in the
// visitor's browser (never on our servers) until they sign up. Then it is
// saved to their new business as a draft, once, and removed from the browser.
//
// Pure helpers only (no window, no React), so they can be tested in node.

export const GUEST_KEY = "usetally:try:draft";
export const GUEST_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // two weeks
const MAX_ITEMS = 100;

const str = (v, n) => String(v ?? "").trim().slice(0, n);
const num = (v, lo, hi, d = 0) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : undefined);

// the "Your business" card on /try
export function cleanGuestBusiness(b = {}, currencies = []) {
  const currency = currencies.includes(b.currency) ? b.currency : "NGN";
  return { name: str(b.name, 120), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40), address: str(b.address, 300), currency };
}

// the same input the builder sends to saveDocument, cut down to what a guest can fill
export function cleanGuestInput(input = {}) {
  const c = input.customer || {};
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, MAX_ITEMS)
    .map((i) => ({
      description: str(i.description, 300), details: str(i.details, 1000),
      quantity: num(i.quantity, 0, 1e9, 1) || 1,
      unit_price_minor: Math.round(num(i.unit_price_minor, 0, 1e15)),
      vat_category: ["standard", "zero", "exempt"].includes(i.vat_category) ? i.vat_category : "standard",
    }))
    .filter((i) => i.description);
  const d = input.delivery || {};
  return {
    kind: input.kind === "quote" ? "quote" : "invoice",
    title: str(input.title, 200),
    issue_date: isoDate(input.issue_date),
    ...(input.kind === "quote" ? { valid_until: isoDate(input.valid_until) } : { due_date: isoDate(input.due_date) }),
    discount_minor: Math.round(num(input.discount_minor, 0, 1e15)),
    tax_rate: num(input.tax_rate, 0, 100), tax_label: str(input.tax_label, 30),
    tax2_rate: num(input.tax2_rate, 0, 100), tax2_label: str(input.tax2_label, 30),
    notes: str(input.notes, 5000), terms: str(input.terms, 5000),
    prices_include_vat: Boolean(input.prices_include_vat),
    email_customer: false, // never emailed on import: they check it first
    items,
    customer: { name: str(c.name, 200), company: str(c.company, 200), email: str(c.email, 200), phone: str(c.phone, 40), address: str(c.address, 500), postcode: str(c.postcode, 20) },
    delivery: { address: str(d.address, 500), postcode: str(d.postcode, 20), contact: str(d.contact, 200) },
  };
}

export function packGuestDraft({ input, business, currencies }, now = Date.now()) {
  return JSON.stringify({ v: 1, at: now, business: cleanGuestBusiness(business, currencies), input: cleanGuestInput(input) });
}

// null when missing, broken, too old, or with nothing worth importing
export function readGuestDraft(raw, now = Date.now(), currencies = []) {
  let d;
  try { d = JSON.parse(raw || "null"); } catch { return null; }
  if (!d || d.v !== 1 || !Number.isFinite(d.at) || now - d.at > GUEST_MAX_AGE_MS || d.at > now + 60_000) return null;
  const input = cleanGuestInput(d.input);
  if (!input.items.length || !input.customer.name) return null;
  return { at: d.at, business: cleanGuestBusiness(d.business, currencies), input };
}
