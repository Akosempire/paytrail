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
