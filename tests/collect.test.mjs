import test from "node:test";
import assert from "node:assert/strict";
import { balanceOf, collectStatus, collectSummary, dueIn, relativeDay, reminderText, rowActions, urgencySort } from "../lib/collect-core.js";

const T = "2026-10-31";
const inv = (o = {}) => ({ kind: "invoice", status: "sent", number: "INV-1", total_minor: 100000, amount_paid_minor: 0, currency: "NGN", customer_name: "Chioma Obi", due_date: "2026-11-07", ...o });

test("status explains itself", () => {
  assert.deepEqual(collectStatus(inv(), T), { text: "Due in 7 days · not opened yet", tone: "info" });
  assert.deepEqual(collectStatus(inv({ status: "viewed", viewed_at: "2026-10-30T10:00:00Z" }), T), { text: "Viewed yesterday, not paid", tone: "warn" });
  assert.deepEqual(collectStatus(inv({ due_date: "2026-10-28" }), T), { text: "3 days overdue", tone: "danger" });
  assert.deepEqual(collectStatus(inv({ due_date: "2026-10-30" }), T), { text: "1 day overdue", tone: "danger" });
  assert.equal(collectStatus(inv({ due_date: T }), T).text, "Due today");
  assert.equal(collectStatus(inv({ due_date: "2026-11-01" }), T).text, "Due tomorrow");
  assert.equal(collectStatus(inv({ status: "draft" }), T).text, "Draft · not sent");
  assert.equal(collectStatus(inv({ status: "partially_paid", amount_paid_minor: 1 }), T).text, "Part paid · due in 7 days");
  assert.equal(collectStatus(inv({ status: "paid", paid_at: "2026-10-31T08:00:00Z" }), T).text, "Paid today");
});

test("chase order: overdue first, then due soonest, then largest", () => {
  const list = urgencySort([
    inv({ number: "A", due_date: "2026-11-20", total_minor: 9e6 }),
    inv({ number: "B", due_date: "2026-10-20" }),
    inv({ number: "C", due_date: "2026-11-02" }),
    inv({ number: "D", due_date: "2026-11-02", total_minor: 5e6 }),
    inv({ number: "E", due_date: null }),
    inv({ number: "F", due_date: "2026-10-29" }),
  ], T);
  assert.deepEqual(list.map((d) => d.number), ["B", "F", "D", "C", "A", "E"]);
});

test("summary and reminder text", () => {
  const s = collectSummary([inv({ total_minor: 600000000, customer_id: "a" }), inv({ total_minor: 330000000, customer_id: "b", due_date: "2026-11-06" }), inv({ status: "paid" })], T, "NGN");
  assert.equal(s.count, 2);
  assert.equal(s.total, 930000000);
  assert.match(s.text, /^₦9,300,000 owed by 2 customers\. Next due 6 Nov\.$/);
  assert.equal(collectSummary([], T, "NGN").text, "Nothing owed to you right now.");
  const r = reminderText(inv({ due_date: "2026-10-28" }), "Mikky", "https://usetally.cc/d/x", T);
  assert.match(r, /^Hello Chioma, a friendly reminder that invoice INV-1 from Mikky for ₦1,000 was due 28 Oct 2026\. You can view and pay it here: https:\/\/usetally\.cc\/d\/x/);
});

test("helpers", () => {
  assert.equal(balanceOf(inv({ amount_paid_minor: 40000 })), 60000);
  assert.equal(dueIn(inv({ due_date: null }), T), null);
  assert.equal(relativeDay("2026-10-27", T), "4 days ago");
  assert.deepEqual(rowActions(inv({ status: "draft" })), ["send", "edit"]);
  assert.deepEqual(rowActions(inv({ status: "viewed" })), ["remind", "record"]);
  assert.deepEqual(rowActions(inv({ status: "paid" })), ["receipt"]);
});

test("invoices list helpers", async () => {
  const { compactMoney, defaultInvoiceTab, sortForTab, invoicesCsv } = await import("../lib/collect-core.js");
  assert.equal(compactMoney(930000000, "NGN"), "₦9.3M");
  assert.equal(compactMoney(45000000, "NGN"), "₦450K");
  assert.equal(compactMoney(80000, "NGN"), "₦800");
  assert.equal(compactMoney(0, "NGN"), "₦0");
  assert.equal(compactMoney(125000, "USD"), "$1.3K");
  assert.equal(defaultInvoiceTab("", 2), "open");
  assert.equal(defaultInvoiceTab("", 0), "all");
  assert.equal(defaultInvoiceTab("paid", 2), "paid");
  const rows = [inv({ number: "A", created_at: "2026-10-01", paid_at: "2026-10-05" }), inv({ number: "B", created_at: "2026-10-09", paid_at: "2026-10-02", due_date: "2026-10-20" })];
  assert.deepEqual(sortForTab(rows, "open", T).map((d) => d.number), ["B", "A"]);
  assert.deepEqual(sortForTab(rows, "drafts", T).map((d) => d.number), ["B", "A"]);
  assert.deepEqual(sortForTab(rows, "paid", T).map((d) => d.number), ["A", "B"]);
  const csv = invoicesCsv([inv({ title: 'Logo, "big"', customer_company: "=SUM(A1)", amount_paid_minor: 40000 })]);
  assert.match(csv, /^Number,Customer,/);
  assert.match(csv, /"Logo, ""big"""/);
  assert.match(csv, /"'=SUM\(A1\)"/);
  assert.match(csv, /,1000\.00,400\.00,600\.00\r\n$/);
});
