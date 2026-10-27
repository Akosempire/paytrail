import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionCurrency, subscriptionCurrencyFor, plansFor } from "../lib/plans.js";

test("visitors: naira in Nigeria, dollars everywhere else", () => {
  assert.equal(subscriptionCurrency("NG"), "NGN");
  assert.equal(subscriptionCurrency("ng"), "NGN");
  for (const c of ["GH", "KE", "GB", "US", "AE", null, undefined, ""]) assert.equal(subscriptionCurrency(c), "USD");
});

test("businesses: by country, else by an NGN working currency", () => {
  assert.equal(subscriptionCurrencyFor({ country: "Nigeria", currency: "USD" }), "NGN");
  assert.equal(subscriptionCurrencyFor({ country: "Ghana", currency: "NGN" }), "USD");
  assert.equal(subscriptionCurrencyFor({ country: "United Kingdom", currency: "GBP" }), "USD");
  assert.equal(subscriptionCurrencyFor({ currency: "NGN" }), "NGN");
  assert.equal(subscriptionCurrencyFor({ currency: "KES" }), "USD");
  assert.equal(subscriptionCurrencyFor(null), "USD");
});

test("plansFor shows only the chosen currency", () => {
  const plans = [
    { id: "a", active: true, currency: "NGN", price_minor: 500000, billing_interval: "month", sort_order: 1 },
    { id: "b", active: true, currency: "USD", price_minor: 900, billing_interval: "month", sort_order: 1 },
  ];
  assert.deepEqual(plansFor(plans, { currency: subscriptionCurrency("KE"), interval: "month" }).plans.map((p) => p.id), ["b"]);
  assert.deepEqual(plansFor(plans, { currency: subscriptionCurrency("NG"), interval: "month" }).plans.map((p) => p.id), ["a"]);
});

test("a business keeps seeing its current plan in another currency", () => {
  const plans = [
    { id: "ng", active: true, currency: "NGN", price_minor: 1000000, billing_interval: "month", sort_order: 1 },
    { id: "us", active: true, currency: "USD", price_minor: 1500, billing_interval: "month", sort_order: 1 },
  ];
  const ids = plansFor(plans, { currency: "USD", interval: "month", currentPlanId: "ng" }).plans.map((p) => p.id);
  assert.deepEqual(ids, ["ng", "us"]);
});

import { presetFields, taxPreset, presetText } from "../lib/tax-presets.js";
test("tax presets follow the country, and the province in Canada", () => {
  assert.deepEqual(presetFields("GB"), { tax_label: "VAT", tax_rate: 20, tax2_label: "", tax2_rate: 0 });
  assert.deepEqual(presetFields("CA", "BC"), { tax_label: "GST", tax_rate: 5, tax2_label: "PST", tax2_rate: 7 });
  assert.deepEqual(presetFields("CA", "ON"), { tax_label: "HST", tax_rate: 13, tax2_label: "", tax2_rate: 0 });
  assert.equal(presetText(taxPreset("CA", "QC")), "GST 5% + QST 9.975%");
  assert.deepEqual(taxPreset("CA"), [["GST", 5]]); // no province yet: GST only
  assert.equal(presetFields("ZZ"), null);
});
