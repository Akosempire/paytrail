import test from "node:test";
import assert from "node:assert/strict";
import { parseItemList, parseLine, readAmount } from "../lib/paste-items.js";

const row = (s, o) => { const r = parseLine(s, o); return r && [r.description, r.quantity, r.price]; };

test("amounts", () => {
  assert.equal(readAmount("₦45,000"), 45000);
  assert.equal(readAmount("7.5k"), 7500);
  assert.equal(readAmount("1.2m"), 1200000);
  assert.equal(readAmount("N25000"), 25000);
  assert.equal(readAmount("$1,250.50"), 1250.5);
});

test("common WhatsApp list lines", () => {
  assert.deepEqual(row("2 x Rice 50kg - 45,000"), ["Rice 50kg", 2, 45000]);
  assert.deepEqual(row("Indomie carton ×5 @ 7.5k"), ["Indomie carton", 5, 7500]);
  assert.deepEqual(row("3 bags of cement = 16,500"), ["Bags of cement", 3, 5500]);
  assert.deepEqual(row("1. Website design – 150k"), ["Website design", 1, 150000]);
  assert.deepEqual(row("- Shoes (size 42) ₦25,000"), ["Shoes (size 42)", 1, 25000]);
  assert.deepEqual(row("Paint 4 litres 12500"), ["Paint 4 litres", 1, 12500]);
  assert.deepEqual(row("Rice 50kg x2 @ 45000"), ["Rice 50kg", 2, 45000]);
  assert.deepEqual(row("Logo design 50,000 each x 2"), ["Logo design", 2, 50000]);
  assert.deepEqual(row("5 pcs Ankara fabric"), ["Ankara fabric", 5, null]);
  assert.deepEqual(row("Chairs (10) 3,500 each"), ["Chairs", 10, 3500]);
  assert.deepEqual(row("2x Jollof rice pack"), ["Jollof rice pack", 2, null]);
});

test("chat prefixes, greetings and totals are dropped", () => {
  const list = parseItemList(`[27/10/2026, 08:57] Chioma: Good morning, here's my order
[27/10/2026, 08:57] Chioma: 2 x Rice 50kg - 45,000
27/10/2026, 08:58 - Chioma: Groundnut oil 5L ₦12,000
Total: 102,000
Thanks!`);
  assert.deepEqual(list.map((r) => [r.description, r.quantity, r.price]), [["Rice 50kg", 2, 45000], ["Groundnut oil 5L", 1, 12000]]);
});

test("line-total mode divides by quantity", () => {
  assert.deepEqual(row("2 x Rice 50kg - 90,000", { mode: "total" }), ["Rice 50kg", 2, 45000]);
  assert.deepEqual(row("Rice 50kg x2 @ 45000", { mode: "total" }), ["Rice 50kg", 2, 45000]);
});

test("phone numbers are not prices", () => {
  assert.deepEqual(row("Call me 08031234567"), ["Call me 08031234567", 1, null]);
});
