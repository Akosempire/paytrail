import test from "node:test";
import assert from "node:assert/strict";
import { GUEST_MAX_AGE_MS, cleanGuestInput, packGuestDraft, readGuestDraft } from "../lib/guest-draft.js";

const CUR = ["NGN", "USD", "GHS"];
const input = {
  kind: "invoice", title: "Logo job", issue_date: "2026-11-01", due_date: "2026-11-15",
  items: [{ description: "Logo design", quantity: 2, unit_price_minor: 5000000, vat_category: "standard", external_product_id: "x" }, { description: "  ", quantity: 1, unit_price_minor: 1 }],
  customer: { name: "Chioma Obi", email: "chioma@obifoods.ng" }, email_customer: true, costs: [{ label: "secret", amount_minor: 1 }],
};

test("a guest draft round-trips and keeps only what a guest can fill", () => {
  const now = Date.UTC(2026, 10, 1);
  const raw = packGuestDraft({ input, business: { name: "Tolu Designs", currency: "USD", email: "HI@TOLU.NG" }, currencies: CUR }, now);
  const d = readGuestDraft(raw, now + 1000, CUR);
  assert.equal(d.business.name, "Tolu Designs");
  assert.equal(d.business.currency, "USD");
  assert.equal(d.business.email, "hi@tolu.ng");
  assert.equal(d.input.items.length, 1); // the blank row is dropped
  assert.equal(d.input.items[0].unit_price_minor, 5000000);
  assert.equal(d.input.items[0].external_product_id, undefined);
  assert.equal(d.input.email_customer, false); // never emailed on import
  assert.equal(d.input.costs, undefined);
  assert.equal(d.input.due_date, "2026-11-15");
});

test("old, broken, empty or future drafts are ignored", () => {
  const now = Date.UTC(2026, 10, 1);
  const raw = packGuestDraft({ input, business: {}, currencies: CUR }, now);
  assert.equal(readGuestDraft(raw, now + GUEST_MAX_AGE_MS + 1, CUR), null);
  assert.equal(readGuestDraft(raw, now - 5 * 60_000, CUR), null);
  assert.equal(readGuestDraft("{not json", now, CUR), null);
  assert.equal(readGuestDraft(null, now, CUR), null);
  assert.equal(readGuestDraft(packGuestDraft({ input: { ...input, customer: { name: "" } }, business: {} }, now), now), null);
  assert.equal(readGuestDraft(packGuestDraft({ input: { ...input, items: [] }, business: {} }, now), now), null);
  // unknown currency falls back to naira
  assert.equal(readGuestDraft(packGuestDraft({ input, business: { currency: "XXX" }, currencies: CUR }, now), now, CUR).business.currency, "NGN");
});

test("values are clamped and dates checked", () => {
  const c = cleanGuestInput({ items: [{ description: "x".repeat(400), quantity: -3, unit_price_minor: "abc", vat_category: "weird" }], issue_date: "tomorrow", tax_rate: 500, customer: { name: "A" } });
  assert.equal(c.items[0].description.length, 300);
  assert.equal(c.items[0].quantity, 1);
  assert.equal(c.items[0].unit_price_minor, 0);
  assert.equal(c.items[0].vat_category, "standard");
  assert.equal(c.issue_date, undefined);
  assert.equal(c.tax_rate, 100);
});
