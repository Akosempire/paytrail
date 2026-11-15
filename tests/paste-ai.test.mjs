import test from "node:test";
import assert from "node:assert/strict";
const { checkPasteAi, fillLonePrice, numbersIn, parseJson, pasteAiPrompt, readPasteAi, repairPrompt } = await import("../lib/paste-ai.js");

const OFFICE = "Good morning everyone, I heard that some people have started receiving their November allowances. Please, let's contribute 1,500 naira each so we can sort out the office internet subscription before Friday. Kindly send your contribution to my PalmPay account, 7012345678, account name Ibrahim Akorede. Also, James said we should remember that the meeting has been moved to Thursday, 19th November, by 10:30am at the conference room.";
const SHOOT = "Hi Kemi, as discussed: 3 hours of photography at 25k per hour plus 2 printed albums, 40,000 for both. You already sent 30k on 2nd May, balance by Friday. Acct 0123456789. Total 115k. - Tunde";

test("numbers that could be money: not accounts, phones, times, dates or years", () => {
  assert.deepEqual(numbersIn(OFFICE), [1500]);
  assert.deepEqual(numbersIn(SHOOT), [3, 25000, 2, 40000, 30000, 115000]);
  assert.deepEqual(numbersIn("Meeting 19th November at 10:30am, May 2, 4pm, in 2026. Call 08031234567"), []);
  assert.deepEqual(numbersIn("₦12,500 and N 3,000 and 1.2m"), [12500, 3000, 1200000]);
});

test("a good answer passes with no problems; line totals become prices for one", () => {
  const { result, problems } = checkPasteAi({
    understanding: "Tunde is billing Kemi for photography and albums.",
    numbers: [{ text: "25k per hour", value: 25000, kind: "price" }, { text: "40,000 for both", value: 40000, kind: "line_total" }, { text: "sent 30k", value: 30000, kind: "already_paid" }, { text: "Total 115k", value: 115000, kind: "order_total" }],
    items: [{ description: "Photography (per hour)", quantity: 3, unit_price: 25000 }, { description: "Printed album", quantity: 2, unit_price: 20000 }],
    customer: { name: "Kemi" }, notes: "30k already paid",
  }, SHOOT);
  assert.deepEqual(problems, []);
  assert.equal(result.understanding, "Tunde is billing Kemi for photography and albums.");
  assert.deepEqual(result.items.map((i) => [i.description, i.quantity, i.price, i.check]), [["Photography (per hour)", 3, 25000, undefined], ["Printed album", 2, 20000, undefined]]);
});

test("made-up amounts, and totals or payments used as prices, are caught", () => {
  const { result, problems } = checkPasteAi({
    numbers: [{ text: "sent 30k", value: 30000, kind: "already_paid" }, { text: "Total 115k", value: 115000, kind: "order_total" }],
    items: [{ description: "Photography", quantity: 1, unit_price: 99000 }, { description: "Deposit", quantity: 1, unit_price: 30000 }, { description: "Everything", quantity: 1, unit_price: 115000 }],
  }, SHOOT);
  assert.equal(result.items[0].check, "This amount isn't in the message");
  assert.match(result.items[1].check, /already paid/);
  assert.match(result.items[2].check, /order total/);
  assert.equal(problems.length, 3);
  assert.match(repairPrompt(problems), /99000, which isn't a number in the message/);
});

test("a price the model found but didn't use is sent back as a problem", () => {
  const { problems } = checkPasteAi({
    numbers: [{ text: "1,500 naira each", value: 1500, kind: "price" }, { text: "7012345678", value: 7012345678, kind: "account_or_phone" }],
    items: [{ description: "Contribution: office internet", quantity: 1, unit_price: null }],
  }, OFFICE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"1,500 naira each" as prices but no line uses it, while "Contribution: office internet" has no price/);
});

test("last resort: one unpriced line and one amount in the message, flagged for checking", () => {
  const r = fillLonePrice({ understanding: "", items: [{ description: "Internet contribution", quantity: 1, price: null }], customer: {}, notes: "" }, OFFICE);
  assert.deepEqual(r.items[0], { description: "Internet contribution", quantity: 1, price: 1500, check: "Price taken from the message: check it" });
  const two = fillLonePrice({ items: [{ description: "A", quantity: 1, price: null }] }, "A 1,500 naira or 2,000 naira");
  assert.equal(two.items[0].price, null, "two amounts: left for the person");
});

test("unusable replies give null, so the simple reading is used", () => {
  assert.equal(parseJson("I couldn't find any items."), null);
  assert.equal(readPasteAi('{"items":[]}', "hello"), null);
  assert.equal(readPasteAi("{not json", "hello"), null);
  const r = readPasteAi('Sure: {"items":[{"description":"Logo","quantity":1,"unit_price":"150k"}],"customer":{"phone":"call me","email":"nope"}}', "Logo 150k");
  assert.deepEqual(r.items, [{ description: "Logo", quantity: 1, price: 150000 }]);
  assert.deepEqual(r.customer, { name: "", phone: "", email: "" });
});

test("the instructions: think about every number first, never invent, currency named", () => {
  const p = pasteAiPrompt("GHS");
  assert.match(p, /list EVERY number/);
  assert.match(p, /Never invent amounts/);
  assert.match(p, /in GHS/);
});

const BRIEF = "Hi, we are opening a new restaurant in Abuja next month and need a logo and brand colours. We also need about 5 promotional flyers for our opening campaign.\n\nFor the menu, we have approximately 35 food and drink items. We want both a printable version and a digital version that customers can access through a QR code. Our opening is scheduled for December 12, so we need the designs completed before December 5. We have allocated ₦450,000 for the entire project. Let me know if this is something you can handle.";
test("a brief with one budget for the whole job: one line at the budget, scope in details", () => {
  assert.deepEqual(numbersIn(BRIEF), [5, 35, 450000]);
  const { result, problems } = checkPasteAi({
    understanding: "A new Abuja restaurant wants branding, flyers and a menu for ₦450,000 in total.",
    numbers: [{ text: "5 promotional flyers", value: 5, kind: "quantity" }, { text: "35 food and drink items", value: 35, kind: "quantity" }, { text: "December 12", value: 12, kind: "date_or_time" }, { text: "₦450,000 for the entire project", value: 450000, kind: "budget" }],
    items: [{ description: "Restaurant branding project", details: "Logo and brand colours; 5 promotional flyers; menu design (35 items, print and QR)", quantity: 1, unit_price: 450000 }],
    notes: "Designs needed before 5 December",
  }, BRIEF);
  assert.deepEqual(problems, []);
  assert.deepEqual(result.items, [{ description: "Restaurant branding project", details: "Logo and brand colours; 5 promotional flyers; menu design (35 items, print and QR)", quantity: 1, price: 450000 }]);
});
test("the budget left out while lines have no price is sent back to fix", () => {
  const { problems } = checkPasteAi({
    numbers: [{ text: "₦450,000 for the entire project", value: 450000, kind: "budget" }],
    items: [{ description: "Logo", quantity: 1, unit_price: null }, { description: "Flyers", quantity: 5, unit_price: null }],
  }, BRIEF);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /450,000 for the entire project/);
});
test("JSON in code fences or with trailing commas still reads", () => {
  assert.deepEqual(parseJson('```json\n{"items":[{"description":"A","quantity":1,},],}\n```'), { items: [{ description: "A", quantity: 1 }] });
});
