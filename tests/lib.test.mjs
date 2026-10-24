import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.APP_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key-1234";
const money = await import("../lib/money.js");
const crypto = await import("../lib/crypto.js");
const bachs = await import("../lib/payments/bachs.js");
const flw = await import("../lib/payments/flutterwave.js");

test("amounts parse to minor units exactly", () => {
  assert.equal(money.toMinor("25,000"), 2500000);
  assert.equal(money.toMinor("₦1,250.5"), 125050);
  assert.equal(money.toMinor("0.07"), 7);
  assert.ok(Number.isNaN(money.toMinor("12.345")));
  assert.ok(Number.isNaN(money.toMinor("abc")));
  assert.equal(money.decimalToMinor("1666250.00"), 166625000);
});

test("editor totals match the database formula", () => {
  // same numbers as the SQL test: 45,000,000 subtotal, 1,000,000 discount, 7.5% VAT
  const t = money.computeTotals([{ quantity: 1, unit_price_minor: 25000000 }, { quantity: 2, unit_price_minor: 10000000 }], 1000000, 7.5);
  assert.deepEqual(t, { subtotal: 45000000, discount: 1000000, tax: 3300000, total: 47300000 });
  assert.equal(money.computeTotals([{ quantity: 1, unit_price_minor: 100 }], 500, 0).total, 0, "discount can't exceed subtotal");
});

test("margin and money formatting", () => {
  assert.deepEqual(money.marginOf(50000000, 14000000), { profit: 36000000, pct: 72 });
  assert.equal(money.formatMoney(166625000, "NGN"), "₦1,666,250");
  assert.equal(money.formatMoney(125050, "USD"), "$1,250.50");
});

test("secrets round-trip through encryption and tampering is detected", () => {
  const sealed = crypto.encryptSecret("sk_live_abc123");
  assert.notEqual(sealed, "sk_live_abc123");
  assert.equal(crypto.decryptSecret(sealed), "sk_live_abc123");
  const parts = sealed.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
  assert.throws(() => crypto.decryptSecret(parts.join(".")));
});

test("Bachs webhook signatures: valid, wrong secret, stale timestamp", () => {
  const raw = JSON.stringify({ id: "evt_1", type: "collection.succeeded", data: { reference: "PT-1" } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_test").update(`${ts}.${raw}`).digest("hex");
  assert.equal(bachs.validBachsSignature(raw, ts, sig, "whsec_test"), true);
  assert.equal(bachs.validBachsSignature(raw, ts, sig, "whsec_other"), false);
  assert.equal(bachs.validBachsSignature(raw + " ", ts, sig, "whsec_test"), false);
  const old = ts - 600;
  const oldSig = createHmac("sha256", "whsec_test").update(`${old}.${raw}`).digest("hex");
  assert.equal(bachs.validBachsSignature(raw, old, oldSig, "whsec_test"), false);
});

test("provider key formats", () => {
  assert.equal(bachs.validBachsKey("sk_sandbox_9a8b7c6d5e"), true);
  assert.equal(bachs.bachsMode("sk_live_9a8b7c6d5e"), "live");
  assert.equal(bachs.validBachsKey("pk_live_123"), false);
  assert.equal(flw.validFlutterwaveKey("FLWSECK_TEST-SANDBOXDEMOKEY-X"), true);
  assert.equal(flw.validFlutterwaveKey("FLWSECK-" + "0000000000000000example-X"), true);
  assert.equal(flw.flutterwaveMode("FLWSECK_TEST-abcdefghijk-X"), "test");
  assert.equal(flw.validFlutterwaveKey("FLWPUBK-abc"), false);
  assert.equal(flw.validFlutterwaveHash("my-hash-123", "my-hash-123"), true);
  assert.equal(flw.validFlutterwaveHash("guess", "my-hash-123"), false);
  assert.equal(flw.validFlutterwaveHash("", ""), false);
});

test("provider responses normalise to one shape", () => {
  const b = bachs.normaliseBachs({ payment_status: "succeeded", amount: "3197.50", currency: "ngn", reference: "PT-9", checkout_id: "cs_1", charge_id: "ch_1" });
  assert.deepEqual([b.state, b.amountMinor, b.currency, b.providerReference], ["succeeded", 319750, "NGN", "ch_1"]);
  const f = flw.normaliseFlutterwave({ status: "successful", amount: 3197.5, currency: "NGN", tx_ref: "PT-9", flw_ref: "FLW-1" });
  assert.deepEqual([f.state, f.amountMinor, f.reference], ["succeeded", 319750, "PT-9"]);
  assert.equal(flw.normaliseFlutterwave({ status: "pending" }).state, "pending");
});
