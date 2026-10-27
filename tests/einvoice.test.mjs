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
