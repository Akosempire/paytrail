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

test("views and the send checklist", async () => {
  const { viewStats, viewText, sendChecklist } = await import("../lib/collect-core.js");
  const s = viewStats([{ action: "document.viewed", created_at: "2026-10-29T10:00:00Z" }, { action: "document.sent", created_at: "2026-10-28T10:00:00Z" }, { action: "document.viewed", created_at: "2026-10-30T09:00:00Z" }]);
  assert.deepEqual(s, { count: 2, last: "2026-10-30T09:00:00Z" });
  assert.equal(viewText(s, T), "Opened 2× · last yesterday");
  assert.equal(viewText({ count: 0, last: null }, T), "Not opened yet");
  assert.equal(viewText(viewStats([], "2026-10-31T08:00:00Z"), T), "Opened today");
  const c = sendChecklist(inv({ status: "draft", customer_email: null, customer_phone: null }), [{ description: "Logo" }], {});
  assert.deepEqual(c.filter((x) => !x.ok).map((x) => x.key), ["reach", "pay"]);
  assert.equal(sendChecklist(inv({ kind: "quote" }), [], {}).length, 3);
});
