// E-invoice (UBL / BIS Billing 3.0): the totals in the file always match the
// invoice, per VAT category, with discounts and VAT-inclusive prices.
import test from "node:test";
import assert from "node:assert/strict";
import { computeTotals } from "../lib/money.js";
import { ubl, readiness, breakdown } from "../lib/einvoice.js";

const business = { name: "VAT Ltd", legal_name: "VAT Limited", tax_id: "12345678-0001", address: "1 Marina", city: "Lagos", country: "Nigeria", email: "a@vat.test" };
const items = [
  { description: "Design", quantity: 1, unit_price_minor: 100000, vat_category: "standard" },
  { description: "Export & shipping <fast>", quantity: 2, unit_price_minor: 25000, vat_category: "zero" },
  { description: "Training", quantity: 1, unit_price_minor: 50000, vat_category: "exempt" },
];
const docFor = (inclusive, discount) => {
  const t = computeTotals(items, discount, 7.5, { inclusive });
  return { kind: "invoice", number: "INV-0001", issue_date: "2026-10-26", due_date: "2026-11-02", currency: "NGN", customer_name: "Kay", customer_company: "Kay Ltd", customer_tax_id: "87654321-0001",
    tax_rate: 7.5, tax_label: "VAT", prices_include_vat: inclusive, subtotal_minor: t.subtotal, discount_minor: t.discount, tax_minor: t.tax, total_minor: t.total, amount_paid_minor: 0 };
};
const num = (xml, tag) => Number(xml.match(new RegExp(`<cbc:${tag}[^>]*>([\\d.]+)<`))[1]);

for (const [inc, disc] of [[false, 0], [false, 20000], [true, 0], [true, 20000]]) {
  test(`totals match the invoice (VAT-inclusive: ${inc}, discount: ${disc / 100})`, () => {
    const doc = docFor(inc, disc), xml = ubl({ doc, items, business });
    assert.equal(num(xml, "TaxInclusiveAmount"), doc.total_minor / 100);
    assert.equal(num(xml, "PayableAmount"), doc.total_minor / 100);
    assert.equal(num(xml, "TaxAmount"), doc.tax_minor / 100);
    const { groups } = breakdown(doc, items);
    const lineExt = num(xml, "LineExtensionAmount"), excl = num(xml, "TaxExclusiveAmount");
    assert.ok(Math.abs(lineExt - (Object.values(groups).reduce((t, g) => t + g.allowance, 0) / 100) - excl) < 0.02, "line total minus discount = total before tax");
    assert.match(xml, /<cbc:ID>Z<\/cbc:ID><cbc:Percent>0<\/cbc:Percent>/);
    assert.match(xml, /TaxExemptionReason/);
    assert.match(xml, /Export &amp; shipping &lt;fast&gt;/);
    assert.match(xml, /<cbc:IdentificationCode>NG<\/cbc:IdentificationCode>/);
  });
}

test("readiness lists what's missing", () => {
  assert.equal(readiness(docFor(false, 0), items, business).ready, true);
  const r = readiness({ ...docFor(false, 0), customer_tax_id: "" }, items, { ...business, tax_id: "" });
  assert.equal(r.ready, false);
  assert.match(r.missing[0], /business tax ID/);
  assert.match(r.advice[0], /customer's tax ID/);
});

test("only Nigerian businesses get the Nigeria-only tax features", async () => {
  const { inNigeria, countryCode } = await import("../lib/einvoice.js");
  assert.equal(inNigeria({ country: "Nigeria", currency: "USD" }), true);
  assert.equal(inNigeria({ country: "Lagos, Nigeria" }), true);
  assert.equal(inNigeria({ country: "NG" }), true);
  assert.equal(inNigeria({ country: "United Kingdom", currency: "NGN" }), false);
  assert.equal(inNigeria({ country: "Ghana", currency: "GHS" }), false);
  assert.equal(inNigeria({ country: "", currency: "NGN" }), true);
  assert.equal(inNigeria({ country: "", currency: "USD" }), false);
  assert.equal(countryCode("Accra, Ghana"), "GH");
});

test("free tier: Free plan, or a trial or paid plan that has run out", async () => {
  const { onFreeTier } = await import("../lib/plans.js");
  const now = Date.parse("2026-10-27T12:00:00Z");
  assert.equal(onFreeTier({ subscription_status: "active", plans: { price_minor: 0 } }, now), true);
  assert.equal(onFreeTier({ subscription_status: "active", plans: { price_minor: 1000000 }, current_period_end: "2026-11-20T00:00:00Z" }, now), false);
  assert.equal(onFreeTier({ subscription_status: "active", plans: { price_minor: 1000000 }, current_period_end: "2026-10-20T00:00:00Z" }, now), true);
  assert.equal(onFreeTier({ subscription_status: "trialing", trial_ends_at: "2026-11-01T00:00:00Z" }, now), false);
  assert.equal(onFreeTier({ subscription_status: "trialing", trial_ends_at: "2026-10-01T00:00:00Z" }, now), true);
  assert.equal(onFreeTier({ subscription_status: "suspended" }, now), false);
});

test("paying vs not: brand in the app and 'Powered by Usetally' on documents", async () => {
  const { isPaying, showsPoweredBy } = await import("../lib/plans.js");
  const now = Date.parse("2026-10-27T12:00:00Z");
  const team = { subscription_status: "active", plans: { price_minor: 1000000 }, current_period_end: "2026-11-20T00:00:00Z" };
  assert.equal(isPaying(team, now), true);
  assert.equal(showsPoweredBy(team, now), false);
  assert.equal(showsPoweredBy({ subscription_status: "trialing", trial_ends_at: "2026-11-01T00:00:00Z" }, now), true);
  assert.equal(showsPoweredBy({ subscription_status: "active", plans: { price_minor: 0 } }, now), true);
  assert.equal(showsPoweredBy({ subscription_status: "active", plans: { price_minor: 1000000 }, current_period_end: "2026-10-01T00:00:00Z" }, now), true);
  assert.equal(showsPoweredBy({ name: "no status known" }, now), false);
});

test("postcodes go into the UBL address, and the delivery address into cac:Delivery", async () => {
  const { ubl } = await import("../lib/einvoice.js");
  const xml = ubl({
    doc: { number: "INV-1", issue_date: "2026-10-27", currency: "NGN", customer_name: "Chioma", customer_address: "1 Allen Ave", customer_postcode: "LA-01-B22-KT-05", total_minor: 10000, tax_minor: 0, tax_rate: 0, discount_minor: 0,
      delivery_address: "Plot 4, Admiralty Way", delivery_postcode: "LA-02-C11-LK-09", delivery_postcode_area: "Lekki, Lagos", delivery_contact: "Tunde" },
    items: [{ description: "Rice", quantity: 1, unit_price_minor: 10000 }],
    business: { name: "Ade Foods", address: "2 Broad St", city: "Lagos", country: "Nigeria", postcode: "LA-03-A01-BC-02" },
  });
  assert.match(xml, /<cbc:CityName>Lagos<\/cbc:CityName><cbc:PostalZone>LA-03-A01-BC-02<\/cbc:PostalZone>/);
  assert.match(xml, /<cbc:StreetName>1 Allen Ave<\/cbc:StreetName><cbc:PostalZone>LA-01-B22-KT-05<\/cbc:PostalZone>/);
  assert.match(xml, /<cac:Delivery><cac:DeliveryLocation><cac:Address><cbc:StreetName>Plot 4, Admiralty Way<\/cbc:StreetName><cbc:CityName>Lekki, Lagos<\/cbc:CityName><cbc:PostalZone>LA-02-C11-LK-09<\/cbc:PostalZone>/);
  // Delivery sits after the customer party (UBL order)
  assert.ok(xml.indexOf("</cac:AccountingCustomerParty>") < xml.indexOf("<cac:Delivery>"));
});
