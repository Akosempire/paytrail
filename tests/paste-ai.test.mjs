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
  assert.match(p, /Never invent an amount/);
});

const { moneyIn } = await import("../lib/paste-ai.js");
const OFFICE = "Good morning everyone, I heard that some people have started receiving their November allowances. Please, let's contribute 1,500 naira each so we can sort out the office internet subscription before Friday. Kindly send your contribution to my PalmPay account, 7012345678, account name Ibrahim Akorede. Also, James said we should remember that the meeting has been moved to Thursday, 19th November, by 10:30am at the conference room.";
test("money in a chatty message: amounts only, not account numbers, dates or times", () => {
  assert.deepEqual(moneyIn(OFFICE), [1500]);
  assert.deepEqual(moneyIn("Rice is 45k per bag, oil ₦12,500 each, delivery N 3,000. Call 08031234567"), [45000, 12500, 3000]);
  assert.deepEqual(moneyIn("Meeting 19th November 10:30am, room 204"), []);
});
test("a small model that misses the only price gets it filled from the message", () => {
  const r = readPasteAi('{"items":[{"description":"Contribution: office internet subscription","quantity":1,"unit_price":null}]}', OFFICE);
  assert.deepEqual(r.items, [{ description: "Contribution: office internet subscription", quantity: 1, price: 1500 }]);
  // more than one item or more than one amount: left for the person to fill in
  const two = readPasteAi('{"items":[{"description":"A","quantity":1,"unit_price":null},{"description":"B","quantity":1,"unit_price":null}]}', "A 1,500 naira, B 2,000 naira");
  assert.equal(two.items[0].price, null);
});
test("the instructions cover contributions and say account numbers aren't prices", () => {
  const p = pasteAiPrompt();
  assert.match(p, /contributions/);
  assert.match(p, /Account numbers, phone numbers, dates, times/);
});
