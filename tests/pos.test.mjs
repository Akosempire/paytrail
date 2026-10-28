import test from "node:test";
import assert from "node:assert/strict";
import { bearerKey, checkReturnTo, cleanCallbackBase, cleanCatalog, generateKey, isKey, isLinkCode, newLinkCode, normalizeSale, returnOrigins, sameHash, hashSecret, validateLink } from "../lib/pos-core.js";

const base = (o = {}) => ({
  id: "6f1c2e7a-0000-4000-8000-000000000001", number: "000128", created_at: "2026-10-28T19:40:00Z", currency: "NGN",
  store: { id: "s", name: "Ikeja branch" }, cashier: "Ada", customer: null,
  items: [{ product_id: "p1", name: "Peak Milk", sku: "FD-012", quantity: 2, unit_price_minor: 320000, discount_minor: 0, tax_minor: 0, line_total_minor: 640000 }],
  subtotal_minor: 640000, discount_minor: 0, tax_minor: 0, total_minor: 640000,
  payments: [{ method: "cash", amount_minor: 700000, reference: "" }], change_minor: 60000, ...o,
});

test("keys and codes have the right shape and are checked in constant time", () => {
  const k = generateKey();
  assert.ok(isKey(k)); assert.equal(k.length, 46);
  assert.notEqual(generateKey(), k);
  assert.equal(bearerKey(`Bearer ${k}`), k);
  assert.equal(bearerKey("Bearer nope"), null);
  assert.equal(bearerKey(""), null);
  assert.ok(isLinkCode(newLinkCode()));
  assert.ok(sameHash(hashSecret(k), hashSecret(k)));
  assert.ok(!sameHash(hashSecret(k), hashSecret(k + "x")));
  assert.ok(!sameHash("", ""));
});

test("the approval page only sends people back to allowed origins", () => {
  const o = returnOrigins("https://trackoja.cv, http://localhost:5173, javascript:alert(1)");
  assert.deepEqual(o, ["https://trackoja.cv", "http://localhost:5173"]);
  assert.equal(checkReturnTo("https://trackoja.cv/settings/usetally/callback", o), "https://trackoja.cv/settings/usetally/callback");
  assert.equal(checkReturnTo("https://trackoja.cv.evil.example/cb", o), null);
  assert.equal(checkReturnTo("https://user:pw@trackoja.cv/cb", o), null);
  assert.equal(checkReturnTo("javascript:alert(1)", o), null);
  assert.equal(checkReturnTo("//trackoja.cv/cb", o), null);
});

test("the callback address must be https (http only for localhost when allowed)", () => {
  assert.equal(cleanCallbackBase("https://abc.supabase.co/functions/v1/"), "https://abc.supabase.co/functions/v1");
  assert.equal(cleanCallbackBase("http://abc.supabase.co/functions/v1"), null);
  assert.equal(cleanCallbackBase("http://localhost:54321/functions/v1"), null);
  assert.equal(cleanCallbackBase("http://localhost:54321/functions/v1", { allowLocal: true }), "http://localhost:54321/functions/v1");
  assert.equal(cleanCallbackBase("https://10.0.0.1/functions/v1"), null);
  assert.equal(cleanCallbackBase("https://abc.supabase.co/functions/v1?x=1"), null);
  assert.equal(validateLink({ code: "bad", store_id: "x", callback_base: "https://a.co" }).error, "Code is invalid or expired");
});

test("a cash sale with change: change comes out of the cash", () => {
  const r = normalizeSale(base(), { currency: "NGN" });
  assert.ok(r.ok);
  assert.deepEqual(r.sale.payments, [{ method: "cash", amount_minor: 640000, reference: "" }]);
  assert.equal(r.summary.balance_minor, 0);
});

test("card, transfer and credit map to Usetally's methods; credit stays due", () => {
  const r = normalizeSale(base({ change_minor: 0, payments: [{ method: "card", amount_minor: 400000, reference: "MP1" }, { method: "credit", amount_minor: 240000 }] }));
  assert.deepEqual(r.sale.payments.map((p) => p.method), ["pos"]);
  assert.equal(r.summary.credit_minor, 240000);
  assert.equal(r.summary.balance_minor, 240000);
  assert.equal(normalizeSale(base({ change_minor: 0, payments: [{ method: "transfer", amount_minor: 640000 }] })).sale.payments[0].method, "bank_transfer");
});

test("weights with more than two decimals become one line of the full amount", () => {
  const r = normalizeSale(base({ items: [{ name: "Beef", quantity: 2.375, unit_price_minor: 400000 }], total_minor: 950000, change_minor: 0, payments: [{ method: "cash", amount_minor: 950000 }] }));
  assert.equal(r.sale.items[0].quantity, 1);
  assert.equal(r.sale.items[0].unit_price_minor, 950000);
  assert.match(r.sale.items[0].details, /2\.375/);
});

test("sales that don't add up, or are in the wrong currency, are refused", () => {
  assert.match(normalizeSale(base(), { currency: "USD" }).error, /NGN/);
  assert.ok(normalizeSale(base({ total_minor: 700000 })).error);
  assert.ok(normalizeSale(base({ change_minor: 0, payments: [{ method: "cash", amount_minor: 700000 }] })).error);
  assert.ok(normalizeSale(base({ items: [] })).error);
  assert.ok(normalizeSale(base({ items: [{ name: "x", quantity: 1, unit_price_minor: 1.5 }] })).error);
  assert.ok(normalizeSale(base({ payments: [{ method: "bitcoin", amount_minor: 1 }] })).error);
  assert.ok(normalizeSale(base({ id: "../etc" })).error);
  assert.ok(normalizeSale(base({ created_at: "2099-01-01T00:00:00Z" })).error);
});

test("a sale discount is worked out from TrackOja's total", () => {
  const r = normalizeSale(base({ total_minor: 600000, change_minor: 0, payments: [{ method: "cash", amount_minor: 600000 }] }));
  assert.equal(r.summary.discount_minor, 40000);
});

test("the catalog keeps only clean products", () => {
  const out = cleanCatalog({ products: [
    { id: "p1", name: " Peak  Milk ", sku: "FD", price_minor: 320000, stock_qty: 12, track_inventory: true },
    { id: "bad id!", name: "x", price_minor: 1 },
    { id: "p2", name: "", price_minor: 1 },
    { id: "p3", name: "Free", price_minor: -5 },
  ] });
  assert.deepEqual(out.map((p) => p.id), ["p1"]);
  assert.equal(out[0].name, "Peak Milk");
});
