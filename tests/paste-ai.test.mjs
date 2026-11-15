import test from "node:test";
import assert from "node:assert/strict";
const { readPasteAi, pasteAiPrompt } = await import("../lib/paste-ai.js");

test("the AI's reply is checked: items, customer and notes", () => {
  const r = readPasteAi('Sure! ```json\n{"items":[{"description":" Rice 50kg ","quantity":"3","unit_price":"45k"},{"description":"Groundnut oil 5L","quantity":2,"unit_price":12500},{"description":"Delivery","quantity":1,"unit_price":3000},{"description":"Mystery","quantity":-2,"unit_price":"ask me"},{"description":"","quantity":1,"unit_price":5}],"customer":{"name":"Tunde","phone":"0803 123 4567","email":"Tunde@Mail.com"},"notes":"50% upfront"}\n```');
  assert.deepEqual(r.items, [
    { description: "Rice 50kg", quantity: 3, price: 45000 },
    { description: "Groundnut oil 5L", quantity: 2, price: 12500 },
    { description: "Delivery", quantity: 1, price: 3000 },
    { description: "Mystery", quantity: 1, price: null },
  ]);
  assert.deepEqual(r.customer, { name: "Tunde", phone: "0803 123 4567", email: "tunde@mail.com" });
  assert.equal(r.notes, "50% upfront");
});
test("unusable replies give null, so the simple reading is used", () => {
  assert.equal(readPasteAi("I couldn't find any items."), null);
  assert.equal(readPasteAi('{"items":[]}'), null);
  assert.equal(readPasteAi("{not json"), null);
  const r = readPasteAi('{"items":[{"description":"Logo","quantity":1,"unit_price":150000}],"customer":{"phone":"call me","email":"nope"}}');
  assert.deepEqual(r.customer, { name: "", phone: "", email: "" });
});
test("the instructions name the currency and forbid invented prices", () => {
  const p = pasteAiPrompt("GHS");
  assert.match(p, /plain number in GHS/);
  assert.match(p, /Never invent a price/);
});
