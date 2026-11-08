import test from "node:test";
import assert from "node:assert/strict";
const f = await import("../lib/founder-core.js");

test("money in several currencies, naira first, zeros dropped", () => {
  assert.equal(f.moneyText({ USD: 4000, NGN: 1500000, GBP: 0 }), "₦15,000 + $40");
  assert.equal(f.moneyText({}), "₦0");
  assert.equal(f.mainAmount({ NGN: "250" }), 250);
});

test("month-on-month change", () => {
  assert.deepEqual(f.change(150, 100), { value: "50% vs last month", direction: "up" });
  assert.deepEqual(f.change(50, 100), { value: "50% vs last month", direction: "down" });
  assert.equal(f.change(10, 0), null, "nothing to compare with");
  assert.equal(f.change(100, 100), null);
});

test("gateway status in plain words, never a key", () => {
  assert.equal(f.gatewayStatus({ provider: "bachs", connected: true, mode: "live" }).label, "Receiving payments");
  assert.equal(f.gatewayStatus({ provider: "bachs", connected: true, mode: "test" }).label, "Test mode");
  assert.equal(f.gatewayStatus({ provider: "flutterwave", connected: false }).label, "Not connected");
  assert.equal(f.gatewayStatus({ provider: "manual" }).label, "Not set up");
  assert.equal(f.gatewayStatus(null).label, "Not set up");
  assert.equal(f.gatewayName("paystack"), "Paystack");
  assert.equal(f.methodName("bank_transfer"), "Bank transfer");
});

test("checkout success rate", () => {
  assert.equal(f.successRate({ paid: 3, unfinished: 1 }), 75);
  assert.equal(f.successRate({ paid: 0, unfinished: 0 }), null);
  assert.equal(f.monthLabel("2026-11"), "Nov");
});

test("short amounts for bar labels", () => {
  assert.equal(f.shortMoney(118500000), "₦1.2m");
  assert.equal(f.shortMoney(56000000), "₦560k");
  assert.equal(f.shortMoney(2500000000), "₦25m");
  assert.equal(f.shortMoney(50000), "₦500");
});
