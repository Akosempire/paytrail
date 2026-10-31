import test from "node:test";
import assert from "node:assert/strict";
import { addDaysIso, dueSentence, evalQty, formatAmountInput, missingStep, qtyValue, rankCustomers, suggestEmail, unformatAmountInput } from "../lib/builder-core.js";

test("quantity maths without eval", () => {
  assert.equal(evalQty("3*8"), 24);
  assert.equal(evalQty("2.5 + 1"), 3.5);
  assert.equal(evalQty("(4+2)/3"), 2);
  assert.equal(evalQty("10 x 3"), 30);
  assert.equal(evalQty("7"), 7);
  assert.equal(evalQty("1/3"), 0.33);
  assert.equal(evalQty("2**3"), null);
  assert.equal(evalQty("alert(1)"), null);
  assert.equal(evalQty("4/0"), null);
  assert.equal(evalQty("3+"), null);
  assert.equal(qtyValue("-2"), 0);
  assert.equal(qtyValue(""), 0);
});

test("amounts format for reading and unformat for editing", () => {
  assert.equal(formatAmountInput("150000"), "150,000.00");
  assert.equal(formatAmountInput("1500.5"), "1,500.50");
  assert.equal(formatAmountInput("1,500"), "1,500.00");
  assert.equal(formatAmountInput("abc"), "abc");
  assert.equal(unformatAmountInput("150,000.00"), "150000");
  assert.equal(unformatAmountInput("1,500.50"), "1500.50");
});

test("due dates read as a sentence", () => {
  assert.equal(addDaysIso("2026-10-31", 14), "2026-11-14");
  assert.equal(dueSentence("2026-11-14", "2026-10-31"), "Due in 14 days · Sat 14 Nov");
  assert.equal(dueSentence("2026-10-31", "2026-10-31", { issueIso: "2026-10-31" }), "Due on receipt · Sat 31 Oct");
  assert.equal(dueSentence("2026-10-31", "2026-10-31"), "Due today · Sat 31 Oct");
  assert.equal(dueSentence("2026-10-28", "2026-10-31"), "Was due 3 days ago · Wed 28 Oct");
  assert.equal(dueSentence("2026-11-30", "2026-10-31", { quote: true }), "Valid for 30 days · until Mon 30 Nov");
});

test("common email typos get a suggestion; good emails don't", () => {
  assert.equal(suggestEmail("ade@gmial.com"), "ade@gmail.com");
  assert.equal(suggestEmail("ade@gmail.con"), "ade@gmail.com");
  assert.equal(suggestEmail("ade@yaho.com"), "ade@yahoo.com");
  assert.equal(suggestEmail("ade@hotmial.com"), "ade@hotmail.com");
  assert.equal(suggestEmail("ade@gmail"), "ade@gmail.com");
  assert.equal(suggestEmail("ade@gmail.com"), null);
  assert.equal(suggestEmail("ade@adefoods.ng"), null);
  assert.equal(suggestEmail("not-an-email"), null);
});

test("the send button names the missing step", () => {
  assert.equal(missingStep({ hasCustomer: false, items: [] }).label, "Add a customer to send");
  assert.equal(missingStep({ hasCustomer: true, items: [{ description: " " }] }).field, "item-0-desc");
  assert.equal(missingStep({ hasCustomer: true, items: [{ description: "Logo" }], badPrice: 0 }), null);
  assert.equal(missingStep({ hasCustomer: true, items: [{ description: "Logo" }], badPrice: "1" }).label, "Fix a price to send");
  assert.equal(missingStep({ hasCustomer: false, customerName: "Ade", items: [] }).step, "items");
  assert.equal(missingStep({ hasCustomer: false, items: [], approval: true }).label, "Add a customer to submit");
});

test("customers: recent first, then A–Z, searchable", () => {
  const list = [{ id: "a", name: "Zed" }, { id: "b", name: "Ade Foods", email: "ade@x.ng" }, { id: "c", name: "Bisi" }];
  assert.deepEqual(rankCustomers(list, "", ["c"]).map((c) => c.id), ["c", "b", "a"]);
  assert.deepEqual(rankCustomers(list, "ade@").map((c) => c.id), ["b"]);
});
