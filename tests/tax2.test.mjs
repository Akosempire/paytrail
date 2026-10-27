import test from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../lib/doc-model.js";

const doc = { kind: "invoice", number: "INV-0001", status: "sent", currency: "CAD", issue_date: "2026-10-27", due_date: "2026-11-03",
  subtotal_minor: 10000, discount_minor: 0, tax_label: "GST", tax_rate: 5, tax2_label: "PST", tax2_rate: 7, tax_minor: 1200, tax2_minor: 700, total_minor: 11200, amount_paid_minor: 0 };

test("an invoice with two taxes shows each on its own line", () => {
  const m = buildModel({ doc, items: [{ description: "Website", quantity: 1, unit_price_minor: 10000 }], business: { name: "Maple Co", currency: "CAD" } });
  const lines = JSON.stringify(m.totals);
  assert.match(lines, /GST \(5%\)","CA\$5\.00"|GST \(5%\)",".*5\.00"/);
  assert.match(lines, /PST \(7%\)",".*7\.00"/);
});

test("one tax only: no second line", () => {
  const m = buildModel({ doc: { ...doc, tax_label: "VAT", tax_rate: 20, tax2_label: "", tax2_rate: 0, tax_minor: 2000, tax2_minor: 0, total_minor: 12000 }, items: [], business: { name: "UK Ltd", currency: "GBP" } });
  const lines = JSON.stringify(m.totals);
  assert.match(lines, /VAT \(20%\)/);
  assert.doesNotMatch(lines, /\(0%\)/);
});
